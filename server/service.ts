import { EventEmitter } from "node:events";
import { z } from "zod";
import { Store, id, now, hash, secret, type Row } from "./store.ts";
import { Collaboration } from "./collaboration.ts";
import { Conversations } from "./conversations.ts";
import { History } from "./history.ts";
import { GitWorkflow } from "./git.ts";

export type Actor = {
  id: string;
  userId: string;
  name: string;
  type: "human" | "agent";
  projectId?: string;
  credentialId?: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new ApiError(status, message);
}
const text = z.string().trim().min(1).max(12000);
export class Service {
  events = new EventEmitter();
  collaboration = new Collaboration(this);
  conversations = new Conversations(this);
  history = new History(this);
  git = new GitWorkflow(this);
  constructor(public store: Store) {
    this.events.setMaxListeners(0);
  }
  project(actor: Actor, projectId: string) {
    if (actor.credentialId)
      requireThat(
        this.store.one(
          "SELECT 1 FROM agent_credentials WHERE id=? AND agent_id=?",
          actor.credentialId,
          actor.id,
        ),
        401,
        "Invalid AI credential",
      );
    if (actor.type === "agent")
      requireThat(
        this.store.one(
          "SELECT 1 FROM agents WHERE id=? AND project_id=? AND owner_id=? AND revoked=0",
          actor.id,
          actor.projectId,
          actor.userId,
        ),
        401,
        "Invalid AI credential",
      );
    requireThat(
      actor.type !== "agent" || actor.projectId === projectId,
      403,
      "AI cannot access this project",
    );
    const member = this.store.one(
      "SELECT role FROM members WHERE project_id=? AND user_id=?",
      projectId,
      actor.userId,
    );
    requireThat(member, 404, "Project not found");
    return member;
  }
  human(actor: Actor) {
    requireThat(
      actor.type === "human",
      403,
      "A person must confirm this action",
    );
  }
  manager(actor: Actor, projectId: string, creator?: string) {
    const member = this.project(actor, projectId);
    this.human(actor);
    requireThat(
      member.role === "owner" || creator === actor.userId,
      403,
      "Only the project owner or meeting host can do this",
    );
  }
  emit(
    projectId: string,
    kind: string,
    payload: Row,
    ownerId: string | null = null,
  ) {
    this.store.run(
      "INSERT INTO events(project_id,kind,payload,owner_id,created_at) VALUES(?,?,?,?,?)",
      projectId,
      kind,
      JSON.stringify(payload),
      ownerId,
      now(),
    );
    this.events.emit(projectId);
  }
  meeting(
    actor: Actor,
    projectId: string,
    meetingId: string,
    requireActive = false,
  ) {
    this.project(actor, projectId);
    const meeting = this.store.one(
      "SELECT * FROM meetings WHERE id=? AND project_id=?",
      meetingId,
      projectId,
    );
    requireThat(meeting, 404, "Meeting not found");
    if (actor.type === "agent")
      requireThat(
        this.store.one(
          "SELECT 1 FROM participants WHERE meeting_id=? AND agent_id=?",
          meetingId,
          actor.id,
        ),
        403,
        "This AI was not invited to the meeting",
      );
    if (requireActive)
      requireThat(
        meeting.status === "active",
        409,
        "The meeting is paused or ended",
      );
    return meeting;
  }
  createProject(actor: Actor, input: unknown) {
    this.human(actor);
    const data = z
      .object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(4000).default(""),
      })
      .parse(input);
    const project = {
      id: id(),
      ...data,
      owner_id: actor.userId,
      created_at: now(),
    };
    this.store.transaction(() => {
      this.store.run(
        "INSERT INTO projects VALUES(?,?,?,?,?)",
        project.id,
        project.name,
        project.description,
        project.owner_id,
        project.created_at,
      );
      this.store.run(
        "INSERT INTO members VALUES(?,?,?)",
        project.id,
        actor.userId,
        "owner",
      );
      this.emit(project.id, "project.created", {
        name: project.name,
        actorName: actor.name,
      });
    });
    return project;
  }
  snapshot(actor: Actor, projectId: string) {
    this.project(actor, projectId);
    const s = this.store;
    return {
      presence: s.all(
        "SELECT p.* FROM presence p WHERE p.project_id=? AND (p.actor_type='human' OR EXISTS(SELECT 1 FROM agents a WHERE a.id=p.actor_id AND a.project_id=p.project_id AND a.revoked=0))",
        projectId,
      ),
      project: s.one("SELECT * FROM projects WHERE id=?", projectId),
      members: s.all(
        "SELECT u.id,u.name,u.username,m.role FROM members m JOIN users u ON m.user_id=u.id WHERE m.project_id=?",
        projectId,
      ),
      agents: s.all(
        "SELECT a.id,a.name,a.model,a.owner_id,a.status,a.last_seen,u.name owner_name,COALESCE(pref.meeting_policy,'ask') meeting_policy,COALESCE(pref.allow_direct,0) allow_direct FROM agents a JOIN users u ON u.id=a.owner_id LEFT JOIN agent_preferences pref ON pref.agent_id=a.id WHERE a.project_id=? AND a.revoked=0 ORDER BY a.created_at",
        projectId,
      ),
      meetings: s.all(
        `SELECT m.*, (SELECT count(*) FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.actor_type='agent') agent_count FROM meetings m WHERE project_id=? ${actor.type === "agent" ? "AND EXISTS(SELECT 1 FROM participants pp WHERE pp.meeting_id=m.id AND pp.agent_id=?)" : ""} ORDER BY created_at DESC`,
        ...(actor.type === "agent" ? [projectId, actor.id] : [projectId]),
      ),
      meetingInvitations: this.collaboration.participants(actor, projectId),
      conversations: this.conversations.list(actor, projectId),
      tasks: s.all(
        "SELECT * FROM tasks WHERE project_id=? ORDER BY created_at DESC",
        projectId,
      ),
      decisions: s.all(
        "SELECT * FROM decisions WHERE project_id=? ORDER BY created_at DESC",
        projectId,
      ),
      files: s.all(
        "SELECT * FROM files WHERE project_id=? AND (visibility='shared' OR owner_id=?) ORDER BY updated_at DESC",
        projectId,
        actor.userId,
      ),
      activity: this.readEvents(actor, projectId, 0, 16, true),
    };
  }
  setPresence(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({
        room: z.enum(["office", "meeting", "library", "commons"]),
        meetingId: z.string().optional(),
      })
      .parse(input);
    if (data.room === "meeting") {
      requireThat(
        data.meetingId,
        400,
        "Choose a meeting before entering the room",
      );
      const meeting = this.meeting(actor, projectId, data.meetingId);
      requireThat(meeting.status !== "ended", 409, "Meeting has ended");
      this.collaboration.recordAttendance(actor, data.meetingId!);
    }
    const meetingId = data.room === "meeting" ? data.meetingId! : null;
    const previous = this.store.one(
      "SELECT * FROM presence WHERE project_id=? AND actor_id=? AND actor_type=?",
      projectId,
      actor.id,
      actor.type,
    );
    const record = {
      project_id: projectId,
      actor_id: actor.id,
      actor_type: actor.type,
      room: data.room,
      meeting_id: meetingId,
      updated_at: now(),
    };
    this.store.run(
      "INSERT INTO presence VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,actor_id,actor_type) DO UPDATE SET room=excluded.room,meeting_id=excluded.meeting_id,updated_at=excluded.updated_at",
      ...Object.values(record),
    );
    if (
      previous?.room !== record.room ||
      previous?.meeting_id !== record.meeting_id
    )
      this.emit(projectId, "presence.changed", {
        actorId: actor.id,
        actorType: actor.type,
        room: record.room,
        meetingId,
        actorName: actor.name,
      });
    return record;
  }
  readOfficeMessages(actor: Actor, projectId: string) {
    this.project(actor, projectId);
    if (actor.type === "agent")
      this.setPresence(actor, projectId, { room: "office" });
    return this.history.decorateRows(
      actor,
      projectId,
      { kind: "office" },
      this.store.all(
        "SELECT * FROM (SELECT * FROM office_messages WHERE project_id=? AND owner_id=? ORDER BY rowid DESC LIMIT 200) ORDER BY created_at",
        projectId,
        actor.userId,
      ),
    );
  }
  sendOfficeMessage(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const { body } = z.object({ body: text }).parse(input);
    const message = {
      id: id(),
      project_id: projectId,
      owner_id: actor.userId,
      actor_id: actor.id,
      actor_type: actor.type,
      actor_name: actor.name,
      body,
      created_at: now(),
    };
    this.store.run(
      "INSERT INTO office_messages VALUES(?,?,?,?,?,?,?,?)",
      ...Object.values(message),
    );
    this.setPresence(actor, projectId, { room: "office" });
    this.emit(projectId, "office.message", message, actor.userId);
    return message;
  }
  createAgent(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    this.human(actor);
    const data = z
      .object({
        name: z.string().trim().min(1).max(80),
        model: z.string().trim().min(1).max(120),
      })
      .parse(input);
    const token = `cn_${secret()}`;
    const agentId = id();
    this.store.run(
      "INSERT INTO agents(id,project_id,owner_id,name,model,token_hash,created_at) VALUES(?,?,?,?,?,?,?)",
      agentId,
      projectId,
      actor.userId,
      data.name,
      data.model,
      hash(token),
      now(),
    );
    this.emit(projectId, "agent.created", {
      agentId,
      name: data.name,
      actorName: actor.name,
    });
    return { id: agentId, token, ...data, projectId };
  }
  revokeAgent(actor: Actor, projectId: string, agentId: string) {
    this.project(actor, projectId);
    this.human(actor);
    const agent = this.store.one(
      "SELECT * FROM agents WHERE id=? AND project_id=? AND revoked=0",
      agentId,
      projectId,
    );
    requireThat(
      agent && agent.owner_id === actor.userId,
      403,
      "You can only disconnect your own AI",
    );
    this.store.run("UPDATE agents SET revoked=1 WHERE id=?", agentId);
    this.store.run(
      "UPDATE agent_requests SET status='failed' WHERE agent_id=? AND status IN ('queued','processing')",
      agentId,
    );
    this.emit(projectId, "agent.revoked", { agentId, actorName: actor.name });
  }
  createMeeting(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    this.human(actor);
    const data = z
      .object({
        title: z.string().trim().min(1).max(160),
        agenda: z.string().trim().max(12000).default(""),
        agentIds: z.array(z.string()).max(30).default([]),
        memberIds: z.array(z.string()).max(100).default([]),
        maxTurns: z.number().int().min(1).max(100).default(12),
      })
      .parse(input);
    const meetingId = id();
    this.store.transaction(() => {
      for (const agentId of new Set(data.agentIds))
        requireThat(
          this.store.one(
            "SELECT 1 FROM agents WHERE id=? AND project_id=? AND revoked=0",
            agentId,
            projectId,
          ),
          400,
          "Participant is not in this project",
        );
      this.store.run(
        "INSERT INTO meetings(id,project_id,title,agenda,creator_id,max_turns,created_at) VALUES(?,?,?,?,?,?,?)",
        meetingId,
        projectId,
        data.title,
        data.agenda,
        actor.userId,
        data.maxTurns,
        now(),
      );
      this.collaboration.addInvitations(actor, projectId, meetingId, data);
      this.setPresence(actor, projectId, { room: "meeting", meetingId });
      // An invitation is not attendance. AI presence changes when its client
      // reads/sends meeting messages or explicitly reports its current room.
      this.emit(projectId, "meeting.started", {
        meetingId,
        title: data.title,
        agenda: data.agenda,
        agentIds: data.agentIds,
        actorName: actor.name,
      });
    });
    return this.store.one("SELECT * FROM meetings WHERE id=?", meetingId);
  }
  updateMeeting(
    actor: Actor,
    projectId: string,
    meetingId: string,
    input: unknown,
  ) {
    const meeting = this.meeting(actor, projectId, meetingId);
    this.manager(actor, projectId, meeting.creator_id);
    const data = z
      .object({ status: z.enum(["active", "paused", "ended"]) })
      .parse(input);
    requireThat(
      meeting.status !== "ended",
      409,
      "An ended meeting cannot be reopened",
    );
    this.store.run(
      "UPDATE meetings SET status=? WHERE id=?",
      data.status,
      meetingId,
    );
    if (data.status === "ended") {
      this.store.run(
        "UPDATE agent_requests SET status='failed' WHERE meeting_id=? AND status IN ('queued','processing')",
        meetingId,
      );
      this.store.run(
        "UPDATE presence SET room='office',meeting_id=NULL,updated_at=? WHERE project_id=? AND meeting_id=? AND room='meeting'",
        now(),
        projectId,
        meetingId,
      );
    }
    this.emit(projectId, "meeting.status", {
      meetingId,
      status: data.status,
      actorName: actor.name,
    });
    return { ...meeting, status: data.status };
  }
  readMessages(actor: Actor, projectId: string, meetingId?: string) {
    this.project(actor, projectId);
    if (meetingId) this.meeting(actor, projectId, meetingId);
    if (
      meetingId &&
      actor.type === "agent" &&
      this.meeting(actor, projectId, meetingId).status !== "ended"
    )
      this.setPresence(actor, projectId, { room: "meeting", meetingId });
    return this.history.decorateRows(
      actor,
      projectId,
      meetingId ? { kind: "meeting", meetingId } : { kind: "lounge" },
      this.store
        .all(
          `SELECT m.*,(SELECT json_group_array(agent_id) FROM message_targets t WHERE t.message_id=m.id) recipient_agent_ids,(SELECT json_group_array(json_object('id',r.id,'agentId',r.agent_id,'status',r.status)) FROM agent_requests r WHERE r.message_id=m.id) ai_requests FROM (SELECT * FROM messages WHERE project_id=? AND meeting_id IS ? ORDER BY rowid DESC LIMIT 200) m ORDER BY created_at`,
          projectId,
          meetingId ?? null,
        )
        .map((m): Row => ({
          ...m,
          recipient_agent_ids: JSON.parse(m.recipient_agent_ids),
          ai_requests: JSON.parse(m.ai_requests),
        })),
    );
  }
  sendMessage(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({
        body: text,
        meetingId: z.string().optional(),
        recipientAgentIds: z.array(z.string()).max(30).default([]),
      })
      .parse(input);
    this.conversations.targets(
      actor,
      projectId,
      data.meetingId,
      data.recipientAgentIds,
    );
    if (data.meetingId) {
      const meeting = this.meeting(actor, projectId, data.meetingId, true);
      if (actor.type === "agent") {
        const count = this.store.one(
          "SELECT count(*) n FROM messages WHERE meeting_id=? AND actor_id=? AND actor_type='agent'",
          data.meetingId,
          actor.id,
        )!.n;
        requireThat(
          count < meeting.max_turns,
          409,
          "AI speaking limit reached for this meeting",
        );
      }
    }
    const message = {
      id: id(),
      project_id: projectId,
      meeting_id: data.meetingId ?? null,
      actor_id: actor.id,
      actor_type: actor.type,
      actor_name: actor.name,
      body: data.body,
      created_at: now(),
    };
    this.store.run(
      "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
      ...Object.values(message),
    );
    for (const agentId of new Set(data.recipientAgentIds)) {
      this.store.run(
        "INSERT INTO message_targets VALUES(?,?)",
        message.id,
        agentId,
      );
      this.conversations.enqueue(
        projectId,
        agentId,
        message.id,
        null,
        data.meetingId!,
      );
    }
    this.setPresence(
      actor,
      projectId,
      data.meetingId
        ? { room: "meeting", meetingId: data.meetingId }
        : { room: "commons" },
    );
    this.emit(projectId, "message.created", {
      ...message,
      recipientAgentIds: data.recipientAgentIds,
    });
    return message;
  }
  proposeDecision(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({ body: text, meetingId: z.string().optional() })
      .parse(input);
    if (data.meetingId) {
      const m = this.meeting(actor, projectId, data.meetingId);
      requireThat(m.status !== "ended", 409, "Meeting has ended");
    }
    const decisionId = id();
    this.store.run(
      "INSERT INTO decisions(id,project_id,meeting_id,body,actor_name,created_at) VALUES(?,?,?,?,?,?)",
      decisionId,
      projectId,
      data.meetingId ?? null,
      data.body,
      actor.name,
      now(),
    );
    this.emit(projectId, "decision.proposed", {
      decisionId,
      ...data,
      actorName: actor.name,
    });
    return this.store.one("SELECT * FROM decisions WHERE id=?", decisionId);
  }
  confirmDecision(
    actor: Actor,
    projectId: string,
    decisionId: string,
    input: unknown,
  ) {
    this.project(actor, projectId);
    this.human(actor);
    const data = z
      .object({ status: z.enum(["confirmed", "rejected"]) })
      .parse(input);
    const decision = this.store.one(
      "SELECT * FROM decisions WHERE id=? AND project_id=?",
      decisionId,
      projectId,
    );
    requireThat(decision, 404, "Decision not found");
    this.manager(
      actor,
      projectId,
      decision.meeting_id
        ? this.store.one(
            "SELECT creator_id FROM meetings WHERE id=?",
            decision.meeting_id,
          )?.creator_id
        : undefined,
    );
    requireThat(
      decision.status === "proposed",
      409,
      "Decision has already been reviewed",
    );
    this.store.run(
      "UPDATE decisions SET status=?,confirmed_by=? WHERE id=?",
      data.status,
      actor.userId,
      decisionId,
    );
    this.emit(projectId, "decision.reviewed", {
      decisionId,
      ...data,
      actorName: actor.name,
    });
    return { ...decision, status: data.status };
  }
  createTask(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(12000).default(""),
        meetingId: z.string().optional(),
        assigneeId: z.string().nullable().optional(),
      })
      .parse(input);
    if (data.meetingId) this.meeting(actor, projectId, data.meetingId);
    if (data.assigneeId)
      requireThat(
        this.store.one(
          "SELECT 1 FROM agents WHERE id=? AND project_id=? AND revoked=0",
          data.assigneeId,
          projectId,
        ),
        400,
        "Assignee is not in this project",
      );
    const taskId = id();
    this.store.run(
      "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)",
      taskId,
      projectId,
      data.meetingId ?? null,
      data.title,
      data.description,
      actor.type === "agent" ? "proposed" : "todo",
      data.assigneeId ?? null,
      now(),
    );
    this.emit(projectId, "task.created", {
      taskId,
      ...data,
      actorName: actor.name,
    });
    return this.store.one("SELECT * FROM tasks WHERE id=?", taskId);
  }
  updateTask(actor: Actor, projectId: string, taskId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({
        status: z.enum(["todo", "in_progress", "review", "done"]),
        assigneeId: z.string().nullable().optional(),
      })
      .parse(input);
    const task = this.store.one(
      "SELECT * FROM tasks WHERE id=? AND project_id=?",
      taskId,
      projectId,
    );
    requireThat(task, 404, "Task not found");
    if (actor.type === "agent") {
      requireThat(
        task.status !== "done",
        403,
        "Only a person can reopen verified work",
      );
      requireThat(
        task.status !== "proposed",
        403,
        "A person must approve a proposed task",
      );
      requireThat(
        data.assigneeId === undefined || data.assigneeId === actor.id,
        403,
        "AI can only assign itself",
      );
      requireThat(
        !task.assignee_id || task.assignee_id === actor.id,
        409,
        "Another AI owns this task",
      );
      requireThat(
        data.status !== "done",
        403,
        "A person must verify completed work; submit for review",
      );
    }
    const assignee =
      data.assigneeId !== undefined
        ? data.assigneeId
        : actor.type === "agent"
          ? actor.id
          : task.assignee_id;
    if (assignee)
      requireThat(
        this.store.one(
          "SELECT 1 FROM agents WHERE id=? AND project_id=? AND revoked=0",
          assignee,
          projectId,
        ),
        400,
        "Assignee is not in this project",
      );
    this.store.run(
      "UPDATE tasks SET status=?,assignee_id=? WHERE id=?",
      data.status,
      assignee,
      taskId,
    );
    this.emit(projectId, "task.updated", {
      taskId,
      status: data.status,
      assigneeId: assignee,
      actorName: actor.name,
    });
    return this.store.one("SELECT * FROM tasks WHERE id=?", taskId);
  }
  writeFile(actor: Actor, projectId: string, input: unknown) {
    this.project(actor, projectId);
    const data = z
      .object({
        path: z.string().min(1).max(240),
        content: z.string().max(12_000_000),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
        mime: z.string().max(200).default("text/plain"),
        baseVersion: z.number().int().min(0),
        visibility: z.enum(["shared", "private"]).default("shared"),
      })
      .parse(input);
    const path = data.path.normalize("NFC");
    requireThat(
      !path.startsWith("/") &&
        !path.includes("\\") &&
        !/[\x00-\x1f]/.test(path) &&
        path.split("/").every((s) => s !== "." && s !== ".." && s.length > 0),
      400,
      "Use a relative path without empty segments or traversal",
    );
    requireThat(
      data.encoding !== "base64" ||
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          data.content,
        ),
      400,
      "Invalid base64 content",
    );
    const content = Buffer.from(
      data.content,
      data.encoding === "base64" ? "base64" : "utf8",
    );
    requireThat(
      content.length <= 8 * 1024 * 1024,
      413,
      "Files are limited to 8 MB",
    );
    return this.store.transaction(() => {
      const existing = this.store.one(
        "SELECT * FROM files WHERE project_id=? AND path=?",
        projectId,
        path,
      );
      if (existing) {
        requireThat(
          existing.visibility === "shared" ||
            existing.owner_id === actor.userId,
          403,
          "File is private",
        );
        requireThat(
          existing.visibility === data.visibility ||
            existing.owner_id === actor.userId,
          403,
          "Only the author can change file visibility",
        );
      }
      requireThat(
        (existing?.version ?? 0) === data.baseVersion,
        409,
        `Version conflict: current version is ${existing?.version ?? 0}. Read it before submitting again.`,
      );
      const fileId = existing?.id ?? id();
      const version = data.baseVersion + 1;
      const date = now();
      if (existing)
        this.store.run(
          "UPDATE files SET version=?,mime=?,size=?,visibility=?,updated_at=? WHERE id=?",
          version,
          data.mime,
          content.length,
          data.visibility,
          date,
          fileId,
        );
      else
        this.store.run(
          "INSERT INTO files VALUES(?,?,?,?,?,?,?,?,?)",
          fileId,
          projectId,
          path,
          actor.userId,
          data.visibility,
          version,
          data.mime,
          content.length,
          date,
        );
      this.store.run(
        "INSERT INTO file_versions VALUES(?,?,?,?,?)",
        fileId,
        version,
        content,
        actor.name,
        date,
      );
      this.emit(
        projectId,
        "file.updated",
        { fileId, path, version, actorName: actor.name },
        data.visibility === "private"
          ? (existing?.owner_id ?? actor.userId)
          : null,
      );
      this.setPresence(actor, projectId, { room: "library" });
      return this.store.one("SELECT * FROM files WHERE id=?", fileId);
    });
  }
  readFile(actor: Actor, projectId: string, fileId: string, version?: number) {
    this.project(actor, projectId);
    const file = this.store.one(
      "SELECT * FROM files WHERE id=? AND project_id=? AND (visibility='shared' OR owner_id=?)",
      fileId,
      projectId,
      actor.userId,
    );
    requireThat(file, 404, "File not found");
    const entry = this.store.one(
      "SELECT * FROM file_versions WHERE file_id=? AND version=?",
      fileId,
      version ?? file.version,
    );
    requireThat(entry, 404, "File version not found");
    this.setPresence(actor, projectId, { room: "library" });
    return {
      file,
      entry,
      versions: this.store.all(
        "SELECT version,actor_name,created_at FROM file_versions WHERE file_id=? ORDER BY version DESC",
        fileId,
      ),
    };
  }
  readEvents(
    actor: Actor,
    projectId: string,
    after: number,
    limit = 100,
    recent = false,
  ) {
    this.project(actor, projectId);
    const meetingFilter =
      actor.type === "agent"
        ? `AND (kind NOT IN ('message.created','meeting.started','meeting.status','presence.changed','meeting.ready','meeting.responded') OR COALESCE(json_extract(payload,'$.meetingId'),json_extract(payload,'$.meeting_id')) IS NULL OR EXISTS(SELECT 1 FROM participants pp WHERE pp.meeting_id=COALESCE(json_extract(payload,'$.meetingId'),json_extract(payload,'$.meeting_id')) AND pp.agent_id=?)) AND (kind<>'meeting.ready' OR json_extract(payload,'$.agentId')=?)`
        : "";
    const params =
      actor.type === "agent"
        ? [projectId, after, actor.userId, actor.id, actor.id, actor.id, limit]
        : [projectId, after, actor.userId, actor.userId, actor.userId, limit];
    const directFilter = `AND (kind<>'direct.updated' OR EXISTS(SELECT 1 FROM direct_conversations c JOIN agents a ON a.id=c.agent_id WHERE c.id=json_extract(payload,'$.conversationId') AND ${actor.type === "agent" ? "c.agent_id=?" : "(c.user_id=? OR a.owner_id=?)"}))`;
    const rows = this.store.all(
      `SELECT * FROM events WHERE project_id=? AND id>? AND (owner_id IS NULL OR owner_id=?) ${meetingFilter} ${directFilter} ORDER BY id ${recent ? "DESC" : "ASC"} LIMIT ?`,
      ...params,
    );
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  async waitForEvents(
    actor: Actor,
    projectId: string,
    after: number,
    seconds = 20,
    signal?: AbortSignal,
  ) {
    this.project(actor, projectId);
    if (
      this.readEvents(actor, projectId, after).length ||
      seconds <= 0 ||
      signal?.aborted
    )
      return this.readEvents(actor, projectId, after);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.events.off(projectId, onEvent);
        signal?.removeEventListener("abort", finish);
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      const onEvent = () => {
        try {
          if (this.readEvents(actor, projectId, after).length) finish();
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      const timer = setTimeout(finish, Math.min(seconds, 25) * 1000);
      this.events.on(projectId, onEvent);
      signal?.addEventListener("abort", finish, { once: true });
      onEvent();
    });
    if (signal?.aborted) return [];
    return this.readEvents(actor, projectId, after);
  }
  invite(actor: Actor, projectId: string) {
    this.manager(actor, projectId);
    const token = secret();
    this.store.run(
      "INSERT INTO invites VALUES(?,?,?,0)",
      hash(token),
      projectId,
      new Date(Date.now() + 86400000).toISOString(),
    );
    return { token, expiresIn: "24 hours", maxUses: 20 };
  }
  acceptInvite(actor: Actor, token: string) {
    this.human(actor);
    return this.store.transaction(() => {
      const invite = this.store.one(
        "SELECT * FROM invites WHERE token_hash=? AND expires_at>? AND uses<20",
        hash(token),
        now(),
      );
      requireThat(invite, 404, "Invitation has expired or is invalid");
      if (
        !this.store.one(
          "SELECT 1 FROM members WHERE project_id=? AND user_id=?",
          invite.project_id,
          actor.userId,
        )
      ) {
        this.store.run(
          "INSERT INTO members VALUES(?,?,?)",
          invite.project_id,
          actor.userId,
          "member",
        );
        this.store.run(
          "UPDATE invites SET uses=uses+1 WHERE token_hash=?",
          hash(token),
        );
        this.emit(invite.project_id, "member.joined", {
          actorName: actor.name,
        });
      }
      return { projectId: invite.project_id };
    });
  }
}
