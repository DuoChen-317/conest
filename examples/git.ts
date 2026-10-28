/** Owner-paired outbound Git runner + separate private stdio MCP. No public question handling. */
import { randomBytes, createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  gitActionSchema,
  isPublish,
  isWrite,
  type GitAction,
} from "../shared/git.ts";
import { privateText } from "./credentials.ts";
import { GitRepository, prepareRepository } from "./git-repository.ts";

const schema = z.object({
  version: z.literal(1),
  url: z.string().url(),
  projectId: z.string(),
  agentId: z.string(),
  workspaceId: z.string().uuid(),
  tokenFile: z.string(),
  deviceTokenFile: z.string(),
  root: z.string(),
  remoteUrl: z.string(),
  baseBranch: z.string(),
  branch: z.string(),
  allowWrite: z.boolean(),
  allowPush: z.boolean(),
});
export type GitConfig = z.infer<typeof schema>;
const fingerprint = (s: string) => createHash("sha256").update(s).digest("hex");
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export class GitConnection {
  constructor(
    public config: GitConfig,
    private configPath?: string,
  ) {}
  async request(path: string, method = "GET", body?: unknown) {
    const c = this.config;
    const token = (await privateText(c.tokenFile)).trim(),
      device = (await privateText(c.deviceTokenFile)).trim();
    if (
      !/^cn_[A-Za-z0-9_-]+$/.test(token) ||
      !/^cng_[A-Za-z0-9_-]+$/.test(device)
    )
      throw new Error("Invalid local connection credential");
    const base = new URL(c.url);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      throw new Error("Use a CoNest service origin");
    const target = new URL(
      `/api/projects/${encodeURIComponent(c.projectId)}/git/workspaces/${encodeURIComponent(c.workspaceId)}${path}`,
      base,
    );
    const host =
      target.protocol === "http:" && target.hostname.endsWith(".localhost")
        ? target.host
        : null;
    if (host) target.hostname = "127.0.0.1";
    const response = await fetch(target, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Conest-Runner": device,
        "Content-Type": "application/json",
        ...(host ? { Host: host } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const e = new Error(`CoNest Git request failed (${response.status})`);
      (e as any).status = response.status;
      throw e;
    }
    return response.json();
  }
  async authorize(a: GitAction) {
    if (this.configPath) {
      const fresh = schema.parse(
        JSON.parse(await privateText(this.configPath)),
      );
      for (const k of [
        "url",
        "projectId",
        "agentId",
        "workspaceId",
        "root",
        "tokenFile",
        "deviceTokenFile",
        "remoteUrl",
        "baseBranch",
        "branch",
      ] as const)
        if (fresh[k] !== this.config[k])
          throw new Error("Git workspace identity changed; restart the runner");
      this.config = fresh;
    }
    if (
      (isWrite(a) && !this.config.allowWrite) ||
      (isPublish(a) && !this.config.allowPush)
    )
      throw new Error("Local Git grant does not allow this operation");
    const grant = await this.request("/authorize", "POST", a);
    if (
      grant.agentId !== this.config.agentId ||
      grant.remoteUrl !== this.config.remoteUrl ||
      grant.baseBranch !== this.config.baseBranch ||
      grant.branch !== this.config.branch
    )
      throw new Error("Git repository authorization changed");
    return grant;
  }
  async executeJob(job: { id: string; leaseId: string; action: GitAction }) {
    let result: Record<string, any> | undefined, error: string | undefined;
    try {
      await this.authorize(job.action);
      result = await new GitRepository(
        this.config.root,
        this.config.remoteUrl,
        this.config.baseBranch,
        false,
        this.config.branch,
      ).execute(job.action, () => this.authorize(job.action));
    } catch (e) {
      error = (e as NodeJS.ErrnoException).code
        ? "Local Git file operation failed"
        : e instanceof Error
          ? e.message
          : "Local Git operation failed";
    }
    // Retrying acknowledgement must never re-run a commit or push.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.request(`/jobs/${job.id}/finish`, "POST", {
          leaseId: job.leaseId,
          result,
          error,
        });
        return;
      } catch (e) {
        if ([401, 403, 404, 409].includes((e as any).status) || attempt === 2)
          throw e;
        await pause(1000);
      }
    }
  }
}

async function load(path: string) {
  const c = schema.parse(JSON.parse(await privateText(path)));
  for (const p of [c.root, c.tokenFile, c.deviceTokenFile])
    if (!isAbsolute(p)) throw new Error("Use absolute local paths");
  const root = await realpath(c.root);
  if (root !== c.root) throw new Error("Git workspace path changed");
  for (const p of [path, c.tokenFile, c.deviceTokenFile]) {
    const r = relative(root, await realpath(p));
    if (r === "" || (!r.startsWith("../") && r !== ".." && !isAbsolute(r)))
      throw new Error(
        "Keep Git configuration and credentials outside the workspace",
      );
  }
  return new GitConnection(c, path);
}
async function pair() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 64000) throw new Error("Input too large");
  }
  const options = z
    .object({
      url: z.string().url(),
      projectId: z.string(),
      agentId: z.string(),
      workspaceId: z.string().uuid(),
      connectionConfig: z.string(),
      root: z.string(),
      mode: z.enum(["clone", "existing"]),
      remoteUrl: z.string(),
      baseBranch: z.string(),
      allowWrite: z.boolean().default(false),
      allowPush: z.boolean().default(false),
      clientName: z.string().max(60).default("Local Git"),
    })
    .parse(JSON.parse(input));
  if (!isAbsolute(options.root) || !isAbsolute(options.connectionConfig))
    throw new Error("Use absolute paths");
  const connection = JSON.parse(await privateText(options.connectionConfig));
  if (
    connection.url !== options.url ||
    connection.projectId !== options.projectId ||
    connection.agentId !== options.agentId
  )
    throw new Error(
      "Choose this AI's existing CoNest connection configuration",
    );
  const base = join(homedir(), ".config", "conest", "git");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(base, "workspace-"));
  const deviceTokenFile = join(directory, "runner-credential"),
    configPath = join(directory, "git.json"),
    device = `cng_${randomBytes(32).toString("base64url")}`;
  await writeFile(deviceTokenFile, device, { mode: 0o600, flag: "wx" });
  const config: GitConfig = {
    version: 1,
    url: options.url,
    projectId: options.projectId,
    agentId: options.agentId,
    workspaceId: options.workspaceId,
    tokenFile: connection.tokenFile,
    deviceTokenFile,
    root: options.root,
    remoteUrl: options.remoteUrl,
    baseBranch: options.baseBranch,
    branch: "",
    allowWrite: options.allowWrite,
    allowPush: options.allowPush,
  };
  const local = new GitConnection(config);
  await local.request("/hello", "POST", {
    deviceHash: fingerprint(device),
    clientName: options.clientName,
  });
  console.error(
    JSON.stringify({
      status: "waiting_for_owner_approval",
      fingerprint: fingerprint(device).slice(0, 8),
    }),
  );
  let state: any;
  for (let i = 0; i < 300; i++) {
    state = await local.request("/state");
    if (state.status === "ready") break;
    await pause(2000);
  }
  if (state?.status !== "ready")
    throw new Error("Local runner approval timed out");
  config.branch = (
    await local.request("/authorize", "POST", { kind: "status" })
  ).branch;
  await local.authorize({ kind: "status" });
  const workRoot = `${options.root}.conest-${options.workspaceId}`;
  // Both the source clone and derived worktree must exclude all local credentials/configuration.
  for (const root of [options.root, workRoot])
    for (const file of [
      configPath,
      deviceTokenFile,
      connection.tokenFile,
      options.connectionConfig,
    ]) {
      const r = relative(root, file);
      if (!r.startsWith("../") && r !== ".." && !isAbsolute(r))
        throw new Error("Keep connection files outside repository directories");
    }
  const repo = await prepareRepository({ ...options, taskId: state.taskId });
  config.root = repo.root;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.error(
    JSON.stringify({
      status: "repository_ready",
      configPath,
      root: repo.root,
      branch: (await repo.status()).branch,
    }),
  );
  await run(configPath);
}
async function run(path: string) {
  const local = await load(path),
    lockPath = join(path + ".lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      "This Git runner is already running; inspect its lock before restarting",
    );
  }
  await lock.writeFile(String(process.pid));
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await local.authorize({ kind: "status" });
    while (!stopped) {
      try {
        const { job } = await local.request("/claim", "POST", {});
        if (job) await local.executeJob(job);
      } catch (e) {
        if ([401, 403, 404].includes((e as any).status)) throw e;
        console.error(
          "Git runner temporarily disconnected; no operation will be replayed",
        );
      }
      if (!stopped) await pause(2000);
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await lock.close();
    await unlink(lockPath);
  }
}
export function gitMcp(local: GitConnection) {
  const server = new McpServer({
    name: "conest-private-git",
    version: "0.1.0",
  });
  server.registerTool(
    "get_git_workspace",
    {
      description:
        "Inspect this fixed owner-approved Git workspace. Private owner/task session only; never mount in shared question sessions.",
      inputSchema: {},
    },
    async () => {
      try {
        await local.authorize({ kind: "status" });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                workspaceId: local.config.workspaceId,
                root: local.config.root,
                allowWrite: local.config.allowWrite,
                allowPush: local.config.allowPush,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : "Git authorization failed",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "git_operation",
    {
      description:
        "Run a typed Git operation in this fixed workspace via its local runner. Review status.version and diff before commit/push. Commit requires explicit paths; push publishes a task branch and shared review metadata. No arbitrary commands or merge.",
      inputSchema: { action: gitActionSchema },
    },
    async ({ action }) => {
      try {
        await local.authorize(action);
        const { id } = await local.request("/local-jobs", "POST", action);
        for (let i = 0; i < 160; i++) {
          const job = await local.request(`/local-jobs/${id}`);
          if (job.status === "succeeded")
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(job.result) },
              ],
            };
          if (["failed", "uncertain"].includes(job.status))
            throw new Error(job.error);
          await pause(1000);
        }
        throw new Error(
          "Operation still pending; inspect its status before retrying",
        );
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : "Git operation failed",
            },
          ],
        };
      }
    },
  );
  return server;
}
async function main() {
  if (process.argv[2] === "pair" && process.argv.length === 3) return pair();
  if (
    !["run", "mcp"].includes(process.argv[2]) ||
    process.argv[3] !== "--config" ||
    process.argv.length !== 5
  )
    throw new Error(
      "Use pair with JSON stdin, or run/mcp --config /absolute/git.json",
    );
  if (process.argv[2] === "run") return run(process.argv[4]);
  const local = await load(process.argv[4]);
  await local.authorize({ kind: "status" });
  await gitMcp(local).connect(new StdioServerTransport());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "Git connection stopped. Check local configuration, browser approval, repository and credentials. No credential was printed.",
    );
    process.exitCode = 1;
  });
