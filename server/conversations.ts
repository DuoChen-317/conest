import { z } from "zod";
import { id, now, type Row } from "./store.ts";
import { requireThat, type Actor, type Service } from "./service.ts";

const bodySchema = z.string().trim().min(1).max(12000);
const leaseMilliseconds = 180000;

export class Conversations {
  constructor(private service: Service) {}
  get store() {
    return this.service.store;
  }

  list(actor: Actor, projectId: string) {
    this.service.project(actor, projectId);
    return this.store.all(
      `SELECT c.*,a.name agent_name,a.owner_id,a.last_seen,a.revoked,COALESCE(p.allow_direct,0) allow_direct,u.name user_name,owner.name owner_name,(SELECT max(created_at) FROM direct_messages m WHERE m.conversation_id=c.id) updated_at FROM direct_conversations c JOIN agents a ON a.id=c.agent_id JOIN users u ON u.id=c.user_id JOIN users owner ON owner.id=a.owner_id LEFT JOIN agent_preferences p ON p.agent_id=a.id WHERE c.project_id=? AND ${actor.type === "agent" ? "c.agent_id=?" : "(c.user_id=? OR a.owner_id=?)"} ORDER BY COALESCE(updated_at,c.created_at) DESC`,
      ...(actor.type === "agent"
        ? [projectId, actor.id]
        : [projectId, actor.userId, actor.userId]),
    );
  }

  conversation(
    actor: Actor,
    projectId: string,
    conversationId: string,
    writing = false,
  ) {
    const conversation = this.list(actor, projectId).find(
      (c) => c.id === conversationId,
    );
    requireThat(conversation, 404, "Conversation not found");
    if (writing) {
      requireThat(!conversation.revoked, 409, "This AI has been disconnected");
      requireThat(
        actor.type === "agent" || conversation.user_id === actor.userId,
        403,
        "Only the conversation sender can ask questions here",
      );
      requireThat(
        conversation.allow_direct ||
          conversation.user_id === conversation.owner_id,
        403,
        "This AI is not accepting direct messages",
      );
    }
    return conversation;
  }

  start(actor: Actor, projectId: string, input: unknown) {
    this.service.project(actor, projectId);
    this.service.human(actor);
    const { agentId } = z.object({ agentId: z.string() }).parse(input);
    const agent = this.store.one(
      "SELECT a.*,COALESCE(p.allow_direct,0) allow_direct FROM agents a LEFT JOIN agent_preferences p ON p.agent_id=a.id WHERE a.id=? AND a.project_id=? AND a.revoked=0",
      agentId,
      projectId,
    );
    requireThat(agent, 404, "AI not found");
    requireThat(
      agent.owner_id === actor.userId || agent.allow_direct,
      403,
      "This AI is not accepting direct messages",
    );
    this.store.run(
      "INSERT OR IGNORE INTO direct_conversations VALUES(?,?,?,?,?)",
      id(),
      projectId,
      actor.userId,
      agentId,
      now(),
    );
    return this.list(actor, projectId).find(
      (c) => c.agent_id === agentId && c.user_id === actor.userId,
    )!;
  }

  messages(actor: Actor, projectId: string, conversationId: string) {
    this.conversation(actor, projectId, conversationId);
    return this.store.all(
      "SELECT * FROM (SELECT m.*,m.rowid sequence,r.id request_id,r.status request_status FROM direct_messages m LEFT JOIN agent_requests r ON r.message_id=m.id WHERE m.conversation_id=? ORDER BY m.rowid DESC LIMIT 200) ORDER BY sequence",
      conversationId,
    );
  }

  send(
    actor: Actor,
    projectId: string,
    conversationId: string,
    input: unknown,
  ) {
    this.service.human(actor);
    const conversation = this.conversation(
      actor,
      projectId,
      conversationId,
      true,
    );
    const { body } = z.object({ body: bodySchema }).parse(input);
    return this.store.transaction(() => {
      const message = this.insertDirectMessage(actor, conversationId, body);
      this.enqueue(
        projectId,
        conversation.agent_id,
        message.id,
        conversationId,
      );
      return message;
    });
  }

  private insertDirectMessage(
    actor: Actor,
    conversationId: string,
    body: string,
  ) {
    const message = {
      id: id(),
      conversation_id: conversationId,
      actor_id: actor.id,
      actor_type: actor.type,
      actor_name: actor.name,
      body,
      created_at: now(),
    };
    this.store.run(
      "INSERT INTO direct_messages VALUES(?,?,?,?,?,?,?)",
      ...Object.values(message),
    );
    const conversation = this.store.one(
      "SELECT project_id FROM direct_conversations WHERE id=?",
      conversationId,
    )!;
    // Event bodies remain in the access-controlled conversation, never project activity.
    this.service.emit(conversation.project_id, "direct.updated", {
      conversationId,
      actorName: actor.name,
    });
    return message;
  }

  enqueue(
    projectId: string,
    agentId: string,
    messageId: string,
    conversationId: string | null = null,
    meetingId: string | null = null,
  ) {
    this.store.run(
      "INSERT INTO agent_requests(id,project_id,agent_id,message_id,conversation_id,meeting_id,created_at) VALUES(?,?,?,?,?,?,?)",
      id(),
      projectId,
      agentId,
      messageId,
      conversationId,
      meetingId,
      now(),
    );
  }

  targets(
    actor: Actor,
    projectId: string,
    meetingId: string | undefined,
    agentIds: string[],
  ) {
    if (!agentIds.length) return;
    this.service.human(actor);
    requireThat(meetingId, 400, "Choose a meeting before mentioning an AI");
    for (const agentId of new Set(agentIds))
      requireThat(
        this.store.one(
          "SELECT 1 FROM participants p JOIN agents a ON a.id=p.agent_id WHERE p.meeting_id=? AND p.agent_id=? AND a.project_id=? AND a.revoked=0",
          meetingId,
          agentId,
          projectId,
        ),
        400,
        "Mentioned AI must be approved for this meeting",
      );
  }

  queue(actor: Actor, projectId: string) {
    this.service.project(actor, projectId);
    requireThat(actor.type === "agent", 403, "AI credential required");
    return this.store.all(
      `SELECT r.id,r.status,r.meeting_id,r.conversation_id FROM agent_requests r JOIN agents a ON a.id=r.agent_id LEFT JOIN agent_preferences pref ON pref.agent_id=a.id LEFT JOIN direct_conversations c ON c.id=r.conversation_id LEFT JOIN meetings m ON m.id=r.meeting_id WHERE r.project_id=? AND r.agent_id=? AND a.revoked=0 AND (r.status='queued' OR (r.status='processing' AND r.claimed_at<?)) AND ((r.conversation_id IS NOT NULL AND (pref.allow_direct=1 OR c.user_id=a.owner_id)) OR (r.meeting_id IS NOT NULL AND m.status='active' AND EXISTS(SELECT 1 FROM participants p WHERE p.meeting_id=r.meeting_id AND p.agent_id=r.agent_id))) AND (r.conversation_id IS NULL OR NOT EXISTS(SELECT 1 FROM agent_requests earlier WHERE earlier.conversation_id=r.conversation_id AND earlier.status IN ('queued','processing') AND earlier.rowid<r.rowid)) ORDER BY r.created_at,r.rowid LIMIT 20`,
      projectId,
      actor.id,
      new Date(Date.now() - leaseMilliseconds).toISOString(),
    );
  }

  private request(actor: Actor, projectId: string, requestId: string) {
    this.service.project(actor, projectId);
    requireThat(actor.type === "agent", 403, "AI credential required");
    const request = this.store.one(
      "SELECT * FROM agent_requests WHERE id=? AND project_id=? AND agent_id=?",
      requestId,
      projectId,
      actor.id,
    );
    requireThat(request, 404, "AI request not found");
    if (request.conversation_id)
      this.conversation(actor, projectId, request.conversation_id, true);
    else this.service.meeting(actor, projectId, request.meeting_id, true);
    return request;
  }

  claim(actor: Actor, projectId: string, requestId: string) {
    const request = this.request(actor, projectId, requestId);
    if (request.conversation_id)
      requireThat(
        !this.store.one(
          "SELECT 1 FROM agent_requests earlier WHERE earlier.conversation_id=? AND earlier.status IN ('queued','processing') AND earlier.rowid<(SELECT rowid FROM agent_requests WHERE id=?)",
          request.conversation_id,
          requestId,
        ),
        409,
        "An earlier question in this conversation is still pending",
      );
    requireThat(
      request.status === "queued" ||
        (request.status === "processing" &&
          Date.now() - Date.parse(request.claimed_at) > leaseMilliseconds),
      409,
      "This AI request has already been claimed",
    );
    const leaseId = id();
    this.store.run(
      "UPDATE agent_requests SET status='processing',lease_id=?,claimed_at=? WHERE id=?",
      leaseId,
      now(),
      requestId,
    );
    if (request.meeting_id)
      this.service.collaboration.join(actor, projectId, request.meeting_id);
    const project = this.store.one(
      "SELECT name,description FROM projects WHERE id=?",
      projectId,
    )!;
    const sharedFiles: Row[] = [];
    let remaining = 64000;
    for (const file of this.store.all(
      "SELECT f.id,f.path,f.version,f.mime,f.size,v.content FROM files f JOIN file_versions v ON v.file_id=f.id AND v.version=f.version WHERE f.project_id=? AND f.visibility='shared' AND f.size<=16000 AND (f.mime LIKE 'text/%' OR f.mime='application/json') ORDER BY f.updated_at DESC LIMIT 10",
      projectId,
    )) {
      if (file.size > remaining) continue;
      remaining -= file.size;
      sharedFiles.push({
        path: file.path,
        version: file.version,
        content: Buffer.from(file.content).toString("utf8"),
      });
    }
    const messages = request.conversation_id
      ? this.store.all(
          "SELECT * FROM (SELECT m.*,m.rowid sequence FROM direct_messages m WHERE m.conversation_id=? AND (m.rowid<=(SELECT rowid FROM direct_messages WHERE id=?) OR EXISTS(SELECT 1 FROM agent_requests r WHERE r.reply_id=m.id AND r.rowid<(SELECT rowid FROM agent_requests WHERE id=?))) ORDER BY m.rowid DESC LIMIT 30) ORDER BY sequence",
          request.conversation_id,
          request.message_id,
          requestId,
        )
      : this.service.readMessages(actor, projectId, request.meeting_id);
    const messageIndex = messages.findIndex((m) => m.id === request.message_id);
    const trigger =
      messageIndex >= 0
        ? messages[messageIndex]
        : this.store.one(
            `SELECT * FROM ${request.conversation_id ? "direct_messages" : "messages"} WHERE id=?`,
            request.message_id,
          )!;
    const history = request.conversation_id
      ? messages
      : messageIndex >= 0
        ? messages.slice(Math.max(0, messageIndex - 29), messageIndex + 1)
        : [trigger];
    return {
      requestId,
      leaseId,
      kind: request.conversation_id ? "direct" : "meeting",
      project,
      sharedFiles,
      meeting: request.meeting_id
        ? this.store.one(
            "SELECT title,agenda FROM meetings WHERE id=?",
            request.meeting_id,
          )
        : null,
      messages: history.map((m) => ({
        name: m.actor_name,
        role: m.actor_type,
        body: m.body,
      })),
      trigger: { name: trigger.actor_name, body: trigger.body },
    };
  }

  finish(actor: Actor, projectId: string, requestId: string, input: unknown) {
    const data = z
      .object({
        leaseId: z.string(),
        body: bodySchema.optional(),
        failed: z.boolean().default(false),
      })
      .parse(input);
    const request = this.request(actor, projectId, requestId);
    requireThat(
      request.lease_id === data.leaseId,
      409,
      "AI request lease has changed",
    );
    if (request.status === "replied")
      return { id: request.reply_id, status: "replied" };
    requireThat(
      request.status === "processing",
      409,
      "AI request is not processing",
    );
    requireThat(
      Date.now() - Date.parse(request.claimed_at) <= leaseMilliseconds,
      409,
      "AI request lease has expired",
    );
    requireThat(data.failed || data.body, 400, "A reply body is required");
    return this.store.transaction(() => {
      const reply = data.failed
        ? null
        : request.conversation_id
          ? this.insertDirectMessage(actor, request.conversation_id, data.body!)
          : this.service.sendMessage(actor, projectId, {
              body: data.body,
              meetingId: request.meeting_id,
            });
      this.store.run(
        "UPDATE agent_requests SET status=?,reply_id=? WHERE id=?",
        data.failed ? "failed" : "replied",
        reply?.id ?? null,
        requestId,
      );
      return {
        id: reply?.id ?? null,
        status: data.failed ? "failed" : "replied",
      };
    });
  }

  retry(actor: Actor, projectId: string, requestId: string) {
    this.service.human(actor);
    const request = this.store.one(
      "SELECT * FROM agent_requests WHERE id=? AND project_id=?",
      requestId,
      projectId,
    );
    requireThat(request, 404, "AI request not found");
    if (request.conversation_id)
      this.conversation(actor, projectId, request.conversation_id, true);
    else {
      this.service.meeting(actor, projectId, request.meeting_id, true);
      const message = this.store.one(
        "SELECT actor_id FROM messages WHERE id=?",
        request.message_id,
      )!;
      requireThat(
        message.actor_id === actor.id,
        403,
        "Only the sender can retry this request",
      );
    }
    requireThat(
      request.status === "failed",
      409,
      "Only failed AI requests can be retried",
    );
    this.store.run(
      "UPDATE agent_requests SET status='queued',lease_id=NULL,claimed_at=NULL WHERE id=?",
      requestId,
    );
    return { status: "queued" };
  }
}
