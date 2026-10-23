import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("CoNest: two independent clients collaborate with enforced identity, permissions and versions", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "conest-test-"));
  const database = join(dir, "test.sqlite");
  const { app, store } = createApp({ database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    identity?: string,
    expected = 200,
  ) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (identity)
      headers[identity.startsWith("cn_") ? "Authorization" : "Cookie"] =
        identity.startsWith("cn_") ? `Bearer ${identity}` : identity;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    assert.equal(res.status, expected, JSON.stringify(result));
    return {
      data: result,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const alice = await request(
    "/api/auth/register",
    "POST",
    { username: "alice", name: "Alice", password: "a-secure-passphrase" },
    undefined,
    201,
  );
  const bob = await request(
    "/api/auth/register",
    "POST",
    { username: "bob", name: "Bob", password: "b-secure-passphrase" },
    undefined,
    201,
  );
  const outsider = await request(
    "/api/auth/register",
    "POST",
    { username: "outsider", name: "Outsider", password: "c-secure-passphrase" },
    undefined,
    201,
  );
  const p = (
    await request(
      "/api/projects",
      "POST",
      { name: "Shared build", description: "First release" },
      alice.cookie,
      201,
    )
  ).data;
  const q = (
    await request(
      "/api/projects",
      "POST",
      { name: "Other project" },
      outsider.cookie,
      201,
    )
  ).data;
  const endpoint = `/api/projects/${p.id}`;
  await t.test("authentication, invite and project isolation", async () => {
    const invalidRegistration = await request(
      "/api/auth/register",
      "POST",
      { username: "x", name: "", password: "short" },
      undefined,
      400,
    );
    assert.equal(invalidRegistration.data.code, "VALIDATION_ERROR");
    assert.match(invalidRegistration.data.error, /username:/);
    await request(endpoint, "GET", undefined, undefined, 401);
    await request(endpoint, "GET", undefined, outsider.cookie, 404);
    await request(
      "/api/auth/login",
      "POST",
      { username: "alice", password: "wrong" },
      undefined,
      401,
    );
    const invitation = (
      await request(`${endpoint}/invites`, "POST", {}, alice.cookie, 201)
    ).data;
    await request(
      "/api/invites/accept",
      "POST",
      { token: invitation.token },
      bob.cookie,
    );
    await request(`${endpoint}/invites`, "POST", {}, bob.cookie, 403);
    const invalidOrigin = await fetch(`${base}${endpoint}/messages`, {
      method: "POST",
      headers: {
        Cookie: alice.cookie!,
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({ body: "no" }),
    });
    assert.equal(invalidOrigin.status, 403);
  });
  const a = (
    await request(
      `${endpoint}/agents`,
      "POST",
      { name: "Atlas", model: "External A" },
      alice.cookie,
      201,
    )
  ).data;
  const b = (
    await request(
      `${endpoint}/agents`,
      "POST",
      { name: "Pixel", model: "External B" },
      bob.cookie,
      201,
    )
  ).data;
  const c = (
    await request(
      `${endpoint}/agents`,
      "POST",
      { name: "Uninvited", model: "External C" },
      bob.cookie,
      201,
    )
  ).data;
  let meeting: any;
  let file: any;
  await t.test("real AI identities and scoped credentials", async () => {
    const me = (await request("/api/me", "GET", undefined, a.token)).data;
    assert.equal(me.actor.id, a.id);
    assert.equal(me.actor.type, "agent");
    await request(`/api/projects/${q.id}`, "GET", undefined, a.token, 403);
    const snap = (await request(endpoint, "GET", undefined, b.token)).data;
    assert.equal(snap.members.length, 2);
    assert.equal(snap.agents.length, 3);
    assert.equal(JSON.stringify(snap).includes(a.token), false);
    await request("/api/agent/status", "POST", { status: "working" }, a.token);
  });
  await t.test(
    "file permissions, private events, version history and optimistic concurrency",
    async () => {
      file = (
        await request(
          `${endpoint}/files`,
          "POST",
          { path: "docs/brief.md", content: "First draft", baseVersion: 0 },
          a.token,
          201,
        )
      ).data;
      const privateFile = (
        await request(
          `${endpoint}/files`,
          "POST",
          {
            path: "private/thoughts.md",
            content: "Private context",
            baseVersion: 0,
            visibility: "private",
          },
          alice.cookie,
          201,
        )
      ).data;
      await request(
        `${endpoint}/files/${privateFile.id}`,
        "GET",
        undefined,
        b.token,
        404,
      );
      const bobView = (await request(endpoint, "GET", undefined, bob.cookie))
        .data;
      assert.equal(
        bobView.files.some((f: any) => f.id === privateFile.id),
        false,
      );
      assert.equal(
        JSON.stringify(bobView.activity).includes("thoughts.md"),
        false,
      );
      await request(
        `${endpoint}/files/${privateFile.id}`,
        "GET",
        undefined,
        a.token,
      );
      await request(
        `${endpoint}/files`,
        "POST",
        { path: "../escape", content: "bad", baseVersion: 0 },
        a.token,
        400,
      );
      await request(
        `${endpoint}/files`,
        "POST",
        { path: "docs/brief.md", content: "Updated by Bob", baseVersion: 1 },
        b.token,
        201,
      );
      await request(
        `${endpoint}/files`,
        "POST",
        { path: "docs/brief.md", content: "Stale overwrite", baseVersion: 1 },
        a.token,
        409,
      );
      const first = (
        await request(
          `${endpoint}/files/${file.id}?version=1`,
          "GET",
          undefined,
          a.token,
        )
      ).data;
      assert.equal(
        Buffer.from(first.content, "base64").toString(),
        "First draft",
      );
      assert.equal(first.versions.length, 2);
      const download = await fetch(
        `${base}${endpoint}/files/${file.id}?download=1`,
        { headers: { Authorization: `Bearer ${a.token}` } },
      );
      assert.equal(await download.text(), "Updated by Bob");
      assert.match(download.headers.get("content-disposition")!, /^attachment/);
    },
  );
  await t.test(
    "meeting invitations, attributed discussion, pause, resume and speaking limits",
    async () => {
      meeting = (
        await request(
          `${endpoint}/meetings`,
          "POST",
          {
            title: "Plan the release",
            agenda: "Agree on interfaces",
            agentIds: [a.id, b.id],
            maxTurns: 2,
          },
          alice.cookie,
          201,
        )
      ).data;
      const sent = (
        await request(
          `${endpoint}/messages`,
          "POST",
          {
            body: "The shared file is ready",
            meetingId: meeting.id,
            actor_name: "Spoofed",
          },
          a.token,
          201,
        )
      ).data;
      assert.equal(sent.actor_name, "Atlas");
      await request(
        `${endpoint}/messages`,
        "POST",
        { body: "I can read the new revision", meetingId: meeting.id },
        b.token,
        201,
      );
      await request(
        `${endpoint}/messages?meetingId=${meeting.id}`,
        "GET",
        undefined,
        c.token,
        403,
      );
      const filtered = (
        await request(`${endpoint}/events?after=0`, "GET", undefined, c.token)
      ).data;
      assert.equal(
        filtered.some(
          (e: any) =>
            e.payload.meeting_id === meeting.id && e.kind === "message.created",
        ),
        false,
      );
      await request(
        `${endpoint}/meetings/${meeting.id}`,
        "PATCH",
        { status: "paused" },
        bob.cookie,
        403,
      );
      await request(
        `${endpoint}/meetings/${meeting.id}`,
        "PATCH",
        { status: "paused" },
        alice.cookie,
      );
      await request(
        `${endpoint}/messages`,
        "POST",
        { body: "Cannot speak while paused", meetingId: meeting.id },
        a.token,
        409,
      );
      await request(
        `${endpoint}/meetings/${meeting.id}`,
        "PATCH",
        { status: "active" },
        alice.cookie,
      );
      await request(
        `${endpoint}/messages`,
        "POST",
        { body: "Second turn", meetingId: meeting.id },
        a.token,
        201,
      );
      await request(
        `${endpoint}/messages`,
        "POST",
        { body: "Exceeds budget", meetingId: meeting.id },
        a.token,
        409,
      );
    },
  );
  await t.test(
    "AI proposals require human decisions and tasks remain traceable",
    async () => {
      const decision = (
        await request(
          `${endpoint}/decisions`,
          "POST",
          { body: "Use the new interface", meetingId: meeting.id },
          a.token,
          201,
        )
      ).data;
      await request(
        `${endpoint}/decisions/${decision.id}`,
        "PATCH",
        { status: "confirmed" },
        a.token,
        403,
      );
      await request(
        `${endpoint}/decisions/${decision.id}`,
        "PATCH",
        { status: "confirmed" },
        bob.cookie,
        403,
      );
      await request(
        `${endpoint}/decisions/${decision.id}`,
        "PATCH",
        { status: "confirmed" },
        alice.cookie,
      );
      await request(
        `${endpoint}/decisions/${decision.id}`,
        "PATCH",
        { status: "rejected" },
        alice.cookie,
        409,
      );
      const task = (
        await request(
          `${endpoint}/tasks`,
          "POST",
          { title: "Build agreed interface", meetingId: meeting.id },
          a.token,
          201,
        )
      ).data;
      assert.equal(task.status, "proposed");
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "in_progress" },
        a.token,
        403,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "todo", assigneeId: a.id },
        alice.cookie,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "in_progress" },
        a.token,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "in_progress" },
        b.token,
        409,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "done" },
        a.token,
        403,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "review" },
        a.token,
      );
      await request(
        `${endpoint}/tasks/${task.id}`,
        "PATCH",
        { status: "done" },
        bob.cookie,
      );
    },
  );
  await t.test("durable event cursor and long-poll delivery", async () => {
    const previous = (
      await request(`${endpoint}/events?after=0`, "GET", undefined, b.token)
    ).data;
    const cursor = previous.at(-1).id;
    const pending = request(
      `${endpoint}/events?after=${cursor}&wait=2`,
      "GET",
      undefined,
      b.token,
    );
    await request(
      `${endpoint}/messages`,
      "POST",
      { body: "A direct asynchronous question" },
      a.token,
      201,
    );
    const delivered = (await pending).data;
    assert.ok(
      delivered.some(
        (e: any) => e.payload.body === "A direct asynchronous question",
      ),
    );
    assert.ok(delivered.every((e: any) => e.id > cursor));
  });
  await t.test(
    "official MCP client discovers and executes real project tools",
    async () => {
      const client = new Client({ name: "integration-test", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${b.token}` } },
        }),
      );
      try {
        const list = await client.listTools();
        assert.ok(list.tools.some((t) => t.name === "send_message"));
        assert.ok(list.tools.some((t) => t.name === "read_file"));
        const result: any = await client.callTool({
          name: "get_project",
          arguments: {},
        });
        assert.equal(JSON.parse(result.content[0].text).project.id, p.id);
        const sent: any = await client.callTool({
          name: "send_message",
          arguments: { body: "Hello from an actual MCP client" },
        });
        assert.equal(JSON.parse(sent.content[0].text).actor_name, "Pixel");
        const forbidden: any = await client.callTool({
          name: "update_task",
          arguments: { taskId: "not-found", status: "review" },
        });
        assert.equal(forbidden.isError, true);
      } finally {
        await client.close();
      }
    },
  );
  await t.test(
    "example listener processes events through a quiet local adapter",
    async () => {
      const cursorFile = join(dir, "listener-cursor.json");
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "examples/agent.ts"],
        {
          env: {
            ...process.env,
            CONEST_URL: base,
            CONEST_TOKEN: b.token,
            CONEST_CURSOR_FILE: cursorFile,
            CONEST_HANDLER: JSON.stringify([
              process.execPath,
              "examples/observer-handler.mjs",
            ]),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.resume();
      try {
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 8000;
          const timer = setInterval(() => {
            if (
              existsSync(cursorFile) &&
              output.includes('"kind":"message.created"')
            ) {
              clearInterval(timer);
              resolve();
            } else if (Date.now() > deadline) {
              clearInterval(timer);
              reject(new Error("Listener did not persist a cursor"));
            }
          }, 30);
          child.once("error", (error) => {
            clearInterval(timer);
            reject(error);
          });
        });
        assert.match(output, /Trusted local handler enabled/);
      } finally {
        child.kill("SIGTERM");
        await new Promise<void>((resolve) =>
          child.once("close", () => resolve()),
        );
      }
    },
  );
  await t.test(
    "meetings end, revoked credentials stop working, sessions log out and data persists",
    async () => {
      await request(
        `${endpoint}/meetings/${meeting.id}`,
        "PATCH",
        { status: "ended" },
        alice.cookie,
      );
      await request(
        `${endpoint}/messages`,
        "POST",
        { body: "Late message", meetingId: meeting.id },
        b.token,
        409,
      );
      await request(
        `${endpoint}/meetings/${meeting.id}`,
        "PATCH",
        { status: "active" },
        alice.cookie,
        409,
      );
      await request(
        `${endpoint}/agents/${a.id}`,
        "DELETE",
        undefined,
        bob.cookie,
        403,
      );
      await request(
        `${endpoint}/agents/${a.id}`,
        "DELETE",
        undefined,
        alice.cookie,
      );
      await request("/api/me", "GET", undefined, a.token, 401);
      await request("/api/auth/logout", "POST", {}, bob.cookie);
      await request("/api/me", "GET", undefined, bob.cookie, 401);
      const reopened = new Store(database);
      try {
        assert.equal(
          reopened.one("SELECT name FROM projects WHERE id=?", p.id)!.name,
          "Shared build",
        );
        assert.equal(
          reopened.one(
            "SELECT count(*) n FROM file_versions WHERE file_id=?",
            file.id,
          )!.n,
          2,
        );
      } finally {
        reopened.close();
      }
    },
  );
});
