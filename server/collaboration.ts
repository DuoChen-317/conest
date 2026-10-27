import { z } from "zod";
import { id, now } from "./store.ts";
import { requireThat, type Actor, type Service } from "./service.ts";

const recipients = z.object({
  memberIds: z.array(z.string()).max(100).default([]),
  agentIds: z.array(z.string()).max(30).default([]),
});

export class Collaboration {
  constructor(private service: Service) {}
  get store() {
    return this.service.store;
  }

  invite(actor: Actor, projectId: string, meetingId: string, input: unknown) {
    const meeting = this.service.meeting(actor, projectId, meetingId);
    this.service.manager(actor, projectId, meeting.creator_id);
    requireThat(meeting.status !== "ended", 409, "Meeting has ended");
    const data = recipients.parse(input);
    return this.store.transaction(() =>
      this.addInvitations(actor, projectId, meetingId, data),
    );
  }

  // The caller owns the transaction, including meeting creation.
  addInvitations(
    actor: Actor,
    projectId: string,
    meetingId: string,
    input: unknown,
  ) {
    const data = recipients.parse(input);
    for (const memberId of new Set(data.memberIds)) {
      requireThat(
        this.store.one(
          "SELECT 1 FROM members WHERE project_id=? AND user_id=?",
          projectId,
          memberId,
        ),
        400,
        "Participant is not in this project",
      );
      this.addInvitation(
        actor,
        projectId,
        meetingId,
        memberId,
        "human",
        memberId === actor.userId,
        memberId,
      );
    }
    for (const agentId of new Set(data.agentIds)) {
      const agent = this.store.one(
        "SELECT a.*,COALESCE(p.meeting_policy,'ask') meeting_policy FROM agents a LEFT JOIN agent_preferences p ON p.agent_id=a.id WHERE a.id=? AND a.project_id=? AND a.revoked=0",
        agentId,
        projectId,
      );
      requireThat(agent, 400, "Participant is not in this project");
      const accepted =
        agent.owner_id === actor.userId || agent.meeting_policy === "auto";
      this.addInvitation(
        actor,
        projectId,
        meetingId,
        agentId,
        "agent",
        accepted,
        agent.owner_id,
      );
    }
    return this.participants(actor, projectId).filter(
      (i) => i.meeting_id === meetingId,
    );
  }

  private addInvitation(
    actor: Actor,
    projectId: string,
    meetingId: string,
    actorId: string,
    actorType: string,
    accepted: boolean,
    ownerId: string,
  ) {
    const timestamp = now();
    const invitationId = id();
    const result = this.store.run(
      "INSERT OR IGNORE INTO meeting_invitations(id,meeting_id,actor_id,actor_type,invited_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      invitationId,
      meetingId,
      actorId,
      actorType,
      actor.userId,
      accepted ? "accepted" : "pending",
      timestamp,
      timestamp,
    );
    if (!result.changes) return;
    if (ownerId === actor.userId)
      this.store.run(
        "UPDATE meeting_invitations SET seen_at=? WHERE id=?",
        timestamp,
        invitationId,
      );
    if (accepted && actorType === "agent")
      this.store.run(
        "INSERT OR IGNORE INTO participants VALUES(?,?)",
        meetingId,
        actorId,
      );
    this.service.emit(
      projectId,
      "meeting.invited",
      { invitationId, meetingId, actorId, actorType, actorName: actor.name },
      ownerId,
    );
    if (accepted && actorType === "agent")
      this.service.emit(projectId, "meeting.ready", {
        meetingId,
        agentId: actorId,
        actorName: actor.name,
      });
  }

  participants(actor: Actor, projectId: string) {
    this.service.project(actor, projectId);
    return this.store.all(
      `SELECT i.*,COALESCE(u.name,a.name) name,a.owner_id,owner.name owner_name FROM meeting_invitations i JOIN meetings m ON m.id=i.meeting_id LEFT JOIN users u ON i.actor_type='human' AND u.id=i.actor_id LEFT JOIN agents a ON i.actor_type='agent' AND a.id=i.actor_id LEFT JOIN users owner ON owner.id=a.owner_id WHERE m.project_id=? AND (i.actor_type='human' OR a.revoked=0) ${actor.type === "agent" ? "AND i.actor_type='agent' AND i.actor_id=?" : ""} ORDER BY i.created_at,i.id`,
      ...(actor.type === "agent" ? [projectId, actor.id] : [projectId]),
    );
  }

  notifications(actor: Actor) {
    this.service.human(actor);
    return this.store.all(
      `SELECT i.*,m.project_id,m.title,m.agenda,m.status meeting_status,p.name project_name,inviter.name inviter_name,a.name agent_name,a.last_seen FROM meeting_invitations i JOIN meetings m ON m.id=i.meeting_id JOIN projects p ON p.id=m.project_id JOIN members member ON member.project_id=m.project_id AND member.user_id=? JOIN users inviter ON inviter.id=i.invited_by LEFT JOIN agents a ON i.actor_type='agent' AND a.id=i.actor_id WHERE (i.actor_type='human' AND i.actor_id=? AND i.invited_by<>?) OR (i.actor_type='agent' AND a.owner_id=? AND a.revoked=0) ORDER BY CASE WHEN m.status<>'ended' AND i.status='pending' THEN 0 WHEN m.status<>'ended' THEN 1 ELSE 2 END,i.actor_type DESC,i.created_at DESC,i.id DESC`,
      actor.userId,
      actor.userId,
      actor.userId,
      actor.userId,
    );
  }

  respond(actor: Actor, invitationId: string, input: unknown) {
    this.service.human(actor);
    const data = z
      .object({ action: z.enum(["accept", "decline", "later", "seen"]) })
      .parse(input);
    const invitation = this.notifications(actor).find(
      (i) => i.id === invitationId,
    );
    requireThat(invitation, 404, "Invitation not found");
    if (data.action === "accept" || data.action === "decline")
      requireThat(
        invitation.meeting_status !== "ended",
        409,
        "Meeting has ended",
      );
    const timestamp = now();
    return this.store.transaction(() => {
      if (data.action === "later" || data.action === "seen") {
        this.store.run(
          `UPDATE meeting_invitations SET seen_at=?,${data.action === "later" ? "deferred_at=?," : ""}updated_at=? WHERE id=?`,
          ...(data.action === "later"
            ? [timestamp, timestamp, timestamp, invitationId]
            : [timestamp, timestamp, invitationId]),
        );
      } else {
        requireThat(
          data.action !== "decline" ||
            invitation.actor_type === "agent" ||
            !invitation.joined_at,
          409,
          "An attendee cannot decline after joining",
        );
        if (data.action === "accept" && invitation.status === "accepted")
          return invitation;
        const status = data.action === "accept" ? "accepted" : "declined";
        this.store.run(
          "UPDATE meeting_invitations SET status=?,seen_at=?,deferred_at=NULL,updated_at=? WHERE id=?",
          status,
          timestamp,
          timestamp,
          invitationId,
        );
        if (invitation.actor_type === "agent") {
          if (status === "accepted") {
            this.store.run(
              "INSERT OR IGNORE INTO participants VALUES(?,?)",
              invitation.meeting_id,
              invitation.actor_id,
            );
            this.service.emit(invitation.project_id, "meeting.ready", {
              meetingId: invitation.meeting_id,
              agentId: invitation.actor_id,
              actorName: actor.name,
            });
          } else {
            this.store.run(
              "DELETE FROM participants WHERE meeting_id=? AND agent_id=?",
              invitation.meeting_id,
              invitation.actor_id,
            );
            this.store.run(
              "UPDATE agent_requests SET status='failed',lease_id=NULL,claimed_at=NULL WHERE meeting_id=? AND agent_id=? AND status IN ('queued','processing')",
              invitation.meeting_id,
              invitation.actor_id,
            );
            this.store.run(
              "UPDATE presence SET room='office',meeting_id=NULL,updated_at=? WHERE project_id=? AND actor_id=? AND actor_type='agent' AND meeting_id=?",
              timestamp,
              invitation.project_id,
              invitation.actor_id,
              invitation.meeting_id,
            );
          }
        }
        this.service.emit(invitation.project_id, "meeting.responded", {
          meetingId: invitation.meeting_id,
          actorId: invitation.actor_id,
          actorType: invitation.actor_type,
          status,
          actorName: actor.name,
        });
      }
      return this.store.one(
        "SELECT * FROM meeting_invitations WHERE id=?",
        invitationId,
      );
    });
  }

  join(actor: Actor, projectId: string, meetingId: string) {
    const meeting = this.service.meeting(actor, projectId, meetingId);
    requireThat(meeting.status !== "ended", 409, "Meeting has ended");
    return this.service.setPresence(actor, projectId, {
      room: "meeting",
      meetingId,
    });
  }

  recordAttendance(actor: Actor, meetingId: string) {
    // A participant reporting their own room is the acknowledgement, never an inviter.
    const timestamp = now();
    if (actor.type === "human") {
      const meeting = this.store.one(
        "SELECT * FROM meetings WHERE id=?",
        meetingId,
      )!;
      this.store.run(
        "INSERT OR IGNORE INTO meeting_invitations(id,meeting_id,actor_id,actor_type,invited_by,status,seen_at,joined_at,created_at,updated_at) VALUES(?,?,?,'human',?,'accepted',?,?,?,?)",
        id(),
        meetingId,
        actor.id,
        meeting.creator_id,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      );
    }
    this.store.run(
      "UPDATE meeting_invitations SET status='accepted',joined_at=COALESCE(joined_at,?),seen_at=COALESCE(seen_at,?),deferred_at=NULL,updated_at=? WHERE meeting_id=? AND actor_id=? AND actor_type=?",
      timestamp,
      timestamp,
      timestamp,
      meetingId,
      actor.id,
      actor.type,
    );
  }

  preferences(
    actor: Actor,
    projectId: string,
    agentId: string,
    input: unknown,
  ) {
    this.service.project(actor, projectId);
    this.service.human(actor);
    const agent = this.store.one(
      "SELECT * FROM agents WHERE id=? AND project_id=? AND revoked=0",
      agentId,
      projectId,
    );
    requireThat(
      agent?.owner_id === actor.userId,
      403,
      "You can only configure your own AI",
    );
    const data = z
      .object({
        meetingPolicy: z.enum(["ask", "auto"]),
        allowDirect: z.boolean(),
      })
      .parse(input);
    this.store.transaction(() => {
      this.store.run(
        "INSERT INTO agent_preferences VALUES(?,?,?) ON CONFLICT(agent_id) DO UPDATE SET meeting_policy=excluded.meeting_policy,allow_direct=excluded.allow_direct",
        agentId,
        data.meetingPolicy,
        Number(data.allowDirect),
      );
      if (!data.allowDirect)
        this.store.run(
          "UPDATE agent_requests SET status='failed',lease_id=NULL,claimed_at=NULL WHERE agent_id=? AND status IN ('queued','processing') AND conversation_id IN (SELECT id FROM direct_conversations WHERE agent_id=? AND user_id<>?)",
          agentId,
          agentId,
          actor.userId,
        );
    });
    return data;
  }
}
