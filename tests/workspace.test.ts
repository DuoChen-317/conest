import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  symlink,
  link,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LocalWorkspace, type WorkspaceConfig } from "../examples/workspace.ts";
import { localToken } from "../examples/credentials.ts";
import { buildSetupPrompt } from "../src/connector-setup.ts";
import { createApp } from "../server/app.ts";

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "conest-workspace-"));
  const root = join(dir, "project");
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "src", "main.ts"), "private local code");
  await writeFile(join(root, "docs", "notes.md"), "private notes");
  const { app, store } = createApp({ database: join(dir, "server.sqlite") });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    identity = "",
  ) => {
    const response = await fetch(url + "/api" + path, {
      method,
      headers: {
        ...(identity.startsWith("cn_")
          ? { Authorization: `Bearer ${identity}` }
          : { Cookie: identity }),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.ok(response.ok, await response.clone().text());
    return {
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  };
  const owner = await request("/auth/register", "POST", {
    username: "owner",
    name: "Owner",
    password: "workspace-test-password",
  });
  const project = (
    await request(
      "/projects",
      "POST",
      { name: "Workspace project" },
      owner.cookie,
    )
  ).data;
  const endpoint = `/projects/${project.id}`;
  const agent = (
    await request(
      `${endpoint}/agents`,
      "POST",
      { name: "Builder", model: "test" },
      owner.cookie,
    )
  ).data;
  const tokenFile = join(dir, "credential");
  const configPath = join(dir, "workspace.json");
  await writeFile(tokenFile, agent.token, { mode: 0o600 });
  let config: WorkspaceConfig = {
    version: 1,
    url,
    projectId: project.id,
    agentId: agent.id,
    root,
    tokenFile,
    officeAccess: "read",
    tasks: [],
  };
  const save = async (update: Partial<WorkspaceConfig>) => {
    config = { ...config, ...update };
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  };
  await save({});
  return {
    dir,
    root,
    url,
    store,
    configPath,
    tokenFile,
    config,
    save,
    agent,
    owner,
    endpoint,
    request,
  };
}

test("private local MCP reads the bound directory, with no publication or command tools", async (t) => {
  const f = await fixture(t);
  const client = new Client({ name: "workspace-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        "examples/workspace.ts",
        "--config",
        f.configPath,
        "--scope",
        "office",
      ],
      cwd: process.cwd(),
      stderr: "pipe",
    }),
  );
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "get_local_workspace",
      "list_local_files",
      "read_local_file",
      "write_local_file",
    ]);
    const reply: any = await client.callTool({
      name: "read_local_file",
      arguments: { path: "src/main.ts" },
    });
    assert.equal(
      JSON.parse(reply.content[0].text).content,
      "private local code",
    );
    const write: any = await client.callTool({
      name: "write_local_file",
      arguments: {
        path: "src/main.ts",
        content: "unauthorized",
        baseVersion: null,
      },
    });
    assert.equal(write.isError, true);
    assert.match(write.content[0].text, /permission/);
    assert.equal(f.store.one("SELECT count(*) n FROM files")!.n, 0);
    assert.equal(f.store.one("SELECT count(*) n FROM messages")!.n, 0);
  } finally {
    await client.close();
  }
  // The remotely exposed CoNest MCP has no access to local directory tools.
  const remote = new Client({ name: "remote-test", version: "1" });
  await remote.connect(
    new StreamableHTTPClientTransport(new URL(f.url + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${f.agent.token}` } },
    }),
  );
  try {
    assert.ok(
      (await remote.listTools()).tools.every(
        (tool) => !tool.name.includes("local_"),
      ),
    );
  } finally {
    await remote.close();
  }
});

test("local file tools reject traversal, symlink escapes, hardlinks, secrets and unsupported files", async (t) => {
  const f = await fixture(t);
  const outside = join(f.dir, "outside.txt");
  await writeFile(outside, "must not leave this directory");
  await symlink(outside, join(f.root, "escape.txt"));
  await symlink(f.dir, join(f.root, "linked-dir"));
  await link(outside, join(f.root, "hardlink.txt"));
  await writeFile(join(f.root, ".env"), "PRIVATE_KEY=never-read");
  await writeFile(join(f.root, "key.pem"), "private key");
  await writeFile(join(f.root, "binary.bin"), Buffer.from([0, 1, 2]));
  await writeFile(join(f.root, "large.txt"), "x".repeat(64001));
  const workspace = await LocalWorkspace.load(f.configPath, {
    scope: "office",
  });
  for (const path of [
    "../outside.txt",
    outside,
    "src/../../outside.txt",
    "src\\main.ts",
    "escape.txt",
    "linked-dir/outside.txt",
    "hardlink.txt",
    ".env",
    "key.pem",
    "binary.bin",
    "large.txt",
  ])
    await assert.rejects(
      workspace.read(path),
      (error: unknown) => error instanceof Error,
      path,
    );
  const listing = await workspace.list(".");
  assert.ok(listing.some((item) => item.path === "src"));
  assert.ok(
    listing.every(
      (item) =>
        ![
          ".env",
          "key.pem",
          "escape.txt",
          "linked-dir",
          "hardlink.txt",
        ].includes(item.path),
    ),
  );
});

test("explicit local write grants preserve versions and cannot replace outside files", async (t) => {
  const f = await fixture(t);
  await f.save({ officeAccess: "read-write" });
  const workspace = await LocalWorkspace.load(f.configPath, {
    scope: "office",
  });
  const before = await workspace.read("src/main.ts");
  await workspace.write("src/main.ts", "changed code", before.version);
  assert.equal(
    await readFile(join(f.root, "src/main.ts"), "utf8"),
    "changed code",
  );
  await assert.rejects(
    workspace.write("src/main.ts", "stale code", before.version),
    /File changed/,
  );
  await workspace.write("src/new.ts", "new code", null);
  await assert.rejects(
    workspace.write("src/new.ts", "overwrite", null),
    /File changed/,
  );
  await assert.rejects(workspace.write("../outside.txt", "escape", null));
  const outside = join(f.dir, "outside.txt");
  await writeFile(outside, "original");
  await symlink(outside, join(f.root, "escape.txt"));
  await assert.rejects(workspace.write("escape.txt", "changed", null));
  assert.equal(await readFile(outside, "utf8"), "original");
  await f.save({ officeAccess: "none" });
  await assert.rejects(workspace.read("src/main.ts"), /permission/);
  await assert.rejects(
    workspace.write("src/new.ts", "changed", null),
    /permission/,
  );
});

test("task sessions require local subtree approval plus live human approval and assignment", async (t) => {
  const f = await fixture(t);
  const task = (
    await f.request(
      `${f.endpoint}/tasks`,
      "POST",
      { title: "Work on code" },
      f.agent.token,
    )
  ).data;
  await f.save({
    officeAccess: "none",
    tasks: [{ id: task.id, paths: ["src"], access: "read-write" }],
  });
  const workspace = await LocalWorkspace.load(f.configPath, {
    scope: "task",
    taskId: task.id,
  });
  await assert.rejects(workspace.read("src/main.ts"), /approved/);
  await f.request(
    `${f.endpoint}/tasks/${task.id}`,
    "PATCH",
    { status: "todo", assigneeId: f.agent.id },
    f.owner.cookie,
  );
  const before = await workspace.read("src/main.ts");
  await workspace.write("src/main.ts", "task result", before.version);
  await assert.rejects(workspace.read("docs/notes.md"), /grant/);
  await assert.rejects(workspace.list("."), /grant/);
  await assert.rejects(
    workspace.write("docs/output.md", "outside task scope", null),
    /grant/,
  );
  await f.request(
    `${f.endpoint}/tasks/${task.id}`,
    "PATCH",
    { status: "review" },
    f.agent.token,
  );
  await assert.rejects(workspace.read("src/main.ts"), /approved/);
  await assert.rejects(
    workspace.write("src/result.ts", "after review", null),
    /approved/,
  );
  await f.request(
    `${f.endpoint}/tasks/${task.id}`,
    "PATCH",
    { status: "todo", assigneeId: null },
    f.owner.cookie,
  );
  await assert.rejects(workspace.read("src/main.ts"), /assigned/);
  await f.request(
    `${f.endpoint}/tasks/${task.id}`,
    "PATCH",
    { status: "todo", assigneeId: f.agent.id },
    f.owner.cookie,
  );
  await f.save({ tasks: [] });
  await assert.rejects(workspace.read("src/main.ts"), /local task grant/);
});

test("local configuration binds identity and keeps credentials outside the directory", async (t) => {
  const f = await fixture(t);
  await chmod(f.configPath, 0o644);
  await assert.rejects(
    LocalWorkspace.load(f.configPath, { scope: "office" }),
    /owner-only/,
  );
  await chmod(f.configPath, 0o600);
  assert.equal(
    await localToken({ CONEST_TOKEN_FILE: f.tokenFile }),
    f.agent.token,
  );
  await chmod(f.tokenFile, 0o644);
  await assert.rejects(
    localToken({ CONEST_TOKEN_FILE: f.tokenFile }),
    /owner-only/,
  );
  await chmod(f.tokenFile, 0o600);
  await f.save({ agentId: "different-ai" });
  const wrong = await LocalWorkspace.load(f.configPath, { scope: "office" });
  await assert.rejects(wrong.read("src/main.ts"), /identity/);
  await f.save({ agentId: f.agent.id });
  const workspace = await LocalWorkspace.load(f.configPath, {
    scope: "office",
  });
  await f.request(
    `${f.endpoint}/agents/${f.agent.id}`,
    "DELETE",
    undefined,
    f.owner.cookie,
  );
  await assert.rejects(workspace.read("src/main.ts"), /revoked/);
  const insideToken = join(f.root, "credential");
  await writeFile(insideToken, f.agent.token, { mode: 0o600 });
  await f.save({ tokenFile: insideToken });
  await assert.rejects(
    LocalWorkspace.load(f.configPath, { scope: "office" }),
    /outside/,
  );
});

test("workspace setup separates private tools from public replies and contains no credential", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const prompt = buildSetupPrompt(
      {
        origin: "https://conest.example",
        projectId: "p",
        agentId: "a",
        pollSeconds: 5,
        scope: "all",
        instructions: "",
        workspace: { root: "/Users/me/private-project", officeAccess: "read" },
      },
      locale,
    );
    const configs = [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
      (match) => JSON.parse(match[1]),
    );
    assert.equal(configs[0].CONEST_TOKEN, undefined);
    assert.equal(configs[0].CONEST_TOKEN_FILE, "<ABSOLUTE_TOKEN_FILE>");
    assert.equal(configs[1].root, "/Users/me/private-project");
    assert.deepEqual(configs[1].tasks, []);
    assert.equal(configs[1].officeAccess, "read");
    assert.ok(
      prompt.includes("--scope office") && prompt.includes("--task TASK_ID"),
    );
    assert.ok(!prompt.includes("cn_"));
  }
});
