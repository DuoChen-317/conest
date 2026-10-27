import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { runConnector, modelAdapter } from "../examples/connector.ts";

test("meeting invitations persist, require owner approval and acknowledge real attendance", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "conest-invitations-"));
  const database = join(directory, "test.sqlite");
  const { app, store } = createApp({ database });
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
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(identity.startsWith("cn_")
          ? { Authorization: `Bearer ${identity}` }
          : { Cookie: identity }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return {
      ...result,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      ...(Array.isArray(result) ? { items: result } : {}),
    };
  }
  const register = (username: string) =>
    request(
      "",
      "/auth/register",
      "POST",
      { username, name: username, password: "test-passphrase-123" },
      201,
    );
  const a = await register("alice"),
    b = await register("bob"),
    c = await register("charlie");
  const project = await request(
    a.cookie,
    "/projects",
    "POST",
    { name: "Team" },
    201,
  );
  const endpoint = `/projects/${project.id}`;
  const link = await request(a.cookie, `${endpoint}/invites`, "POST", {}, 201);
  await request(b.cookie, "/invites/accept", "POST", { token: link.token });
  const bUser = (await request(b.cookie, "/me")).user;
  const aUser = (await request(a.cookie, "/me")).user;
  const agent = await request(
    b.cookie,
    `${endpoint}/agents`,
    "POST",
    { name: "Bob AI", model: "External" },
    201,
  );
  const sibling = await request(
    b.cookie,
    `${endpoint}/agents`,
    "POST",
    { name: "Other AI", model: "External" },
    201,
  );
  const meeting = await request(
    a.cookie,
    `${endpoint}/meetings`,
    "POST",
    {
      title: "Design review",
      agenda: "Discuss release",
      memberIds: [bUser.id, bUser.id],
      agentIds: [agent.id, agent.id],
    },
    201,
  );
  const notificationList = () =>
    request(b.cookie, "/notifications").then((r) => r.items);
  const invites = await notificationList();
  assert.equal(invites.length, 2);
  const humanInvite = invites.find((i: any) => i.actor_type === "human");
  const aiInvite = invites.find((i: any) => i.actor_type === "agent");
  assert.equal(aiInvite.status, "pending");
  assert.equal(aiInvite.agent_name, "Bob AI");
  assert.equal((await request(c.cookie, "/notifications")).items.length, 0);
  await request(
    a.cookie,
    `/notifications/${humanInvite.id}`,
    "PATCH",
    { action: "accept" },
    404,
  );
  await request(
    agent.token,
    `/notifications/${aiInvite.id}`,
    "PATCH",
    { action: "accept" },
    403,
  );
  await request(
    agent.token,
    `${endpoint}/messages?meetingId=${meeting.id}`,
    "GET",
    undefined,
    403,
  );
  await request(
    agent.token,
    `${endpoint}/presence`,
    "PUT",
    { room: "meeting", meetingId: meeting.id },
    403,
  );
  assert.equal((await request(agent.token, endpoint)).meetings.length, 0);
  const later = await request(
    b.cookie,
    `/notifications/${humanInvite.id}`,
    "PATCH",
    { action: "later" },
  );
  assert.equal(later.status, "pending");
  assert.ok(later.deferred_at);
  assert.ok(
    (await notificationList()).find((i: any) => i.id === humanInvite.id),
  );
  await request(b.cookie, `/notifications/${humanInvite.id}`, "PATCH", {
    action: "decline",
  });
  await request(b.cookie, `/notifications/${humanInvite.id}`, "PATCH", {
    action: "accept",
  });
  let snapshot = await request(a.cookie, endpoint);
  assert.equal(
    snapshot.meetingInvitations.find((i: any) => i.id === humanInvite.id)
      .joined_at,
    null,
  );
  await request(
    b.cookie,
    `${endpoint}/meetings/${meeting.id}/join`,
    "POST",
    {},
  );
  await request(b.cookie, `/notifications/${humanInvite.id}`, "PATCH", {
    action: "accept",
  });
  await request(
    b.cookie,
    `/notifications/${humanInvite.id}`,
    "PATCH",
    { action: "decline" },
    409,
  );
  await request(b.cookie, `/notifications/${aiInvite.id}`, "PATCH", {
    action: "accept",
  });
  snapshot = await request(a.cookie, endpoint);
  assert.equal(
    snapshot.meetingInvitations.find((i: any) => i.id === aiInvite.id)
      .joined_at,
    null,
  );
  assert.ok(!snapshot.presence.some((p: any) => p.actor_id === agent.id));
  const ready = (await request(agent.token, `${endpoint}/events`)).items.filter(
    (e: any) => e.kind === "meeting.ready",
  );
  assert.equal(ready.length, 1);
  assert.equal(
    (await request(sibling.token, `${endpoint}/events`)).items.filter(
      (e: any) => e.kind === "meeting.ready",
    ).length,
    0,
  );
  await request(
    agent.token,
    `${endpoint}/meetings/${meeting.id}/join`,
    "POST",
    {},
  );
  snapshot = await request(a.cookie, endpoint);
  assert.ok(
    snapshot.meetingInvitations.find((i: any) => i.id === aiInvite.id)
      .joined_at,
  );
  await request(
    b.cookie,
    `${endpoint}/meetings/${meeting.id}/invitations`,
    "POST",
    { agentIds: [sibling.id] },
    403,
  );
  await request(
    a.cookie,
    `${endpoint}/meetings/${meeting.id}/invitations`,
    "POST",
    { memberIds: [bUser.id], agentIds: [agent.id] },
    201,
  );
  assert.equal(
    (await notificationList()).length,
    2,
    "duplicate invitations must not reset responses or create duplicate notifications",
  );
  const previousCount = store.one(
    "SELECT count(*) count FROM meeting_invitations",
  )!.count;
  await request(
    a.cookie,
    `${endpoint}/meetings/${meeting.id}/invitations`,
    "POST",
    { memberIds: [aUser.id, "missing-user"] },
    400,
  );
  assert.equal(
    store.one("SELECT count(*) count FROM meeting_invitations")!.count,
    previousCount,
    "invalid recipients roll back the entire request",
  );
  await request(
    a.cookie,
    `${endpoint}/agents/${agent.id}/preferences`,
    "PATCH",
    { meetingPolicy: "auto", allowDirect: true },
    403,
  );
  await request(
    b.cookie,
    `${endpoint}/agents/${agent.id}/preferences`,
    "PATCH",
    { meetingPolicy: "auto", allowDirect: true },
  );
  const secondMeeting = await request(
    a.cookie,
    `${endpoint}/meetings`,
    "POST",
    { title: "Automatic approval", agentIds: [agent.id] },
    201,
  );
  const autoInvite = (await notificationList()).find(
    (i: any) => i.meeting_id === secondMeeting.id,
  );
  assert.equal(autoInvite.status, "accepted");
  assert.equal(autoInvite.joined_at, null);
  await t.test(
    "direct questions isolate recipients, expose only shared context and use recoverable reply leases",
    async () => {
      await request(
        a.cookie,
        `${endpoint}/conversations`,
        "POST",
        { agentId: sibling.id },
        403,
      );
      await request(
        agent.token,
        `${endpoint}/conversations`,
        "POST",
        { agentId: sibling.id },
        403,
      );
      const conversation = await request(
        a.cookie,
        `${endpoint}/conversations`,
        "POST",
        { agentId: agent.id },
        201,
      );
      const path = `${endpoint}/conversations/${conversation.id}/messages`;
      await request(
        b.cookie,
        `${endpoint}/office/messages`,
        "POST",
        { body: "private-office-marker" },
        201,
      );
      await request(
        b.cookie,
        `${endpoint}/files`,
        "POST",
        {
          path: "private/notes.md",
          content: "private-file-marker",
          visibility: "private",
          baseVersion: 0,
        },
        201,
      );
      await request(
        b.cookie,
        `${endpoint}/files`,
        "POST",
        {
          path: "shared/brief.md",
          content: "shared-file-marker",
          baseVersion: 0,
        },
        201,
      );
      await request(
        a.cookie,
        path,
        "POST",
        { body: "Help with the shared brief" },
        201,
      );
      await request(c.cookie, path, "GET", undefined, 404);
      await request(sibling.token, path, "GET", undefined, 404);
      await request(
        b.cookie,
        path,
        "POST",
        { body: "Cannot impersonate the sender" },
        403,
      );
      assert.equal((await request(b.cookie, path)).items.length, 1);
      assert.equal(
        (await request(a.cookie, path)).items[0].request_status,
        "queued",
      );
      const queued = (await request(agent.token, `${endpoint}/agent-requests`))
        .items;
      assert.equal(queued.length, 1);
      await request(
        sibling.token,
        `${endpoint}/agent-requests/${queued[0].id}/claim`,
        "POST",
        {},
        404,
      );
      const claimed = await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/claim`,
        "POST",
        {},
      );
      assert.ok(JSON.stringify(claimed).includes("shared-file-marker"));
      assert.ok(!JSON.stringify(claimed).includes("private-file-marker"));
      assert.ok(!JSON.stringify(claimed).includes("private-office-marker"));
      await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/claim`,
        "POST",
        {},
        409,
      );
      await request(
        b.cookie,
        `${endpoint}/agents/${agent.id}/preferences`,
        "PATCH",
        { meetingPolicy: "auto", allowDirect: false },
      );
      await request(a.cookie, path, "POST", { body: "Closed" }, 403);
      await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/reply`,
        "POST",
        {
          leaseId: claimed.leaseId,
          body: "Cannot reply after consent is revoked",
        },
        403,
      );
      await request(
        b.cookie,
        `${endpoint}/agents/${agent.id}/preferences`,
        "PATCH",
        { meetingPolicy: "auto", allowDirect: true },
      );
      store.run(
        "UPDATE agent_requests SET claimed_at=? WHERE id=?",
        new Date(Date.now() - 240000).toISOString(),
        queued[0].id,
      );
      await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/reply`,
        "POST",
        { leaseId: claimed.leaseId, body: "Expired result" },
        409,
      );
      // Restoring consent does not resurrect a canceled request; the sender opts in again.
      await request(
        a.cookie,
        `${endpoint}/agent-requests/${queued[0].id}/retry`,
        "POST",
        {},
      );
      const reclaimed = await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/claim`,
        "POST",
        {},
      );
      assert.notEqual(reclaimed.leaseId, claimed.leaseId);
      await request(
        agent.token,
        `${endpoint}/agent-requests/${queued[0].id}/reply`,
        "POST",
        { leaseId: claimed.leaseId, body: "Stale result" },
        409,
      );
      const replyPath = `${endpoint}/agent-requests/${queued[0].id}/reply`;
      const reply = await request(agent.token, replyPath, "POST", {
        leaseId: reclaimed.leaseId,
        body: "Use the shared design",
      });
      assert.equal(
        (
          await request(agent.token, replyPath, "POST", {
            leaseId: reclaimed.leaseId,
            body: "Duplicate",
          })
        ).id,
        reply.id,
      );
      const messages = (await request(a.cookie, path)).items;
      assert.equal(messages.length, 2);
      assert.equal(messages[0].request_status, "replied");
      assert.equal(messages[1].actor_id, agent.id);
      assert.equal(
        (await request(sibling.token, `${endpoint}/events`)).items.filter(
          (e: any) => e.kind === "direct.updated",
        ).length,
        0,
      );
      const second = await request(
        a.cookie,
        path,
        "POST",
        { body: "Try another question" },
        201,
      );
      const failed = (await request(agent.token, `${endpoint}/agent-requests`))
        .items[0];
      const lease = await request(
        agent.token,
        `${endpoint}/agent-requests/${failed.id}/claim`,
        "POST",
        {},
      );
      await request(
        agent.token,
        `${endpoint}/agent-requests/${failed.id}/reply`,
        "POST",
        { leaseId: lease.leaseId, failed: true },
      );
      assert.equal(
        (await request(a.cookie, path)).items.find(
          (m: any) => m.id === second.id,
        ).request_status,
        "failed",
      );
      await request(
        b.cookie,
        `${endpoint}/agent-requests/${failed.id}/retry`,
        "POST",
        {},
        403,
      );
      await request(
        a.cookie,
        `${endpoint}/agent-requests/${failed.id}/retry`,
        "POST",
        {},
      );
      assert.equal(
        (await request(agent.token, `${endpoint}/agent-requests`)).items[0]
          .status,
        "queued",
      );
      // A pending old question cannot leak into another person's conversation.
      const ownConversation = await request(
        b.cookie,
        `${endpoint}/conversations`,
        "POST",
        { agentId: agent.id },
        201,
      );
      await request(
        b.cookie,
        `${endpoint}/conversations/${ownConversation.id}/messages`,
        "POST",
        { body: "owner-only-question" },
        201,
      );
      const ownRequest = (
        await request(agent.token, `${endpoint}/agent-requests`)
      ).items.find((r: any) => r.conversation_id === ownConversation.id);
      const ownContext = await request(
        agent.token,
        `${endpoint}/agent-requests/${ownRequest.id}/claim`,
        "POST",
        {},
      );
      assert.ok(
        !JSON.stringify(ownContext.messages).includes("Try another question"),
      );
      await request(
        a.cookie,
        `${endpoint}/conversations/${ownConversation.id}/messages`,
        "GET",
        undefined,
        404,
      );
    },
  );
  await t.test(
    "explicit mentions queue only the selected approved AI and respect meeting controls",
    async () => {
      await request(
        a.cookie,
        `${endpoint}/messages`,
        "POST",
        {
          body: "Not approved",
          meetingId: secondMeeting.id,
          recipientAgentIds: [sibling.id],
        },
        400,
      );
      await request(
        agent.token,
        `${endpoint}/messages`,
        "POST",
        {
          body: "AI must not trigger an automatic loop",
          meetingId: secondMeeting.id,
          recipientAgentIds: [agent.id],
        },
        403,
      );
      const message = await request(
        a.cookie,
        `${endpoint}/messages`,
        "POST",
        {
          body: "Review the shared plan",
          meetingId: secondMeeting.id,
          recipientAgentIds: [agent.id, agent.id],
        },
        201,
      );
      let pending = (
        await request(agent.token, `${endpoint}/agent-requests`)
      ).items.find((r: any) => r.meeting_id === secondMeeting.id);
      assert.ok(pending);
      assert.equal(
        (await request(sibling.token, `${endpoint}/agent-requests`)).items
          .length,
        0,
      );
      await request(
        a.cookie,
        `${endpoint}/meetings/${secondMeeting.id}`,
        "PATCH",
        { status: "paused" },
      );
      await request(
        agent.token,
        `${endpoint}/agent-requests/${pending.id}/claim`,
        "POST",
        {},
        409,
      );
      assert.ok(
        !(await request(agent.token, `${endpoint}/agent-requests`)).items.some(
          (r: any) => r.id === pending.id,
        ),
      );
      await request(
        a.cookie,
        `${endpoint}/meetings/${secondMeeting.id}`,
        "PATCH",
        { status: "active" },
      );
      const context = await request(
        agent.token,
        `${endpoint}/agent-requests/${pending.id}/claim`,
        "POST",
        {},
      );
      await request(
        agent.token,
        `${endpoint}/agent-requests/${pending.id}/reply`,
        "POST",
        { leaseId: context.leaseId, body: "Looks ready" },
      );
      const messages = (
        await request(
          a.cookie,
          `${endpoint}/messages?meetingId=${secondMeeting.id}`,
        )
      ).items;
      assert.deepEqual(
        messages.find((m: any) => m.id === message.id).recipient_agent_ids,
        [agent.id],
      );
      assert.equal(
        messages.find((m: any) => m.id === message.id).ai_requests[0].status,
        "replied",
      );
      assert.equal(messages.at(-1).body, "Looks ready");
      assert.equal(
        store.one(
          "SELECT count(*) count FROM agent_requests WHERE message_id=?",
          message.id,
        )!.count,
        1,
      );
    },
  );
  await t.test(
    "the connector delivers a real queued question without exposing private context or running tools",
    async () => {
      const worker = await request(
        b.cookie,
        `${endpoint}/agents`,
        "POST",
        { name: "Connector AI", model: "Test adapter" },
        201,
      );
      await request(
        b.cookie,
        `${endpoint}/agents/${worker.id}/preferences`,
        "PATCH",
        { meetingPolicy: "ask", allowDirect: true },
      );
      const conversation = await request(
        a.cookie,
        `${endpoint}/conversations`,
        "POST",
        { agentId: worker.id },
        201,
      );
      const path = `${endpoint}/conversations/${conversation.id}/messages`;
      await request(
        a.cookie,
        path,
        "POST",
        { body: "A connector integration question" },
        201,
      );
      const controller = new AbortController();
      const statuses: string[] = [];
      await runConnector({
        url: base,
        token: worker.token,
        pollMilliseconds: 10,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        adapter: async (context) => {
          assert.equal(
            context.trigger.body,
            "A connector integration question",
          );
          assert.ok(!JSON.stringify(context).includes("private-office-marker"));
          assert.ok(!JSON.stringify(context).includes("private-file-marker"));
          return "Reply from the configured adapter";
        },
        onStatus: (status) => {
          statuses.push(status);
          if (status === "replied") controller.abort();
        },
      });
      assert.deepEqual(statuses, ["connected", "processing", "replied"]);
      const messages = (await request(a.cookie, path)).items;
      assert.equal(messages.length, 2);
      assert.equal(messages[1].body, "Reply from the configured adapter");
      assert.equal(messages[1].actor_id, worker.id);
    },
  );
  await t.test(
    "multiple clients process questions in the same conversation in order",
    async () => {
      const worker = await request(
        b.cookie,
        `${endpoint}/agents`,
        "POST",
        { name: "Ordered AI", model: "Test adapter" },
        201,
      );
      const conversation = await request(
        b.cookie,
        `${endpoint}/conversations`,
        "POST",
        { agentId: worker.id },
        201,
      );
      const path = `${endpoint}/conversations/${conversation.id}/messages`;
      await request(b.cookie, path, "POST", { body: "First question" }, 201);
      await request(b.cookie, path, "POST", { body: "Second question" }, 201);
      const messages = (await request(b.cookie, path)).items;
      const first = messages[0].request_id,
        second = messages[1].request_id;
      assert.deepEqual(
        (await request(worker.token, `${endpoint}/agent-requests`)).items.map(
          (r: any) => r.id,
        ),
        [first],
      );
      await request(
        worker.token,
        `${endpoint}/agent-requests/${second}/claim`,
        "POST",
        {},
        409,
      );
      const claimed = await request(
        worker.token,
        `${endpoint}/agent-requests/${first}/claim`,
        "POST",
        {},
      );
      assert.equal(
        (await request(worker.token, `${endpoint}/agent-requests`)).items
          .length,
        0,
      );
      await request(
        worker.token,
        `${endpoint}/agent-requests/${first}/reply`,
        "POST",
        { leaseId: claimed.leaseId, body: "First answer" },
      );
      assert.deepEqual(
        (await request(worker.token, `${endpoint}/agent-requests`)).items.map(
          (r: any) => r.id,
        ),
        [second],
      );
      const next = await request(
        worker.token,
        `${endpoint}/agent-requests/${second}/claim`,
        "POST",
        {},
      );
      assert.equal(next.trigger.body, "Second question");
      assert.ok(
        next.messages.some((m: any) => m.body === "First answer"),
        "a queued follow-up must include the previous answer even if it arrived after the follow-up was sent",
      );
    },
  );
  const unanswered = await request(
    a.cookie,
    `${endpoint}/messages`,
    "POST",
    {
      body: "Unanswered before closing",
      meetingId: meeting.id,
      recipientAgentIds: [agent.id],
    },
    201,
  );
  await request(a.cookie, `${endpoint}/meetings/${meeting.id}`, "PATCH", {
    status: "ended",
  });
  assert.equal(
    store.one(
      "SELECT status FROM agent_requests WHERE message_id=?",
      unanswered.id,
    )!.status,
    "failed",
  );
  await request(
    b.cookie,
    `/notifications/${humanInvite.id}`,
    "PATCH",
    { action: "accept" },
    409,
  );
  await request(b.cookie, `/notifications/${humanInvite.id}`, "PATCH", {
    action: "seen",
  });
  await request(
    agent.token,
    `${endpoint}/meetings/${meeting.id}/join`,
    "POST",
    {},
    409,
  );
  await request(
    a.cookie,
    `${endpoint}/meetings/${meeting.id}/invitations`,
    "POST",
    { agentIds: [sibling.id] },
    409,
  );
  assert.equal(
    (await notificationList()).find((i: any) => i.id === humanInvite.id)
      .meeting_status,
    "ended",
  );
  await t.test(
    "notifications include other projects while invitation and conversation access stay scoped",
    async () => {
      const other = await request(
        a.cookie,
        "/projects",
        "POST",
        { name: "Second project" },
        201,
      );
      const otherEndpoint = `/projects/${other.id}`;
      const link = await request(
        a.cookie,
        `${otherEndpoint}/invites`,
        "POST",
        {},
        201,
      );
      await request(b.cookie, "/invites/accept", "POST", { token: link.token });
      const another = await request(
        a.cookie,
        `${otherEndpoint}/meetings`,
        "POST",
        { title: "Different project", memberIds: [bUser.id] },
        201,
      );
      const notification = (await notificationList()).find(
        (i: any) => i.meeting_id === another.id,
      );
      assert.equal(notification.project_name, "Second project");
      await request(b.cookie, `/notifications/${notification.id}`, "PATCH", {
        action: "accept",
      });
      await request(
        b.cookie,
        `${endpoint}/meetings/${another.id}/join`,
        "POST",
        {},
        404,
      );
      await request(
        b.cookie,
        `${otherEndpoint}/meetings/${another.id}/join`,
        "POST",
        {},
      );
      await request(
        a.cookie,
        `${otherEndpoint}/conversations`,
        "POST",
        { agentId: agent.id },
        404,
      );
      await request(c.cookie, "/invites/accept", "POST", {
        token: (await request(a.cookie, `${endpoint}/invites`, "POST", {}, 201))
          .token,
      });
      const conversationId = store.one(
        "SELECT id FROM direct_conversations WHERE user_id=? AND agent_id=?",
        aUser.id,
        agent.id,
      )!.id;
      await request(
        c.cookie,
        `${endpoint}/conversations/${conversationId}/messages`,
        "GET",
        undefined,
        404,
      );
      assert.ok(
        !(await request(c.cookie, `${endpoint}/events`)).items.some(
          (e: any) => e.kind === "direct.updated",
        ),
      );
    },
  );
  const reopened = new Store(database);
  try {
    assert.equal(
      reopened.one(
        "SELECT status FROM meeting_invitations WHERE id=?",
        aiInvite.id,
      )!.status,
      "accepted",
    );
    assert.equal(
      reopened.one(
        "SELECT meeting_policy FROM agent_preferences WHERE agent_id=?",
        agent.id,
      )!.meeting_policy,
      "auto",
    );
    assert.equal(
      reopened.one(
        "SELECT count(*) count FROM meeting_invitations WHERE meeting_id=? AND actor_id=?",
        meeting.id,
        agent.id,
      )!.count,
      1,
    );
  } finally {
    reopened.close();
  }
});

test("model adapters use official text endpoints without granting tools or sending CoNest credentials", async () => {
  for (const provider of ["openai", "claude"] as const) {
    let called = false;
    const adapter = modelAdapter({
      provider,
      apiKey: "local-model-key",
      model: "owner-selected-model",
      fetch: (async (url, init) => {
        called = true;
        assert.equal(
          url,
          provider === "openai"
            ? "https://api.openai.com/v1/responses"
            : "https://api.anthropic.com/v1/messages",
        );
        const body = JSON.parse(init!.body as string);
        assert.equal(body.model, "owner-selected-model");
        assert.equal(body.tools, undefined);
        assert.ok(!JSON.stringify(body).includes("not-forwarded-lease"));
        assert.ok(!JSON.stringify(body).includes("not-forwarded-request"));
        return Response.json(
          provider === "openai"
            ? {
                output: [
                  {
                    type: "message",
                    content: [{ type: "output_text", text: "OpenAI reply" }],
                  },
                ],
              }
            : { content: [{ type: "text", text: "Claude reply" }] },
        );
      }) as typeof fetch,
    });
    assert.equal(
      await adapter(
        {
          requestId: "not-forwarded-request",
          leaseId: "not-forwarded-lease",
          kind: "direct",
          project: { name: "Project", description: "Description" },
          sharedFiles: [],
          meeting: null,
          messages: [],
          trigger: { name: "Alice", body: "Question" },
        },
        new AbortController().signal,
      ),
      provider === "openai" ? "OpenAI reply" : "Claude reply",
    );
    assert.ok(called);
  }
});
