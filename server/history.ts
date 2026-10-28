import { z } from "zod";
import { id, now, type Row } from "./store.ts";
import { requireThat, type Actor, type Service } from "./service.ts";
import { contextTerms, historyExcerpt, recentContext } from "./context.ts";

export const scopeSchema = z.object({
  kind: z.enum(["office", "lounge", "meeting", "direct"]),
  meetingId: z.string().optional(),
  conversationId: z.string().optional(),
});
export type ChatScope = z.infer<typeof scopeSchema>;
type Thread = ChatScope & {
  key: string;
  projectId: string;
  table: string;
  where: string;
  params: unknown[];
  canManage: boolean;
  ownerId: string | null;
  targetId: string | null;
};

export class History {
  constructor(private service: Service) {}
  get store() {
    return this.service.store;
  }

  resolve(actor: Actor, projectId: string, input: unknown): Thread {
    this.service.project(actor, projectId);
    const scope = scopeSchema.parse(input);
    const owner =
      this.store.one("SELECT owner_id FROM projects WHERE id=?", projectId)!
        .owner_id === actor.userId;
    let table = "messages",
      where = "m.project_id=? AND m.meeting_id IS NULL",
      params: unknown[] = [projectId];
    let targetId: string | null = null,
      ownerId: string | null = null,
      canManage = owner;
    if (scope.kind === "office") {
      table = "office_messages";
      where = "m.project_id=? AND m.owner_id=?";
      params = [projectId, actor.userId];
      ownerId = actor.userId;
      canManage = true;
    } else if (scope.kind === "meeting") {
      requireThat(scope.meetingId, 400, "A meeting is required");
      const meeting = this.service.meeting(actor, projectId, scope.meetingId);
      targetId = meeting.id;
      where = "m.project_id=? AND m.meeting_id=?";
      params = [projectId, targetId];
      canManage = owner || meeting.creator_id === actor.userId;
    } else if (scope.kind === "direct") {
      requireThat(scope.conversationId, 400, "A conversation is required");
      const conversation = this.service.conversations.conversation(
        actor,
        projectId,
        scope.conversationId,
      );
      table = "direct_messages";
      where = "m.conversation_id=?";
      params = [conversation.id];
      targetId = conversation.id;
      canManage = conversation.user_id === actor.userId;
    }
    return {
      ...scope,
      key: JSON.stringify([projectId, scope.kind, ownerId ?? targetId ?? ""]),
      projectId,
      table,
      where,
      params,
      canManage: actor.type === "human" && canManage,
      ownerId,
      targetId,
    };
  }

  private rows(
    thread: Thread,
    after = 0,
    before = Number.MAX_SAFE_INTEGER,
    limit = 200,
    descending = false,
  ): Row[] {
    return this.store.all(
      `SELECT m.*,m.rowid sequence,r.reason redaction_reason,r.created_at redacted_at FROM ${thread.table} m LEFT JOIN chat_redactions r ON r.thread_key=? AND r.message_id=m.id WHERE ${thread.where} AND m.rowid>? AND m.rowid<? ORDER BY m.rowid ${descending ? "DESC" : "ASC"} LIMIT ?`,
      thread.key,
      ...thread.params,
      after,
      before,
      limit,
    );
  }

  private decorate(actor: Actor, thread: Thread, row: Row): Row {
    const owned =
      row.actor_type === "human"
        ? row.actor_id === actor.id
        : !!this.store.one(
            "SELECT 1 FROM agents WHERE id=? AND project_id=? AND owner_id=?",
            row.actor_id,
            thread.projectId,
            actor.userId,
          );
    return {
      ...row,
      body: row.redacted_at ? "" : row.body,
      canWithdraw: actor.type === "human" && owned && !row.redacted_at,
      hidden:
        actor.type === "human" &&
        !!this.store.one(
          "SELECT 1 FROM chat_hidden WHERE viewer_id=? AND thread_key=? AND message_id=?",
          actor.id,
          thread.key,
          row.id,
        ),
    };
  }

  decorateRows(actor: Actor, projectId: string, scope: ChatScope, rows: Row[]) {
    const thread = this.resolve(actor, projectId, scope);
    return rows
      .map((row) => {
        const redaction = this.store.one(
          "SELECT reason redaction_reason,created_at redacted_at FROM chat_redactions WHERE thread_key=? AND message_id=?",
          thread.key,
          row.id,
        );
        return this.decorate(actor, thread, { ...row, ...redaction });
      })
      .filter((row) => !row.hidden);
  }

  page(actor: Actor, projectId: string, input: unknown) {
    const data = scopeSchema
      .extend({
        before: z.string().max(512).optional(),
        beforeMessage: z.string().optional(),
        onlyHidden: z.enum(["true", "false"]).default("false"),
        around: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        includeHidden: z.enum(["true", "false"]).default("false"),
      })
      .parse(input);
    const thread = this.resolve(actor, projectId, data);
    let before = Number.MAX_SAFE_INTEGER;
    if (data.beforeMessage) {
      const source = this.store.one(
        `SELECT m.rowid sequence FROM ${thread.table} m WHERE ${thread.where} AND m.id=?`,
        ...thread.params,
        data.beforeMessage,
      );
      requireThat(source, 404, "Message not found");
      before = source.sequence;
    }
    if (data.before) {
      let cursor: any;
      try {
        cursor = JSON.parse(
          Buffer.from(data.before, "base64url").toString("utf8"),
        );
      } catch {
        requireThat(false, 400, "Invalid history cursor");
      }
      requireThat(
        cursor?.key === thread.key &&
          Number.isSafeInteger(cursor.sequence) &&
          cursor.sequence > 0,
        400,
        "Invalid history cursor",
      );
      before = cursor.sequence;
    }
    if (data.around) {
      const source = this.store.one(
        `SELECT m.rowid sequence FROM ${thread.table} m WHERE ${thread.where} AND m.id=?`,
        ...thread.params,
        data.around,
      );
      requireThat(source, 404, "Message not found");
      const newer = this.rows(
        thread,
        source.sequence - 1,
        Number.MAX_SAFE_INTEGER,
        Math.ceil(data.limit / 2),
      );
      before = (newer.at(-1)?.sequence ?? source.sequence) + 1;
    }
    // Apply per-viewer visibility BEFORE the page limit, not after it.
    const hidden =
      actor.type === "human" &&
      (data.onlyHidden === "true" || data.includeHidden !== "true")
        ? `AND ${data.onlyHidden === "true" ? "" : "NOT "}EXISTS(SELECT 1 FROM chat_hidden h WHERE h.viewer_id=? AND h.thread_key=? AND h.message_id=m.id)`
        : "";
    const rows = this.store.all(
      `SELECT m.*,m.rowid sequence,r.reason redaction_reason,r.created_at redacted_at FROM ${thread.table} m LEFT JOIN chat_redactions r ON r.thread_key=? AND r.message_id=m.id WHERE ${thread.where} AND m.rowid<? ${hidden} ORDER BY m.rowid DESC LIMIT ?`,
      thread.key,
      ...thread.params,
      before,
      ...(hidden ? [actor.id, thread.key] : []),
      data.limit + 1,
    );
    const more = rows.length > data.limit,
      items = rows
        .slice(0, data.limit)
        .reverse()
        .map((row) => this.decorate(actor, thread, row));
    return {
      items,
      hasMore: more,
      nextBefore: more
        ? Buffer.from(
            JSON.stringify({ key: thread.key, sequence: items[0].sequence }),
          ).toString("base64url")
        : null,
      canManage: thread.canManage,
      retentionDays:
        this.store.one(
          "SELECT days FROM chat_policies WHERE thread_key=?",
          thread.key,
        )?.days ?? 0,
      preference: this.preference(actor, thread),
    };
  }

  private preference(actor: Actor, thread: Thread) {
    const row = this.store.one(
      "SELECT group_name,archived FROM chat_preferences WHERE viewer_id=? AND thread_key=?",
      actor.userId,
      thread.key,
    );
    return {
      group_name: String(row?.group_name ?? ""),
      archived: Number(row?.archived ?? 0),
    };
  }

  threads(actor: Actor, projectId: string) {
    this.service.project(actor, projectId);
    const scopes: (ChatScope & { title: string })[] = [
      { kind: "office", title: "" },
      { kind: "lounge", title: "" },
    ];
    const meetings =
      actor.type === "agent"
        ? this.store.all(
            "SELECT m.* FROM meetings m JOIN participants p ON p.meeting_id=m.id WHERE m.project_id=? AND p.agent_id=?",
            projectId,
            actor.id,
          )
        : this.store.all(
            "SELECT * FROM meetings WHERE project_id=?",
            projectId,
          );
    scopes.push(
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        meetingId: meeting.id,
        title: meeting.title,
      })),
    );
    scopes.push(
      ...this.service.conversations
        .list(actor, projectId)
        .map((conversation) => ({
          kind: "direct" as const,
          conversationId: conversation.id,
          title: `${conversation.user_name} → ${conversation.agent_name}`,
        })),
    );
    return scopes.map((scope) => {
      const thread = this.resolve(actor, projectId, scope);
      return { ...scope, ...this.preference(actor, thread) };
    });
  }

  preferences(actor: Actor, projectId: string, input: unknown) {
    this.service.human(actor);
    const data = scopeSchema
      .extend({
        groupName: z.string().trim().max(60),
        archived: z.boolean(),
        retentionDays: z.number().int().min(0).max(3650).optional(),
      })
      .parse(input);
    const thread = this.resolve(actor, projectId, data);
    if (data.retentionDays !== undefined)
      requireThat(
        thread.canManage,
        403,
        "Only the conversation manager can change retention",
      );
    this.store.transaction(() => {
      this.store.run(
        "INSERT INTO chat_preferences VALUES(?,?,?,?) ON CONFLICT(viewer_id,thread_key) DO UPDATE SET group_name=excluded.group_name,archived=excluded.archived",
        actor.id,
        thread.key,
        data.groupName,
        Number(data.archived),
      );
      if (data.retentionDays !== undefined)
        this.store.run(
          "INSERT INTO chat_policies VALUES(?,?,?,?,?,?) ON CONFLICT(thread_key) DO UPDATE SET days=excluded.days",
          thread.key,
          projectId,
          thread.kind,
          thread.targetId,
          thread.ownerId,
          data.retentionDays,
        );
    });
    return { ok: true };
  }

  changeMessage(
    actor: Actor,
    projectId: string,
    messageId: string,
    input: unknown,
  ) {
    this.service.human(actor);
    const data = scopeSchema
      .extend({ action: z.enum(["hide", "restore", "withdraw"]) })
      .parse(input);
    const thread = this.resolve(actor, projectId, data);
    const row = this.store.one(
      `SELECT m.* FROM ${thread.table} m WHERE ${thread.where} AND m.id=?`,
      ...thread.params,
      messageId,
    );
    requireThat(row, 404, "Message not found");
    if (data.action === "withdraw") {
      requireThat(
        this.decorate(actor, thread, row).canWithdraw,
        403,
        "You can only withdraw your own messages",
      );
      this.store.transaction(() => this.redact(thread, row.id, "withdrawn"));
      this.service.events.emit(projectId); // Wake leases/polls without retaining a second copy of the body.
    } else if (data.action === "hide")
      this.store.run(
        "INSERT OR IGNORE INTO chat_hidden VALUES(?,?,?)",
        actor.id,
        thread.key,
        row.id,
      );
    else
      this.store.run(
        "DELETE FROM chat_hidden WHERE viewer_id=? AND thread_key=? AND message_id=?",
        actor.id,
        thread.key,
        row.id,
      );
    return { ok: true };
  }

  private redact(thread: Thread, messageId: string, reason: string) {
    this.store.run(`UPDATE ${thread.table} SET body='' WHERE id=?`, messageId);
    this.store.run(
      "INSERT OR IGNORE INTO chat_redactions VALUES(?,?,?,?)",
      thread.key,
      messageId,
      reason,
      now(),
    );
    this.store.run(
      "UPDATE events SET payload=json_set(json_remove(payload,'$.body'),'$.redacted',1) WHERE project_id=? AND json_extract(payload,'$.id')=? AND kind IN ('message.created','office.message')",
      thread.projectId,
      messageId,
    );
    this.store.run("DELETE FROM chat_summaries WHERE thread_key=?", thread.key);
    if (thread.kind === "direct")
      this.store.run(
        "UPDATE agent_requests SET status='failed',lease_id=NULL,claimed_at=NULL WHERE conversation_id=? AND (status='processing' OR (message_id=? AND status='queued'))",
        thread.targetId,
        messageId,
      );
    if (thread.kind === "meeting")
      this.store.run(
        "UPDATE agent_requests SET status='failed',lease_id=NULL,claimed_at=NULL WHERE meeting_id=? AND (status='processing' OR (message_id=? AND status='queued'))",
        thread.targetId,
        messageId,
      );
  }

  context(actor: Actor, projectId: string, input: unknown) {
    const data = scopeSchema
      .extend({
        question: z.string().trim().min(1).max(12000).optional(),
        messageId: z.string().optional(),
      })
      .parse(input);
    const thread = this.resolve(actor, projectId, data);
    const source = this.store.one(
      `SELECT m.*,m.rowid sequence FROM ${thread.table} m WHERE ${thread.where} AND m.body<>'' ${data.messageId ? "AND m.id=?" : ""} ORDER BY m.rowid DESC LIMIT 1`,
      ...thread.params,
      ...(data.messageId ? [data.messageId] : []),
    );
    if (data.messageId) requireThat(source, 404, "Message not found");
    if (!source) return { messages: [], memory: [] };
    const recent = this.rows(
      thread,
      0,
      source.sequence + 1,
      30,
      true,
    ).reverse();
    return {
      messages: recentContext(recent, source),
      memory: this.retrieve(
        actor,
        projectId,
        data,
        data.question ?? source.body,
        recent,
        source.sequence,
      ),
    };
  }

  retrieve(
    actor: Actor,
    projectId: string,
    input: unknown,
    question: string,
    recent: Row[],
    triggerSequence: number,
  ) {
    const thread = this.resolve(actor, projectId, input);
    const before = Math.min(
      triggerSequence,
      ...recent.map((row) => Number(row.sequence)).filter(Number.isFinite),
    );
    const primary = contextTerms(question);
    const terms = [
      ...new Set([
        ...primary,
        ...contextTerms(
          recent
            .filter((row) => row.actor_type === "human")
            .slice(-6)
            .reverse()
            .map((row) => row.body)
            .join("\n"),
        ),
      ]),
    ].slice(0, 32);
    const anchors = this.store.all(
      `SELECT m.*,m.rowid sequence FROM ${thread.table} m WHERE ${thread.where} AND m.rowid<? AND m.body<>'' AND m.actor_type='human' ORDER BY m.rowid DESC LIMIT 2`,
      ...thread.params,
      before,
    );
    const candidates = terms.length
      ? this.store.all(
          `SELECT * FROM (SELECT m.*,m.rowid sequence,(${terms.map(() => "CASE WHEN instr(lower(m.body),?)>0 THEN ? ELSE 0 END").join("+")}) context_score FROM ${thread.table} m WHERE ${thread.where} AND m.rowid<? AND m.body<>'') WHERE context_score>0 ORDER BY context_score DESC,sequence DESC LIMIT 40`,
          ...terms.flatMap((term) => [term, primary.includes(term) ? 3 : 1]),
          ...thread.params,
          before,
        )
      : [];
    const ranked = candidates
      .map((row) => ({
        row,
        score: terms.reduce(
          (score, term) =>
            score +
            (String(row.body).toLowerCase().includes(term)
              ? primary.includes(term)
                ? 3
                : 1
              : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || b.row.sequence - a.row.sequence);
    const selected = new Map<string, Row>();
    for (const { row } of ranked.slice(0, 5)) selected.set(row.id, row);
    for (const row of anchors) selected.set(row.id, row);
    const extracts = [...selected.values()]
      .sort((a, b) => a.sequence - b.sequence)
      .map((row) => historyExcerpt(row, terms, 800));
    return extracts.length ? [{ method: "retrieval", extracts }] : [];
  }

  summaries(
    actor: Actor,
    projectId: string,
    input: unknown,
    beforeSequence = Number.MAX_SAFE_INTEGER,
  ) {
    const thread = this.resolve(actor, projectId, input);
    // Durable extractive chapters of 40 messages; the most recent 30 remain raw model context.
    const recent = this.rows(thread, 0, beforeSequence, 30, true);
    const cutoff = recent.length === 30 ? recent.at(-1)!.sequence : 0;
    let after =
      this.store.one(
        "SELECT max(last_sequence) n FROM chat_summaries WHERE thread_key=? AND last_sequence<?",
        thread.key,
        cutoff,
      )?.n ?? 0;
    for (let chapter = 0; chapter < 100; chapter++) {
      const rows = this.rows(thread, after, cutoff, 40);
      if (rows.length < 40) break;
      const available = rows.filter((row) => !row.redacted_at && row.body);
      const chosen = available
        .filter(
          (_row, index) =>
            index === 0 ||
            index === available.length - 1 ||
            index % 5 === 0 ||
            /决定|确认|待办|结论|风险|decision|todo|agree|risk/i.test(
              available[index].body,
            ),
        )
        .slice(0, 14);
      const extracts = chosen.map((row) => ({
        messageId: row.id,
        name: row.actor_name,
        quote: row.body.replace(/\s+/g, " ").slice(0, 200),
        createdAt: row.created_at,
      }));
      this.store.run(
        "INSERT INTO chat_summaries VALUES(?,?,?,?,?,?,?)",
        id(),
        thread.key,
        rows[0].sequence,
        rows.at(-1)!.sequence,
        rows.length,
        JSON.stringify(extracts),
        now(),
      );
      after = rows.at(-1)!.sequence;
    }
    return this.store
      .all(
        "SELECT * FROM chat_summaries WHERE thread_key=? AND last_sequence<? ORDER BY last_sequence DESC LIMIT 50",
        thread.key,
        cutoff,
      )
      .map((summary) => ({
        id: summary.id as string,
        first_sequence: summary.first_sequence as number,
        last_sequence: summary.last_sequence as number,
        source_count: summary.source_count as number,
        created_at: summary.created_at as string,
        extracts: JSON.parse(summary.extracts),
        method: "extractive",
      }));
  }

  *export(actor: Actor, projectId: string, input: unknown) {
    const data = scopeSchema
      .extend({ format: z.enum(["json", "md"]).default("json") })
      .parse(input);
    const thread = this.resolve(actor, projectId, data);
    yield data.format === "json"
      ? '{"version":1,"messages":['
      : "# CoNest chat export\n\n";
    let after = 0,
      first = true;
    while (true) {
      const rows = this.rows(thread, after, Number.MAX_SAFE_INTEGER, 100);
      if (!rows.length) break;
      this.resolve(actor, projectId, data);
      for (const row of rows) {
        const message = this.decorate(actor, thread, row);
        if (message.hidden) continue;
        yield data.format === "json"
          ? (first ? "" : ",") + JSON.stringify(message)
          : `## ${row.created_at} · ${String(row.actor_name).replace(/[\r\n]/g, " ")}\n\n${
              message.redacted_at
                ? "[" + message.redaction_reason + "]"
                : message.body
                    .split("\n")
                    .map((line: string) => "> " + line)
                    .join("\n")
            }\n\n`;
        first = false;
      }
      after = rows.at(-1)!.sequence;
    }
    yield data.format === "json" ? "]}" : "";
  }

  maintain(time = Date.now()) {
    let redacted = 0;
    for (const policy of this.store.all(
      "SELECT * FROM chat_policies WHERE days>0",
    )) {
      const table =
        policy.kind === "office"
          ? "office_messages"
          : policy.kind === "direct"
            ? "direct_messages"
            : "messages";
      const where =
        policy.kind === "office"
          ? "m.project_id=? AND m.owner_id=?"
          : policy.kind === "direct"
            ? "m.conversation_id=?"
            : policy.kind === "meeting"
              ? "m.project_id=? AND m.meeting_id=?"
              : "m.project_id=? AND m.meeting_id IS NULL";
      const params =
        policy.kind === "office"
          ? [policy.project_id, policy.owner_id]
          : policy.kind === "direct"
            ? [policy.target_id]
            : policy.kind === "meeting"
              ? [policy.project_id, policy.target_id]
              : [policy.project_id];
      const rows = this.store.all(
        `SELECT m.id FROM ${table} m WHERE ${where} AND m.created_at<? AND m.body<>'' LIMIT 2000`,
        ...params,
        new Date(time - policy.days * 86400000).toISOString(),
      );
      this.store.transaction(() => {
        for (const row of rows) {
          this.redact(
            {
              ...policy,
              key: policy.thread_key,
              projectId: policy.project_id,
              targetId: policy.target_id,
              kind: policy.kind,
              table,
            } as Thread,
            row.id,
            "expired",
          );
          redacted++;
        }
      });
      if (rows.length) this.service.events.emit(policy.project_id);
    }
    return { redacted };
  }
}
