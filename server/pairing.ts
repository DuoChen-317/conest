import { z } from "zod";
import { hash, id, now, secret } from "./store.ts";
import { requireThat, type Actor, type Service } from "./service.ts";

export class Pairing {
  constructor(private service: Service) {}
  get store() {
    return this.service.store;
  }

  create(actor: Actor, projectId: string, agentId: string) {
    this.service.human(actor);
    this.service.project(actor, projectId);
    requireThat(
      this.store.one(
        "SELECT 1 FROM agents WHERE id=? AND project_id=? AND owner_id=? AND revoked=0",
        agentId,
        projectId,
        actor.id,
      ),
      403,
      "You can only connect your own AI",
    );
    const code = secret();
    const record = {
      id: id(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    };
    this.store.transaction(() => {
      this.store.run(
        "DELETE FROM agent_pairings WHERE expires_at<? AND status<>'approved'",
        now(),
      );
      this.store.run(
        "UPDATE agent_pairings SET status='cancelled' WHERE agent_id=? AND status IN ('waiting','claimed')",
        agentId,
      );
      this.store.run(
        "INSERT INTO agent_pairings(id,project_id,agent_id,owner_id,code_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        record.id,
        projectId,
        agentId,
        actor.id,
        hash(code),
        record.expiresAt,
        now(),
      );
    });
    return { ...record, code };
  }

  private valid(record: any) {
    requireThat(
      record &&
        this.store.one(
          "SELECT 1 FROM agents WHERE id=? AND revoked=0",
          record.agent_id,
        ),
      404,
      "Connection request not found",
    );
    requireThat(
      record.status === "approved" || record.expires_at > now(),
      410,
      "Connection request expired",
    );
    return record;
  }

  claim(input: unknown) {
    const data = z
      .object({
        code: z.string().min(30).max(100),
        credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
        clientName: z.string().trim().min(1).max(60),
      })
      .parse(input);
    return this.store.transaction(() => {
      const record = this.valid(
        this.store.one(
          "SELECT * FROM agent_pairings WHERE code_hash=?",
          hash(data.code),
        ),
      );
      requireThat(record.expires_at > now(), 410, "Connection request expired");
      requireThat(
        record.status === "waiting" ||
          (["claimed", "approved"].includes(record.status) &&
            record.credential_hash === data.credentialHash),
        409,
        "Connection request already used or cancelled",
      );
      if (record.status === "waiting")
        this.store.run(
          "UPDATE agent_pairings SET status='claimed',credential_hash=?,client_name=? WHERE id=?",
          data.credentialHash,
          data.clientName,
          record.id,
        );
      return {
        id: record.id,
        projectId: record.project_id,
        agentId: record.agent_id,
      };
    });
  }

  poll(input: unknown) {
    const data = z
      .object({
        id: z.string(),
        token: z.string().regex(/^cn_[A-Za-z0-9_-]{30,100}$/),
      })
      .parse(input);
    const record = this.valid(
      this.store.one(
        "SELECT * FROM agent_pairings WHERE id=? AND credential_hash=?",
        data.id,
        hash(data.token),
      ),
    );
    return {
      status: record.status,
      projectId: record.project_id,
      agentId: record.agent_id,
    };
  }

  status(actor: Actor, pairingId: string) {
    this.service.human(actor);
    const record = this.valid(
      this.store.one(
        "SELECT * FROM agent_pairings WHERE id=? AND owner_id=?",
        pairingId,
        actor.id,
      ),
    );
    this.service.project(actor, record.project_id);
    const credential = this.store.one(
      "SELECT mcp_seen FROM agent_credentials WHERE id=?",
      record.id,
    );
    return {
      id: record.id,
      status: record.status,
      expiresAt: record.expires_at,
      clientName: record.client_name,
      fingerprint: record.credential_hash?.slice(0, 8),
      mcpSeen: credential?.mcp_seen ?? null,
    };
  }

  latest(actor: Actor, projectId: string, agentId: string) {
    this.service.human(actor);
    this.service.project(actor, projectId);
    requireThat(
      this.store.one(
        "SELECT 1 FROM agents WHERE id=? AND project_id=? AND owner_id=? AND revoked=0",
        agentId,
        projectId,
        actor.id,
      ),
      403,
      "You can only connect your own AI",
    );
    const record = this.store.one(
      "SELECT id FROM agent_pairings WHERE agent_id=? AND owner_id=? AND status<>'cancelled' AND (status='approved' OR expires_at>?) ORDER BY created_at DESC,rowid DESC LIMIT 1",
      agentId,
      actor.id,
      now(),
    );
    return { request: record ? this.status(actor, record.id) : null };
  }

  respond(actor: Actor, pairingId: string, input: unknown) {
    const { action } = z
      .object({ action: z.enum(["approve", "cancel"]) })
      .parse(input);
    this.status(actor, pairingId);
    this.store.transaction(() => {
      const record = this.store.one(
        "SELECT * FROM agent_pairings WHERE id=?",
        pairingId,
      )!;
      if (action === "approve") {
        requireThat(
          ["claimed", "approved"].includes(record.status),
          409,
          "Wait for the client before approving",
        );
        this.store.run(
          "INSERT OR IGNORE INTO agent_credentials(id,agent_id,token_hash,created_at) VALUES(?,?,?,?)",
          record.id,
          record.agent_id,
          record.credential_hash,
          now(),
        );
        requireThat(
          this.store.one(
            "SELECT 1 FROM agent_credentials WHERE id=?",
            record.id,
          ),
          409,
          "Credential is already registered",
        );
        this.store.run(
          "UPDATE agent_pairings SET status='approved' WHERE id=?",
          record.id,
        );
      } else {
        this.store.run("DELETE FROM agent_credentials WHERE id=?", record.id);
        this.store.run(
          "UPDATE agent_pairings SET status='cancelled' WHERE id=?",
          record.id,
        );
        this.service.emit(
          record.project_id,
          "agent.connection_revoked",
          { agentId: record.agent_id },
          actor.id,
        );
      }
    });
    return this.status(actor, pairingId);
  }
}
