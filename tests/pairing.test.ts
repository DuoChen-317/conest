import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "../server/app.ts";
import { buildPairingPrompt } from "../src/pairing-prompt.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const token = () => "cn_" + randomBytes(32).toString("base64url");
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "conest-pairing-"));
  const { app, store } = createApp({
    database: join(directory, "database.sqlite"),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = async (
    identity: string,
    path: string,
    method = "GET",
    body?: unknown,
    expected = 200,
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
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return {
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  };
  const alice = await request(
    "",
    "/auth/register",
    "POST",
    { username: "alice", name: "Alice", password: "pairing-test-password" },
    201,
  );
  const bob = await request(
    "",
    "/auth/register",
    "POST",
    { username: "bob", name: "Bob", password: "pairing-test-password" },
    201,
  );
  const project = (
    await request(
      alice.cookie,
      "/projects",
      "POST",
      { name: "Pairing project" },
      201,
    )
  ).data;
  const endpoint = `/projects/${project.id}`;
  const invite = (
    await request(alice.cookie, `${endpoint}/invites`, "POST", {}, 201)
  ).data;
  await request(bob.cookie, "/invites/accept", "POST", { token: invite.token });
  const agent = (
    await request(
      alice.cookie,
      `${endpoint}/agents`,
      "POST",
      { name: "Atlas", model: "test" },
      201,
    )
  ).data;
  const pairingPath = `${endpoint}/agents/${agent.id}/pairings`;
  const create = async () =>
    (await request(alice.cookie, pairingPath, "POST", {}, 201)).data;
  return {
    directory,
    url,
    store,
    request,
    alice,
    bob,
    project,
    endpoint,
    agent,
    pairingPath,
    create,
  };
}

test("pairing requires the AI owner's explicit approval and stores hashes only", async (t) => {
  const f = await fixture(t);
  await f.request("", f.pairingPath, "POST", {}, 401);
  await f.request(f.bob.cookie, f.pairingPath, "POST", {}, 403);
  await f.request(f.agent.token, f.pairingPath, "POST", {}, 403);
  const ticket = await f.create(),
    credential = token();
  await f.request(credential, "/me", "GET", undefined, 401);
  const claim = (
    await f.request("", "/connect/claim", "POST", {
      code: ticket.code,
      credentialHash: hash(credential),
      clientName: "Local test client",
    })
  ).data;
  assert.equal(claim.agentId, f.agent.id);
  await f.request("", "/connect/claim", "POST", {
    code: ticket.code,
    credentialHash: hash(credential),
    clientName: "Local test client",
  });
  await f.request(
    "",
    "/connect/claim",
    "POST",
    {
      code: ticket.code,
      credentialHash: hash(token()),
      clientName: "Another client",
    },
    409,
  );
  await f.request(credential, "/me", "GET", undefined, 401);
  await f.request(
    f.bob.cookie,
    `/connect/requests/${ticket.id}`,
    "PATCH",
    { action: "approve" },
    404,
  );
  await f.request(
    "",
    "/connect/poll",
    "POST",
    { id: ticket.id, token: token() },
    404,
  );
  const status = (
    await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`)
  ).data;
  assert.equal(status.fingerprint, hash(credential).slice(0, 8));
  assert.equal(status.mcpSeen, null);
  const restored = (await f.request(f.alice.cookie, `${f.pairingPath}/latest`))
    .data.request;
  assert.equal(restored.id, ticket.id);
  assert.equal(restored.status, "claimed");
  assert.equal(restored.code, undefined);
  await f.request(
    f.bob.cookie,
    `${f.pairingPath}/latest`,
    "GET",
    undefined,
    403,
  );
  assert.ok(!JSON.stringify(status).includes(ticket.code));
  await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`, "PATCH", {
    action: "approve",
  });
  assert.equal(
    (
      await f.request("", "/connect/poll", "POST", {
        id: ticket.id,
        token: credential,
      })
    ).data.status,
    "approved",
  );
  const identity = (await f.request(credential, "/me")).data.actor;
  assert.equal(identity.id, f.agent.id);
  assert.equal(identity.projectId, f.project.id);
  assert.equal(identity.credentialId, ticket.id);
  assert.ok(
    !JSON.stringify(f.store.all("SELECT * FROM agent_pairings")).includes(
      ticket.code,
    ),
  );
  assert.ok(
    !JSON.stringify(f.store.all("SELECT * FROM agent_credentials")).includes(
      credential,
    ),
  );
  await f.request(f.agent.token, "/me"); // Pairing does not replace the existing credential.
});

test("expiry, replacement, cancellation and credential revocation stop pairing work", async (t) => {
  const f = await fixture(t);
  let ticket = await f.create();
  await f.request(
    f.alice.cookie,
    `/connect/requests/${ticket.id}`,
    "PATCH",
    { action: "approve" },
    409,
  );
  f.store.run(
    "UPDATE agent_pairings SET expires_at='2000-01-01' WHERE id=?",
    ticket.id,
  );
  await f.request(
    "",
    "/connect/claim",
    "POST",
    { code: ticket.code, credentialHash: hash(token()), clientName: "expired" },
    410,
  );
  ticket = await f.create();
  const replacement = await f.create();
  await f.request(
    "",
    "/connect/claim",
    "POST",
    { code: ticket.code, credentialHash: hash(token()), clientName: "old" },
    409,
  );
  const credential = token();
  await f.request("", "/connect/claim", "POST", {
    code: replacement.code,
    credentialHash: hash(credential),
    clientName: "active",
  });
  await f.request(
    f.alice.cookie,
    `/connect/requests/${replacement.id}`,
    "PATCH",
    { action: "approve" },
  );
  const events = (await f.request(credential, `${f.endpoint}/events?after=0`))
    .data;
  const waiting = fetch(
    `${f.url}/api${f.endpoint}/events?after=${events.at(-1).id}&wait=20`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  await delay(30);
  await f.request(
    f.alice.cookie,
    `/connect/requests/${replacement.id}`,
    "PATCH",
    { action: "cancel" },
  );
  assert.equal((await waiting).status, 401);
  await f.request(credential, "/me", "GET", undefined, 401);
  await f.request(
    f.alice.cookie,
    `/connect/requests/${replacement.id}`,
    "PATCH",
    { action: "approve" },
    409,
  );
  const next = await f.create(),
    nextToken = token();
  await f.request("", "/connect/claim", "POST", {
    code: next.code,
    credentialHash: hash(nextToken),
    clientName: "active",
  });
  await f.request(f.alice.cookie, `/connect/requests/${next.id}`, "PATCH", {
    action: "approve",
  });
  await f.request(
    f.alice.cookie,
    `${f.endpoint}/agents/${f.agent.id}`,
    "DELETE",
  );
  await f.request(nextToken, "/me", "GET", undefined, 401);
  await f.request(f.agent.token, "/me", "GET", undefined, 401);
  const crossOrigin = await fetch(`${f.url}/api/connect/claim`, {
    method: "POST",
    headers: {
      Origin: "https://unrelated.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
});

test("downloaded setup helper pairs end to end and bridges a real stdio MCP client", async (t) => {
  const f = await fixture(t),
    ticket = await f.create();
  const download = await fetch(`${f.url}/api/connect/bootstrap`);
  assert.match(download.headers.get("cache-control")!, /no-store/);
  const source = await download.text();
  assert.equal(hash(source), ticket.bootstrapSha256);
  const script = join(f.directory, "conest-connect.mjs");
  await writeFile(script, source);
  const child = spawn(process.execPath, [script, "pair"], {
    env: { ...process.env, HOME: f.directory },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "",
    diagnostics = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (diagnostics += chunk));
  const closed = once(child, "close");
  child.stdin.end(
    JSON.stringify({
      url: f.url.replace("127.0.0.1", "pairing-test.localhost"),
      code: ticket.code,
      clientName: "Real local helper",
      projectId: f.project.id,
      agentId: f.agent.id,
    }),
  );
  try {
    let status;
    for (let count = 0; count < 100; count++) {
      status = (
        await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`)
      ).data;
      if (status.status === "claimed") break;
      await delay(20);
    }
    assert.equal(status.status, "claimed", diagnostics);
    for (
      let count = 0;
      count < 30 && !diagnostics.includes(status.fingerprint);
      count++
    )
      await delay(10);
    assert.ok(diagnostics.includes(status.fingerprint));
    await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`, "PATCH", {
      action: "approve",
    });
    assert.equal((await closed)[0], 0, diagnostics);
    const ready = JSON.parse(output);
    assert.equal(ready.status, "credential_verified");
    const config = JSON.parse(await readFile(ready.configPath, "utf8"));
    const credential = await readFile(config.tokenFile, "utf8");
    assert.equal((await stat(config.tokenFile)).mode & 0o077, 0);
    assert.equal((await stat(ready.configPath)).mode & 0o077, 0);
    assert.ok(
      !output.includes(credential) && !diagnostics.includes(credential),
    );
    assert.equal(
      (await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`)).data
        .mcpSeen,
      null,
    );
    const client = new Client({ name: "bridge-test", version: "1" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [script, "proxy", "--config", ready.configPath],
        stderr: "pipe",
      }),
    );
    try {
      assert.ok(
        (await client.listTools()).tools.some(
          (tool) => tool.name === "propose_task",
        ),
      );
      const project: any = await client.callTool({
        name: "get_project",
        arguments: {},
      });
      assert.equal(
        JSON.parse(project.content[0].text).project.id,
        f.project.id,
      );
      const sent: any = await client.callTool({
        name: "send_message",
        arguments: { body: "中文桥接验证 🚀" },
      });
      assert.equal(JSON.parse(sent.content[0].text).body, "中文桥接验证 🚀");
      assert.ok(
        (await f.request(f.alice.cookie, `/connect/requests/${ticket.id}`)).data
          .mcpSeen,
      );
      await f.request(
        f.alice.cookie,
        `/connect/requests/${ticket.id}`,
        "PATCH",
        { action: "cancel" },
      );
      await assert.rejects(
        client.callTool({ name: "get_project", arguments: {} }),
      );
    } finally {
      await client.close();
    }
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await closed;
    }
  }
});

test("connection prompts use short-lived pairing without model keys or permanent credentials", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const prompt = buildPairingPrompt(
      {
        origin: "https://conest.example",
        code: "x".repeat(43),
        projectId: "p",
        agentId: "a",
        bootstrapSha256: "f".repeat(64),
      },
      locale,
    );
    assert.ok(
      prompt.includes("/api/connect/bootstrap") &&
        prompt.includes("get_project"),
    );
    assert.ok(prompt.includes("proxy") && prompt.includes("--config"));
    assert.ok(!prompt.includes("cn_") && !prompt.includes("<CONEST_AI_TOKEN>"));
    assert.ok(
      prompt.includes("codex mcp add") && prompt.includes("claude mcp add"),
    );
  }
  assert.throws(() =>
    buildPairingPrompt(
      {
        origin: "https://user:secret@example.com",
        code: "x".repeat(43),
        projectId: "p",
        agentId: "a",
        bootstrapSha256: "f".repeat(64),
      },
      "en",
    ),
  );
});
