import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import {
  GitRepository,
  prepareRepository,
  safeGitPath,
} from "../examples/git-repository.ts";
import { gitActionSchema, validRemote, reviewUrl } from "../shared/git.ts";

const command = (dir: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  }).trim();
async function repository(t: TestContext) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "conest-git-"))),
    remote = join(dir, "remote.git"),
    seed = join(dir, "seed"),
    root = join(dir, "project");
  await mkdir(seed);
  command(seed, "init", "--initial-branch=main");
  command(seed, "config", "user.name", "Git Test");
  command(seed, "config", "user.email", "git@test.local");
  await writeFile(join(seed, "README.md"), "original\n");
  await writeFile(join(seed, "other.txt"), "other\n");
  command(seed, "add", ".");
  command(seed, "commit", "-m", "Initial");
  command(dir, "init", "--bare", "--initial-branch=main", remote);
  command(seed, "remote", "add", "origin", remote);
  command(seed, "push", "origin", "main");
  command(dir, "clone", remote, root);
  command(root, "config", "user.name", "Git Test");
  command(root, "config", "user.email", "git@test.local");
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, remote, seed, root };
}

test("typed Git input refuses shell/protocol injection and unsafe branch names", () => {
  for (const remote of [
    "file:///tmp/secret",
    "ext::sh -c evil",
    "https://token@github.com/a/b",
    "https://github.com/a/b?token=x",
    "-u=evil",
    "ssh://git:password@host/a",
  ])
    assert.equal(validRemote(remote), false, remote);
  for (const remote of [
    "https://github.com/team/repo.git",
    "git@github.com:team/repo.git",
    "ssh://git@example.org/team/repo.git",
  ])
    assert.equal(validRemote(remote), true, remote);
  for (const p of [
    "../a",
    ".git/config",
    "src/.env.local",
    "x.pem",
    "credentials.json",
    "/tmp/a",
    "src\\a",
  ])
    assert.equal(safeGitPath(p), false, p);
  assert.equal(safeGitPath("src/main.ts"), true);
  assert.throws(() =>
    gitActionSchema.parse({ kind: "shell", command: "rm -rf ." }),
  );
  assert.match(
    reviewUrl("git@github.com:team/repo.git", "main", "conest/task-123")!,
    /^https:\/\/github.com\/team\/repo\/compare\//,
  );
  assert.equal(
    reviewUrl(
      "https://selfhost.example/team/repo.git",
      "main",
      "conest/task-123",
    ),
    null,
  );
});

test("clone creates an independent worktree, preserves original edits, and refuses existing destinations", async (t) => {
  const f = await repository(t);
  await writeFile(join(f.root, "README.md"), "original dirty work");
  const repo = await prepareRepository(
    {
      root: join(f.dir, "clone"),
      mode: "clone",
      remoteUrl: f.remote,
      baseBranch: "main",
      workspaceId: "test-workspace",
      taskId: "task-123",
    },
    true,
  );
  assert.match(repo.root, /\.conest-test-workspace$/);
  assert.match((await repo.status()).branch, /^conest\/task-/);
  assert.equal(
    await readFile(join(repo.root, "README.md"), "utf8"),
    "original\n",
  );
  assert.equal(
    await readFile(join(f.root, "README.md"), "utf8"),
    "original dirty work",
  );
  await assert.rejects(
    prepareRepository(
      {
        root: f.root,
        mode: "clone",
        remoteUrl: f.remote,
        baseBranch: "main",
        workspaceId: "no",
      },
      true,
    ),
    /already exists/,
  );
});

test("real Git status/diff/CAS commits only selected paths, bypasses hooks, pushes branch, and rejects stale snapshots", async (t) => {
  const f = await repository(t);
  command(f.root, "switch", "-c", "conest/test");
  const repo = new GitRepository(f.root, f.remote, "main", true);
  await writeFile(join(f.root, "README.md"), "updated\n");
  await writeFile(join(f.root, "other.txt"), "unrelated\n");
  let s = await repo.execute({ kind: "status" });
  assert.equal(s.changes.length, 2);
  const diff = await repo.execute({ kind: "diff", path: "README.md" });
  assert.match(diff.content, /\+updated/);
  await writeFile(join(f.root, "README.md"), "changed again\n");
  await assert.rejects(
    repo.execute({
      kind: "commit",
      paths: ["README.md"],
      message: "stale",
      expectedVersion: s.version,
    }),
    /Repository changed/,
  );
  s = await repo.execute({ kind: "status" });
  // A repository hook would leave evidence if it ran.
  const evidence = join(f.dir, "hook-ran");
  const hook = join(f.root, ".git", "hooks", "pre-commit");
  await writeFile(hook, `#!/bin/sh\ntouch '${evidence}'\nexit 1\n`, {
    mode: 0o700,
  });
  let checks = 0;
  s = await repo.execute(
    {
      kind: "commit",
      paths: ["README.md"],
      message: "Selected change",
      expectedVersion: s.version,
    },
    async () => {
      checks++;
    },
  );
  assert.equal(checks, 2);
  assert.equal(s.changes.length, 1);
  assert.equal(s.changes[0].path, "other.txt");
  assert.equal(command(f.root, "show", "HEAD:other.txt"), "other");
  await assert.rejects(readFile(evidence));
  await assert.rejects(
    repo.execute({ kind: "push", expectedVersion: s.version }),
    /local changes/,
  );
  command(f.root, "restore", "--", "other.txt");
  s = await repo.execute({ kind: "status" });
  const pushed = await repo.execute({
    kind: "push",
    expectedVersion: s.version,
  });
  assert.equal(pushed.branch, "conest/test");
  assert.equal(
    command(f.remote, "rev-parse", "refs/heads/conest/test"),
    pushed.head,
  );
  const files = await repo.execute({ kind: "files" });
  assert.ok(files.paths.includes("README.md"));
  assert.equal(
    (await repo.execute({ kind: "read", path: "README.md" })).content,
    "changed again\n",
  );
  assert.equal(
    (await repo.execute({ kind: "log" })).commits[0].subject,
    "Selected change",
  );
});

test("Git rejects staged unrelated work, secret files, symlink escapes, changed origins and executable repository config", async (t) => {
  const f = await repository(t);
  const repo = new GitRepository(f.root, f.remote, "main", true);
  await writeFile(join(f.root, "README.md"), "edit");
  command(f.root, "add", "README.md");
  let s = await repo.execute({ kind: "status" });
  await assert.rejects(
    repo.execute({
      kind: "commit",
      paths: ["README.md"],
      message: "bad",
      expectedVersion: s.version,
    }),
    /index already/,
  );
  command(f.root, "reset");
  await writeFile(join(f.root, ".env"), "secret");
  await symlink(join(f.dir, "outside"), join(f.root, "escape"));
  await assert.rejects(
    repo.execute({ kind: "read", path: ".env" }),
    /permitted/,
  );
  await assert.rejects(
    repo.execute({ kind: "read", path: "escape" }),
    /Symlinks/,
  );
  command(f.root, "config", "core.sshCommand", "sh -c evil");
  await assert.rejects(
    repo.execute({ kind: "files" }),
    /unsupported executable/,
  );
  command(f.root, "config", "--unset", "core.sshCommand");
  command(f.root, "remote", "set-url", "origin", join(f.dir, "another"));
  await assert.rejects(repo.execute({ kind: "files" }), /origin differs/);
});

test("sync is fast-forward only and refuses to discard local work or divergent commits", async (t) => {
  const f = await repository(t);
  command(f.root, "switch", "-c", "conest/test");
  const repo = new GitRepository(f.root, f.remote, "main", true);
  await writeFile(join(f.seed, "README.md"), "upstream");
  command(f.seed, "add", "README.md");
  command(f.seed, "commit", "-m", "Upstream");
  command(f.seed, "push", "origin", "main");
  let s = await repo.execute({ kind: "status" });
  await repo.execute({ kind: "sync", expectedVersion: s.version });
  assert.equal(await readFile(join(f.root, "README.md"), "utf8"), "upstream");
  await writeFile(join(f.root, "README.md"), "local change");
  s = await repo.execute({ kind: "status" });
  await assert.rejects(
    repo.execute({ kind: "sync", expectedVersion: s.version }),
    /local changes/,
  );
  s = await repo.execute({
    kind: "commit",
    paths: ["README.md"],
    message: "Local",
    expectedVersion: s.version,
  });
  await writeFile(join(f.seed, "other.txt"), "upstream diverged");
  command(f.seed, "add", "other.txt");
  command(f.seed, "commit", "-m", "Diverge");
  command(f.seed, "push", "origin", "main");
  await assert.rejects(
    repo.execute({ kind: "sync", expectedVersion: s.version }),
  );
  assert.equal(
    await readFile(join(f.root, "README.md"), "utf8"),
    "local change",
  );
  assert.equal(command(f.root, "log", "-1", "--format=%s"), "Local");
});

async function serviceFixture(t: TestContext) {
  const f = createApp({ database: ":memory:" }),
    server = f.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    f.store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    identity = "",
    expected = 200,
    device?: string,
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(identity.startsWith("cn_")
          ? { Authorization: `Bearer ${identity}` }
          : { Cookie: identity }),
        ...(device ? { "X-Conest-Runner": device } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    assert.equal(res.status, expected, JSON.stringify(data));
    return { data, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
  };
  const owner = await request(
    "/auth/register",
    "POST",
    { username: "git_owner", name: "Owner", password: "test-git-password" },
    "",
    201,
  );
  const other = await request(
    "/auth/register",
    "POST",
    { username: "git_other", name: "Other", password: "test-git-password" },
    "",
    201,
  );
  const p = (
      await request("/projects", "POST", { name: "Git" }, owner.cookie, 201)
    ).data,
    endpoint = `/projects/${p.id}`;
  const invite = (
    await request(endpoint + "/invites", "POST", {}, owner.cookie, 201)
  ).data;
  await request(
    "/invites/accept",
    "POST",
    { token: invite.token },
    other.cookie,
  );
  const agent = (
    await request(
      endpoint + "/agents",
      "POST",
      { name: "Builder", model: "test" },
      owner.cookie,
      201,
    )
  ).data;
  const task = (
    await request(
      endpoint + "/tasks",
      "POST",
      { title: "Build", description: "", status: "todo", assigneeId: agent.id },
      owner.cookie,
      201,
    )
  ).data;
  await request(
    endpoint + "/git/repository",
    "PUT",
    { remoteUrl: "https://github.com/team/repo.git", baseBranch: "main" },
    owner.cookie,
  );
  return {
    ...f,
    request,
    owner,
    other,
    agent,
    task,
    endpoint,
    origin: base.slice(0, -4),
  };
}

test("Git HTTP enforces human approval, owner-only results, device identity and live task grants; acknowledgement is idempotent", async (t) => {
  const f = await serviceFixture(t),
    { request, owner, other, agent, task, endpoint } = f;
  const root = endpoint + "/git";
  await request(
    root + "/repository",
    "PUT",
    { remoteUrl: "https://github.com/other/repo", baseBranch: "main" },
    other.cookie,
    403,
  );
  await request(
    root + "/workspaces",
    "POST",
    { agentId: agent.id },
    agent.token,
    403,
  );
  await request(
    root + "/workspaces",
    "POST",
    { agentId: agent.id },
    other.cookie,
    403,
  );
  const w = (
    await request(
      root + "/workspaces",
      "POST",
      { agentId: agent.id, taskId: task.id, allowWrite: true, allowPush: true },
      owner.cookie,
      201,
    )
  ).data;
  const wr = root + "/workspaces/" + w.id,
    device = "cng_test-device",
    { hash } = await import("../server/store.ts");
  await request(wr, "PATCH", { action: "approve" }, owner.cookie, 409);
  await request(
    wr + "/hello",
    "POST",
    { deviceHash: hash(device), clientName: "Test computer" },
    agent.token,
  );
  await request(wr + "/claim", "POST", {}, agent.token, 403, device);
  await request(wr, "PATCH", { action: "approve" }, owner.cookie);
  await request(wr + "/claim", "POST", {}, agent.token, 403, "wrong");
  await request(wr + "/claim", "POST", {}, agent.token, 200, device);
  await request(wr + "/jobs", "POST", { kind: "status" }, agent.token, 403);
  const job = (
    await request(wr + "/jobs", "POST", { kind: "status" }, owner.cookie, 201)
  ).data;
  await request(wr + "/jobs", "POST", { kind: "status" }, owner.cookie, 409);
  const claim = (
    await request(wr + "/claim", "POST", {}, agent.token, 200, device)
  ).data.job;
  assert.equal(claim.id, job.id);
  assert.equal(
    (await request(wr + "/claim", "POST", {}, agent.token, 200, device)).data
      .job,
    null,
  );
  const output = {
    branch: `conest/task-${task.id.slice(0, 8)}-${w.id.slice(0, 8)}`,
    head: "a".repeat(40),
    version: "b".repeat(64),
    changes: [],
  };
  const finish = { leaseId: claim.leaseId, result: output };
  await request(
    wr + `/jobs/${job.id}/finish`,
    "POST",
    finish,
    agent.token,
    200,
    device,
  );
  await request(
    wr + `/jobs/${job.id}/finish`,
    "POST",
    finish,
    agent.token,
    200,
    device,
  );
  assert.equal(
    (await request(wr + `/jobs/${job.id}`, "GET", undefined, owner.cookie)).data
      .result.branch,
    output.branch,
  );
  await request(wr + `/jobs/${job.id}`, "GET", undefined, other.cookie, 404);
  assert.equal(
    (await request(root, "GET", undefined, other.cookie)).data.workspaces
      .length,
    0,
  );
  const pushed = (
    await request(
      wr + "/jobs",
      "POST",
      { kind: "push", expectedVersion: output.version },
      owner.cookie,
      201,
    )
  ).data;
  const pushClaim = (
    await request(wr + "/claim", "POST", {}, agent.token, 200, device)
  ).data.job;
  await request(
    wr + `/jobs/${pushed.id}/finish`,
    "POST",
    { leaseId: pushClaim.leaseId, result: output },
    agent.token,
    200,
    device,
  );
  await request(
    wr + `/jobs/${pushed.id}/finish`,
    "POST",
    { leaseId: pushClaim.leaseId, result: output },
    agent.token,
    200,
    device,
  );
  assert.equal(
    f.store.one("SELECT status FROM tasks WHERE id=?", task.id)!.status,
    "review",
  );
  assert.equal(
    (await request(root, "GET", undefined, other.cookie)).data.reviews.length,
    1,
  );
  await request(
    wr + "/authorize",
    "POST",
    {
      kind: "commit",
      paths: ["README.md"],
      message: "no",
      expectedVersion: output.version,
    },
    agent.token,
    403,
    device,
  );
  await request(
    wr + "/authorize",
    "POST",
    { kind: "status" },
    agent.token,
    200,
    device,
  );
  await request(wr, "PATCH", { action: "revoke" }, owner.cookie);
  await request(wr + "/claim", "POST", {}, agent.token, 403, device);
});

test("Git publication and writes are separate; queued grants are rechecked and expired jobs are never replayed", async (t) => {
  const f = await serviceFixture(t),
    { request, owner, agent, endpoint, store } = f;
  const root = endpoint + "/git";
  const w = (
    await request(
      root + "/workspaces",
      "POST",
      { agentId: agent.id, allowWrite: true },
      owner.cookie,
      201,
    )
  ).data;
  const wr = root + "/workspaces/" + w.id,
    device = "cng_device",
    { hash } = await import("../server/store.ts");
  await request(
    wr + "/hello",
    "POST",
    { deviceHash: hash(device), clientName: "Computer" },
    agent.token,
  );
  await request(wr, "PATCH", { action: "approve" }, owner.cookie);
  await request(wr + "/claim", "POST", {}, agent.token, 200, device);
  await request(
    wr + "/jobs",
    "POST",
    { kind: "push", expectedVersion: "b".repeat(64) },
    owner.cookie,
    403,
  );
  await request(
    wr + "/local-jobs",
    "POST",
    { kind: "status" },
    agent.token,
    403,
    "wrong",
  );
  const job = (
    await request(
      wr + "/local-jobs",
      "POST",
      { kind: "status" },
      agent.token,
      201,
      device,
    )
  ).data;
  await request(wr + "/claim", "POST", {}, agent.token, 200, device);
  store.run("UPDATE git_jobs SET claimed_at='2000-01-01' WHERE id=?", job.id);
  assert.equal(
    (await request(wr + "/jobs/" + job.id, "GET", undefined, owner.cookie)).data
      .status,
    "uncertain",
  );
  assert.equal(
    (await request(wr + "/claim", "POST", {}, agent.token, 200, device)).data
      .job,
    null,
  );
  const commit = (
    await request(
      wr + "/jobs",
      "POST",
      {
        kind: "commit",
        paths: ["README.md"],
        message: "test",
        expectedVersion: "b".repeat(64),
      },
      owner.cookie,
      201,
    )
  ).data;
  store.run("UPDATE git_workspaces SET allow_write=0 WHERE id=?", w.id);
  assert.equal(
    (await request(wr + "/claim", "POST", {}, agent.token, 200, device)).data
      .job,
    null,
  );
  assert.equal(
    (await request(wr + "/jobs/" + commit.id, "GET", undefined, owner.cookie))
      .data.status,
    "failed",
  );
});

test("actual outbound runner pairs, waits for owner approval, executes local commits, and serves private MCP", async (t) => {
  const f = await serviceFixture(t),
    r = await repository(t);
  const { request, owner, agent, endpoint } = f;
  const remote = "https://github.com/team/repo.git";
  command(r.root, "remote", "set-url", "origin", remote);
  const w = (
    await request(
      endpoint + "/git/workspaces",
      "POST",
      { agentId: agent.id, allowWrite: true },
      owner.cookie,
      201,
    )
  ).data;
  const tokenFile = join(r.dir, "credential"),
    connectionConfig = join(r.dir, "connection.json");
  await writeFile(tokenFile, agent.token, { mode: 0o600 });
  await writeFile(
    connectionConfig,
    JSON.stringify({
      url: f.origin,
      projectId: endpoint.split("/")[2],
      agentId: agent.id,
      tokenFile,
    }),
    { mode: 0o600 },
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "examples/git.ts", "pair"],
    {
      cwd: process.cwd(),
      env: { ...process.env, HOME: r.dir },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "",
    stdout = "";
  child.stderr.on("data", (b) => (stderr += b));
  child.stdout.on("data", (b) => (stdout += b));
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("close", () => resolve());
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000).unref();
    });
  });
  child.stdin.end(
    JSON.stringify({
      url: f.origin,
      projectId: endpoint.split("/")[2],
      agentId: agent.id,
      workspaceId: w.id,
      connectionConfig,
      root: r.root,
      mode: "existing",
      remoteUrl: remote,
      baseBranch: "main",
      allowWrite: true,
      allowPush: false,
    }),
  );
  const event = async (status: string) => {
    for (let i = 0; i < 100; i++) {
      const found = stderr
        .split("\n")
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        })
        .find((row) => row.status === status);
      if (found) return found;
      if (child.exitCode !== null) assert.fail(stderr);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    assert.fail("Runner did not report " + status + ": " + stderr);
  };
  const waiting = await event("waiting_for_owner_approval");
  assert.match(waiting.fingerprint, /^[a-f0-9]{8}$/);
  assert.equal(
    (await request(endpoint + "/git", "GET", undefined, owner.cookie)).data
      .workspaces[0].status,
    "claimed",
  );
  await request(
    endpoint + `/git/workspaces/${w.id}`,
    "PATCH",
    { action: "approve" },
    owner.cookie,
  );
  const ready = await event("repository_ready");
  assert.match(ready.root, /\.conest-/);
  const wr = endpoint + `/git/workspaces/${w.id}`;
  for (let i = 0; i < 50; i++) {
    if (
      f.store.one("SELECT last_seen FROM git_workspaces WHERE id=?", w.id)!
        .last_seen
    )
      break;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  async function perform(action: unknown) {
    const j = (await request(wr + "/jobs", "POST", action, owner.cookie, 201))
      .data;
    for (let i = 0; i < 100; i++) {
      const job = (
        await request(wr + "/jobs/" + j.id, "GET", undefined, owner.cookie)
      ).data;
      if (job.status === "succeeded") return job.result;
      if (job.status === "failed") assert.fail(job.error);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    assert.fail("Runner did not complete job");
  }
  let status = await perform({ kind: "status" });
  assert.equal(status.branch, `conest/workspace-${w.id.slice(0, 8)}`);
  await writeFile(join(ready.root, "README.md"), "runner edit\n");
  status = await perform({ kind: "status" });
  status = await perform({
    kind: "commit",
    paths: ["README.md"],
    message: "Via real runner",
    expectedVersion: status.version,
  });
  assert.equal(status.changes.length, 0);
  assert.equal(
    command(ready.root, "log", "-1", "--format=%s"),
    "Via real runner",
  );
  assert.equal(command(r.root, "log", "-1", "--format=%s"), "Initial");
  const mcp = new Client({ name: "git-test", version: "1" });
  await mcp.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        "examples/git.ts",
        "mcp",
        "--config",
        ready.configPath,
      ],
      cwd: process.cwd(),
      stderr: "pipe",
    }),
  );
  try {
    assert.deepEqual(
      (await mcp.listTools()).tools.map((tool) => tool.name).sort(),
      ["get_git_workspace", "git_operation"],
    );
    const info: any = await mcp.callTool({
      name: "get_git_workspace",
      arguments: {},
    });
    assert.equal(JSON.parse(info.content[0].text).root, ready.root);
    const result: any = await mcp.callTool({
      name: "git_operation",
      arguments: { action: { kind: "log" } },
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      JSON.parse(result.content[0].text).commits[0].subject,
      "Via real runner",
    );
    const denied: any = await mcp.callTool({
      name: "git_operation",
      arguments: { action: { kind: "push", expectedVersion: status.version } },
    });
    assert.equal(denied.isError, true);
    await request(wr, "PATCH", { action: "revoke" }, owner.cookie);
    const revoked: any = await mcp.callTool({
      name: "get_git_workspace",
      arguments: {},
    });
    assert.equal(revoked.isError, true);
  } finally {
    await mcp.close();
  }
  assert.ok(!stderr.includes(agent.token));
  assert.equal(stdout, "");
});

test("review snapshots are checked again after authorization; a fixed workspace rejects a switched branch", async (t) => {
  const f = await repository(t);
  command(f.root, "switch", "-c", "conest/fixed");
  const repo = new GitRepository(
    f.root,
    f.remote,
    "main",
    true,
    "conest/fixed",
  );
  await writeFile(join(f.root, "README.md"), "reviewed");
  const status = await repo.execute({ kind: "status" }),
    head = command(f.root, "rev-parse", "HEAD");
  await assert.rejects(
    repo.execute(
      {
        kind: "commit",
        paths: ["README.md"],
        message: "must not commit",
        expectedVersion: status.version,
      },
      async () => {
        await writeFile(
          join(f.root, "README.md"),
          "changed during authorization",
        );
      },
    ),
    /Repository changed/,
  );
  assert.equal(command(f.root, "rev-parse", "HEAD"), head);
  assert.equal(command(f.root, "diff", "--cached", "--name-only"), "");
  command(f.root, "switch", "main");
  await assert.rejects(
    repo.execute({ kind: "files" }),
    /branch does not match/,
  );
});
