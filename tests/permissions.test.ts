import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../server/app.ts";

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "conest-permissions-"));
  const { app, store, service } = createApp({
    database: join(directory, "audit.sqlite"),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(
    identity: string,
    path: string,
    method = "GET",
    body?: unknown,
    expected = 200,
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(identity.startsWith("cn_")
          ? { Authorization: `Bearer ${identity}` }
          : { Cookie: identity }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return {
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  const alice = await request(
    "",
    "/auth/register",
    "POST",
    { username: "alice", name: "Alice", password: "audit-test-password" },
    201,
  );
  const bob = await request(
    "",
    "/auth/register",
    "POST",
    { username: "bob", name: "Bob", password: "audit-test-password" },
    201,
  );
  const project = (
    await request(
      alice.cookie,
      "/projects",
      "POST",
      { name: "Permissions audit" },
      201,
    )
  ).data;
  const endpoint = `/projects/${project.id}`;
  const link = (
    await request(alice.cookie, `${endpoint}/invites`, "POST", {}, 201)
  ).data;
  await request(bob.cookie, "/invites/accept", "POST", { token: link.token });
  const agent = (
    await request(
      bob.cookie,
      `${endpoint}/agents`,
      "POST",
      { name: "Bob AI", model: "Audit adapter" },
      201,
    )
  ).data;
  return {
    directory,
    store,
    service,
    base,
    request,
    alice,
    bob,
    project,
    endpoint,
    agent,
  };
}

test("withdrawing direct-message consent invalidates old work even after consent is restored", async (t) => {
  const { request, endpoint, alice, bob, agent } = await fixture(t);
  const preferences = (allowDirect: boolean) =>
    request(bob.cookie, `${endpoint}/agents/${agent.id}/preferences`, "PATCH", {
      meetingPolicy: "ask",
      allowDirect,
    });
  await preferences(true);
  const conversation = (
    await request(
      alice.cookie,
      `${endpoint}/conversations`,
      "POST",
      { agentId: agent.id },
      201,
    )
  ).data;
  const path = `${endpoint}/conversations/${conversation.id}/messages`;
  await request(
    alice.cookie,
    path,
    "POST",
    { body: "Question before withdrawal" },
    201,
  );
  const item = (await request(agent.token, `${endpoint}/agent-requests`))
    .data[0];
  const claim = (
    await request(
      agent.token,
      `${endpoint}/agent-requests/${item.id}/claim`,
      "POST",
      {},
    )
  ).data;
  await preferences(false);
  await preferences(true);
  await request(
    agent.token,
    `${endpoint}/agent-requests/${item.id}/reply`,
    "POST",
    { leaseId: claim.leaseId, body: "Old result must not revive" },
    409,
  );
  assert.equal((await request(alice.cookie, path)).data.length, 1);
  assert.equal(
    (await request(agent.token, `${endpoint}/agent-requests`)).data.length,
    0,
  );
  await request(
    alice.cookie,
    `${endpoint}/agent-requests/${item.id}/retry`,
    "POST",
    {},
  );
  const fresh = (
    await request(
      agent.token,
      `${endpoint}/agent-requests/${item.id}/claim`,
      "POST",
      {},
    )
  ).data;
  assert.notEqual(fresh.leaseId, claim.leaseId);
});

test("an AI owner can withdraw meeting access after attendance and invalidate in-flight replies", async (t) => {
  const { request, endpoint, alice, bob, agent } = await fixture(t);
  const meeting = (
    await request(
      alice.cookie,
      `${endpoint}/meetings`,
      "POST",
      { title: "Owner-controlled meeting", agentIds: [agent.id] },
      201,
    )
  ).data;
  const invitation = (await request(bob.cookie, "/notifications")).data.find(
    (i: any) => i.actor_id === agent.id,
  );
  await request(bob.cookie, `/notifications/${invitation.id}`, "PATCH", {
    action: "accept",
  });
  await request(
    agent.token,
    `${endpoint}/meetings/${meeting.id}/join`,
    "POST",
    {},
  );
  await request(
    alice.cookie,
    `${endpoint}/messages`,
    "POST",
    {
      meetingId: meeting.id,
      recipientAgentIds: [agent.id],
      body: "Question before withdrawal",
    },
    201,
  );
  const item = (await request(agent.token, `${endpoint}/agent-requests`))
    .data[0];
  const claim = (
    await request(
      agent.token,
      `${endpoint}/agent-requests/${item.id}/claim`,
      "POST",
      {},
    )
  ).data;
  await request(bob.cookie, `/notifications/${invitation.id}`, "PATCH", {
    action: "decline",
  });
  await request(
    agent.token,
    `${endpoint}/messages?meetingId=${meeting.id}`,
    "GET",
    undefined,
    403,
  );
  assert.ok(
    !(await request(alice.cookie, endpoint)).data.presence.some(
      (p: any) => p.actor_id === agent.id && p.meeting_id === meeting.id,
    ),
  );
  await request(bob.cookie, `/notifications/${invitation.id}`, "PATCH", {
    action: "accept",
  });
  await request(
    agent.token,
    `${endpoint}/agent-requests/${item.id}/reply`,
    "POST",
    { leaseId: claim.leaseId, body: "Stale meeting reply" },
    409,
  );
  assert.equal(
    (await request(agent.token, `${endpoint}/agent-requests`)).data.length,
    0,
  );
});

test("AI cannot reopen a task already verified as done by a human", async (t) => {
  const { request, endpoint, alice, agent } = await fixture(t);
  const task = (
    await request(
      alice.cookie,
      `${endpoint}/tasks`,
      "POST",
      { title: "Verified work", assigneeId: agent.id },
      201,
    )
  ).data;
  await request(alice.cookie, `${endpoint}/tasks/${task.id}`, "PATCH", {
    status: "done",
  });
  await request(
    agent.token,
    `${endpoint}/tasks/${task.id}`,
    "PATCH",
    { status: "in_progress" },
    403,
  );
  await request(alice.cookie, `${endpoint}/tasks/${task.id}`, "PATCH", {
    status: "todo",
  });
});

test("revoking an AI credential also rejects an already waiting event poll", async (t) => {
  const { request, endpoint, bob, agent, store } = await fixture(t);
  const cursor = store.one("SELECT COALESCE(max(id),0) id FROM events")!.id;
  const pending = request(
    agent.token,
    `${endpoint}/events?after=${cursor}&wait=2`,
    "GET",
    undefined,
    401,
  );
  await delay(30);
  await request(bob.cookie, `${endpoint}/agents/${agent.id}`, "DELETE");
  await pending;
});

test("the public event adapter never receives private office, file or direct-conversation context", async (t) => {
  const { request, endpoint, alice, bob, agent, directory, base } =
    await fixture(t);
  await request(
    bob.cookie,
    `${endpoint}/office/messages`,
    "POST",
    { body: "audit-private-office-marker" },
    201,
  );
  await request(
    bob.cookie,
    `${endpoint}/files`,
    "POST",
    {
      path: "private/audit-marker.md",
      content: "private",
      visibility: "private",
      baseVersion: 0,
    },
    201,
  );
  await request(
    bob.cookie,
    `${endpoint}/agents/${agent.id}/preferences`,
    "PATCH",
    { meetingPolicy: "ask", allowDirect: true },
  );
  await request(
    alice.cookie,
    `${endpoint}/conversations`,
    "POST",
    { agentId: agent.id },
    201,
  );
  const cursor = (await request(agent.token, `${endpoint}/events`)).data.at(
    -1,
  ).id;
  const cursorFile = join(directory, "cursor.json"),
    capture = join(directory, "capture.json"),
    handler = join(directory, "capture.mjs");
  writeFileSync(cursorFile, JSON.stringify({ cursor }));
  writeFileSync(
    handler,
    "import fs from 'node:fs';let input='';for await (const chunk of process.stdin) input+=chunk;fs.writeFileSync(process.argv[2],input);process.stdout.write('[]');",
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "examples/agent.ts"],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CONEST_URL: base,
        CONEST_TOKEN: agent.token,
        CONEST_CURSOR_FILE: cursorFile,
        CONEST_HANDLER: JSON.stringify([process.execPath, handler, capture]),
      },
      stdio: "ignore",
    },
  );
  try {
    await request(
      alice.cookie,
      `${endpoint}/messages`,
      "POST",
      { body: "audit-public-question" },
      201,
    );
    for (let i = 0; i < 100 && !existsSync(capture); i++) await delay(30);
    assert.ok(
      existsSync(capture),
      "the real listener must deliver the public question to the handler",
    );
    const payload = JSON.parse(readFileSync(capture, "utf8"));
    assert.equal(payload.event.payload.body, "audit-public-question");
    assert.ok(!JSON.stringify(payload).includes("audit-private-office-marker"));
    assert.ok(!JSON.stringify(payload).includes("private/audit-marker.md"));
    assert.deepEqual(payload.project.conversations, []);
  } finally {
    const closed = new Promise<void>((resolve) =>
      child.once("close", () => resolve()),
    );
    child.kill("SIGTERM");
    if (child.exitCode === null) await closed;
  }
});

test("compressed request bodies are rejected before parsing and the service stays available", async (t) => {
  const { base } = await fixture(t);
  const payload = Buffer.concat([
    gzipSync(Buffer.from('{"username":"unused","password":"test"}')),
    Buffer.from("trailing-data"),
  ]);
  const response = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body: payload,
  });
  assert.equal(response.status, 415);
  assert.equal((await fetch(base + "/api/health")).status, 200);
});
