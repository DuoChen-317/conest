import { z } from "zod";
import {
  gitActionSchema,
  isPublish,
  isWrite,
  repoSchema,
  reviewUrl,
  workBranch,
  type GitAction,
} from "../shared/git.ts";
import { hash, id, now } from "./store.ts";
import { requireThat, type Actor, type Service } from "./service.ts";

/** Metadata/owner-only jobs. This service never touches a local repository or invokes Git. */
export class GitWorkflow {
  constructor(private service: Service) {}
  get store() {
    return this.service.store;
  }
  private owned(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    human = true,
  ) {
    this.service.project(actor, projectId);
    if (human) this.service.human(actor);
    const w = this.store.one(
      "SELECT * FROM git_workspaces WHERE id=? AND project_id=? AND owner_id=?",
      workspaceId,
      projectId,
      actor.userId,
    );
    requireThat(w, 404, "Git workspace not found");
    return w;
  }
  list(actor: Actor, projectId: string) {
    this.service.project(actor, projectId);
    this.service.human(actor);
    this.expire();
    return {
      repository:
        this.store.one(
          "SELECT remote_url remoteUrl,base_branch baseBranch FROM git_repositories WHERE project_id=?",
          projectId,
        ) ?? null,
      workspaces: this.store
        .all(
          "SELECT id,agent_id,task_id,allow_write,allow_push,status,client_name,last_seen,summary,created_at,substr(device_hash,1,8) fingerprint FROM git_workspaces WHERE project_id=? AND owner_id=? AND status<>'revoked' ORDER BY created_at DESC",
          projectId,
          actor.id,
        )
        .map((w) => ({
          ...w,
          summary: w.summary ? JSON.parse(w.summary) : null,
          lastJob:
            this.store.one(
              "SELECT id,status,error,json_extract(action,'$.kind') kind FROM git_jobs WHERE workspace_id=? ORDER BY rowid DESC LIMIT 1",
              w.id,
            ) ?? null,
        })),
      reviews: this.store.all(
        "SELECT r.*,u.name owner_name FROM git_reviews r JOIN users u ON u.id=r.owner_id WHERE r.project_id=? ORDER BY r.created_at DESC LIMIT 30",
        projectId,
      ),
    };
  }
  repository(actor: Actor, projectId: string, input: unknown) {
    this.service.manager(actor, projectId);
    const data = repoSchema.parse(input);
    requireThat(
      !this.store.one(
        "SELECT 1 FROM git_workspaces WHERE project_id=? AND status<>'revoked' AND (remote_url<>? OR base_branch<>?)",
        projectId,
        data.remoteUrl,
        data.baseBranch,
      ),
      409,
      "Disconnect existing workspaces before changing the repository",
    );
    this.store.run(
      "INSERT INTO git_repositories VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET remote_url=excluded.remote_url,base_branch=excluded.base_branch,updated_at=excluded.updated_at",
      projectId,
      data.remoteUrl,
      data.baseBranch,
      now(),
    );
    return data;
  }
  create(actor: Actor, projectId: string, input: unknown) {
    this.service.project(actor, projectId);
    this.service.human(actor);
    const data = z
      .object({
        agentId: z.string(),
        taskId: z.string().optional(),
        allowWrite: z.boolean().default(false),
        allowPush: z.boolean().default(false),
      })
      .parse(input);
    requireThat(
      this.store.one(
        "SELECT 1 FROM agents WHERE id=? AND project_id=? AND owner_id=? AND revoked=0",
        data.agentId,
        projectId,
        actor.id,
      ),
      403,
      "You can only connect your own AI",
    );
    if (data.taskId)
      requireThat(
        this.store.one(
          "SELECT 1 FROM tasks WHERE id=? AND project_id=? AND assignee_id=? AND status IN ('todo','in_progress')",
          data.taskId,
          projectId,
          data.agentId,
        ),
        403,
        "Task must be approved and assigned to this AI",
      );
    const repo = this.store.one(
      "SELECT * FROM git_repositories WHERE project_id=?",
      projectId,
    );
    requireThat(repo, 409, "Connect a repository first");
    requireThat(
      this.store.one(
        "SELECT count(*) n FROM git_workspaces WHERE project_id=? AND owner_id=? AND status<>'revoked'",
        projectId,
        actor.id,
      )!.n < 20,
      409,
      "Too many Git workspaces",
    );
    const workspaceId = id();
    this.store.run(
      "INSERT INTO git_workspaces(id,project_id,owner_id,agent_id,task_id,remote_url,base_branch,allow_write,allow_push,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      workspaceId,
      projectId,
      actor.id,
      data.agentId,
      data.taskId ?? null,
      repo.remote_url,
      repo.base_branch,
      +data.allowWrite,
      +data.allowPush,
      now(),
    );
    return {
      id: workspaceId,
      remoteUrl: repo.remote_url,
      baseBranch: repo.base_branch,
    };
  }
  change(actor: Actor, projectId: string, workspaceId: string, input: unknown) {
    const w = this.owned(actor, projectId, workspaceId);
    const { action } = z
      .object({ action: z.enum(["approve", "revoke"]) })
      .parse(input);
    if (action === "approve")
      requireThat(
        w.status === "claimed",
        409,
        "Wait for the local runner before approving",
      );
    this.store.run(
      "UPDATE git_workspaces SET status=? WHERE id=?",
      action === "approve" ? "ready" : "revoked",
      w.id,
    );
    if (action === "revoke")
      this.store.run(
        "UPDATE git_jobs SET status=CASE WHEN status='running' THEN 'uncertain' ELSE 'failed' END,error='Workspace disconnected' WHERE workspace_id=? AND status IN ('queued','running')",
        w.id,
      );
    return { ok: true };
  }
  private device(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
    ready = true,
  ) {
    const w = this.owned(actor, projectId, workspaceId, false);
    requireThat(
      actor.type === "agent" && actor.id === w.agent_id,
      403,
      "Only the bound AI can run this workspace",
    );
    requireThat(
      token && w.device_hash === hash(token),
      403,
      "Local runner identity does not match",
    );
    requireThat(
      w.status === "ready" || (!ready && w.status === "claimed"),
      403,
      "Local runner approval is required",
    );
    return w;
  }
  hello(actor: Actor, projectId: string, workspaceId: string, input: unknown) {
    const w = this.owned(actor, projectId, workspaceId, false);
    const data = z
      .object({
        deviceHash: z.string().regex(/^[a-f0-9]{64}$/),
        clientName: z.string().trim().min(1).max(60),
      })
      .parse(input);
    requireThat(
      actor.type === "agent" && actor.id === w.agent_id,
      403,
      "Only the bound AI can run this workspace",
    );
    requireThat(
      w.status === "waiting" ||
        (w.status === "claimed" && w.device_hash === data.deviceHash),
      409,
      "Workspace already claimed or disconnected",
    );
    this.store.run(
      "UPDATE git_workspaces SET status='claimed',device_hash=?,client_name=? WHERE id=?",
      data.deviceHash,
      data.clientName,
      w.id,
    );
    return { fingerprint: data.deviceHash.slice(0, 8) };
  }
  authorization(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
    input: unknown,
  ) {
    const w = this.device(actor, projectId, workspaceId, token);
    const action = gitActionSchema.parse(input);
    this.allowed(w, action);
    return {
      remoteUrl: w.remote_url,
      baseBranch: w.base_branch,
      taskId: w.task_id,
      agentId: w.agent_id,
      branch: workBranch(w.id, w.task_id),
      allowWrite: !!w.allow_write,
      allowPush: !!w.allow_push,
    };
  }
  private allowed(w: any, a: GitAction) {
    requireThat(
      !isWrite(a) || w.allow_write,
      403,
      "Local Git write permission is disabled",
    );
    requireThat(
      !isPublish(a) || w.allow_push,
      403,
      "Git publication permission is disabled",
    );
    if (w.task_id) {
      const task = this.store.one(
        "SELECT status FROM tasks WHERE id=? AND project_id=? AND assignee_id=?",
        w.task_id,
        w.project_id,
        w.agent_id,
      );
      requireThat(
        task &&
          (isWrite(a) || isPublish(a)
            ? ["todo", "in_progress"].includes(task.status)
            : ["todo", "in_progress", "review", "done"].includes(task.status)),
        403,
        "Task must be approved and assigned to this AI",
      );
    }
  }
  state(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
  ) {
    const w = this.device(actor, projectId, workspaceId, token, false);
    return {
      status: w.status,
      remoteUrl: w.remote_url,
      baseBranch: w.base_branch,
      taskId: w.task_id,
    };
  }
  localEnqueue(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
    input: unknown,
  ) {
    const w = this.device(actor, projectId, workspaceId, token);
    this.allowed(w, gitActionSchema.parse(input));
    // Private local MCP uses an additional machine credential, unavailable to remote question sessions.
    return this.enqueue(
      { ...actor, id: actor.userId, type: "human", credentialId: undefined },
      projectId,
      workspaceId,
      input,
    );
  }
  localJob(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
    jobId: string,
  ) {
    this.device(actor, projectId, workspaceId, token);
    return this.job(
      { ...actor, id: actor.userId, type: "human", credentialId: undefined },
      projectId,
      workspaceId,
      jobId,
    );
  }
  enqueue(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    input: unknown,
  ) {
    const w = this.owned(actor, projectId, workspaceId);
    const a = gitActionSchema.parse(input);
    requireThat(w.status === "ready", 409, "Local runner approval is required");
    this.allowed(w, a);
    this.expire();
    requireThat(
      w.last_seen && Date.parse(w.last_seen) > Date.now() - 30000,
      409,
      "Local runner is offline",
    );
    requireThat(
      !this.store.one(
        "SELECT 1 FROM git_jobs WHERE workspace_id=? AND status IN ('queued','running')",
        w.id,
      ),
      409,
      "A Git operation is already running",
    );
    const jobId = id();
    this.store.run(
      "INSERT INTO git_jobs(id,workspace_id,action,created_at) VALUES(?,?,?,?)",
      jobId,
      w.id,
      JSON.stringify(a),
      now(),
    );
    // Limit retained private file/diff results; shared reviews contain metadata only.
    this.store.run(
      "DELETE FROM git_jobs WHERE workspace_id=? AND status NOT IN ('queued','running') AND id NOT IN (SELECT id FROM git_jobs WHERE workspace_id=? ORDER BY rowid DESC LIMIT 20)",
      w.id,
      w.id,
    );
    return { id: jobId };
  }
  job(actor: Actor, projectId: string, workspaceId: string, jobId: string) {
    this.owned(actor, projectId, workspaceId);
    this.expire();
    const j = this.store.one(
      "SELECT id,status,result,error FROM git_jobs WHERE id=? AND workspace_id=?",
      jobId,
      workspaceId,
    );
    requireThat(j, 404, "Git operation not found");
    return { ...j, result: j.result ? JSON.parse(j.result) : null };
  }
  private expire() {
    const cutoff = new Date(Date.now() - 600000).toISOString();
    this.store.run(
      "UPDATE git_jobs SET status='uncertain',error='Operation timed out; inspect the repository before retrying' WHERE status='running' AND claimed_at<?",
      cutoff,
    );
    this.store.run(
      "UPDATE git_jobs SET status='failed',error='Local runner did not receive the operation' WHERE status='queued' AND created_at<?",
      cutoff,
    );
  }
  claim(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
  ) {
    const w = this.device(actor, projectId, workspaceId, token);
    this.expire();
    this.store.run(
      "UPDATE git_workspaces SET last_seen=? WHERE id=?",
      now(),
      w.id,
    );
    return this.store.transaction(() => {
      if (
        this.store.one(
          "SELECT 1 FROM git_jobs WHERE workspace_id=? AND status='running'",
          w.id,
        )
      )
        return { job: null };
      const j = this.store.one(
        "SELECT * FROM git_jobs WHERE workspace_id=? AND status='queued' ORDER BY rowid LIMIT 1",
        w.id,
      );
      if (!j) return { job: null };
      const a = gitActionSchema.parse(JSON.parse(j.action));
      try {
        this.allowed(w, a);
      } catch {
        this.store.run(
          "UPDATE git_jobs SET status='failed',error='Permission or task assignment changed' WHERE id=?",
          j.id,
        );
        return { job: null };
      }
      const leaseId = id();
      this.store.run(
        "UPDATE git_jobs SET status='running',lease_id=?,claimed_at=? WHERE id=?",
        leaseId,
        now(),
        j.id,
      );
      return { job: { id: j.id, action: a, leaseId } };
    });
  }
  finish(
    actor: Actor,
    projectId: string,
    workspaceId: string,
    token: string | undefined,
    jobId: string,
    input: unknown,
  ) {
    const w = this.device(actor, projectId, workspaceId, token);
    const data = z
      .object({
        leaseId: z.string(),
        result: z.record(z.string(), z.unknown()).optional(),
        error: z.string().max(500).optional(),
      })
      .parse(input);
    requireThat(
      Buffer.byteLength(JSON.stringify(data)) < 1_500_000,
      413,
      "Git result is too large",
    );
    return this.store.transaction(() => {
      const j = this.store.one(
        "SELECT * FROM git_jobs WHERE id=? AND workspace_id=? AND lease_id=?",
        jobId,
        w.id,
        data.leaseId,
      );
      requireThat(j, 404, "Git operation not found");
      if (["succeeded", "failed"].includes(j.status)) return { ok: true };
      requireThat(
        j.status === "running",
        409,
        "Git operation lease expired; inspect the repository",
      );
      requireThat(data.error || data.result, 400, "A Git result is required");
      this.store.run(
        "UPDATE git_jobs SET status=?,result=?,error=? WHERE id=?",
        data.error ? "failed" : "succeeded",
        data.result ? JSON.stringify(data.result) : null,
        data.error ?? null,
        j.id,
      );
      const a: GitAction = JSON.parse(j.action);
      if (!data.error && a.kind === "status" && data.result)
        this.store.run(
          "UPDATE git_workspaces SET summary=? WHERE id=?",
          JSON.stringify(data.result),
          w.id,
        );
      if (!data.error && a.kind === "push" && data.result) {
        const r = z
          .object({
            branch: z.string().regex(/^conest\/[a-zA-Z0-9/_-]+$/),
            head: z.string().regex(/^[a-f0-9]{40,64}$/),
          })
          .parse(data.result);
        requireThat(
          r.branch === workBranch(w.id, w.task_id),
          400,
          "Git branch does not match this workspace",
        );
        this.store.run(
          "INSERT INTO git_reviews VALUES(?,?,?,?,?,?,?,?,?)",
          id(),
          projectId,
          w.id,
          w.task_id,
          w.owner_id,
          r.branch,
          r.head,
          reviewUrl(w.remote_url, w.base_branch, r.branch),
          now(),
        );
        if (w.task_id)
          this.store.run(
            "UPDATE tasks SET status='review' WHERE id=? AND assignee_id=? AND status IN ('todo','in_progress')",
            w.task_id,
            w.agent_id,
          );
        this.service.emit(projectId, "git.submitted", {
          taskId: w.task_id,
          branch: r.branch,
          commit: r.head,
          actorName: actor.name,
        });
      }
      return { ok: true };
    });
  }
}
