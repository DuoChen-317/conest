import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSetupPrompt,
  type ConnectorSetup,
} from "../src/connector-setup.ts";
import { connectorSettings, runConnector } from "../examples/connector.ts";

const setup: ConnectorSetup = {
  origin: "https://conest.example",
  projectId: "project-a",
  agentId: "agent-a",
  agentName: "My AI",
  token: "cn_example_only",
  pollSeconds: 10,
  scope: "meeting",
  instructions: 'Keep "quotes", 中文 and\nline breaks literal.',
};
const configuration = (prompt: string) =>
  JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```/)![1]);

test("both prompt languages carry identical usable local settings and queue protocol", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const prompt = buildSetupPrompt(setup, locale);
    const env = configuration(prompt);
    assert.equal(env.CONEST_TOKEN, setup.token);
    assert.equal(env.CONEST_REPLY_INSTRUCTIONS, setup.instructions);
    assert.deepEqual(
      connectorSettings(
        Object.fromEntries(Object.entries(env).map(([k, v]) => [k, String(v)])),
      ),
      {
        pollMilliseconds: 10000,
        scope: "meeting",
        replyInstructions: setup.instructions,
        projectId: "project-a",
        agentId: "agent-a",
      },
    );
    for (const operation of [
      "/api/me",
      "agent-requests",
      "/claim",
      "/reply",
      "leaseId",
      "CONEST_HANDLER",
    ])
      assert.ok(prompt.includes(operation), operation);
  }
});

test("template uses explicit placeholders and rejects unsupported settings", () => {
  const env = configuration(
    buildSetupPrompt(
      { ...setup, token: undefined, agentId: undefined, projectId: undefined },
      "en",
    ),
  );
  assert.equal(env.CONEST_TOKEN, "<CONEST_AI_TOKEN>");
  assert.equal(env.CONEST_AGENT_ID, "<AGENT_ID_FROM_API_ME>");
  assert.equal(env.CONEST_PROJECT_ID, "<PROJECT_ID_FROM_API_ME>");
  for (const origin of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
  ])
    assert.throws(() => buildSetupPrompt({ ...setup, origin }, "en"));
  for (const value of ["0", "NaN", "-5", "Infinity"])
    assert.throws(() => connectorSettings({ CONEST_POLL_SECONDS: value }));
  assert.throws(() => connectorSettings({ CONEST_REPLY_SCOPE: "everything" }));
  assert.equal(connectorSettings({}).pollMilliseconds, 5000);
});

test("connector filters scope before claiming and carries reply preferences to the adapter", async (t) => {
  const controller = new AbortController();
  const calls: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push(path);
      assert.equal(
        (options.headers as Record<string, string>).Authorization,
        "Bearer cn_example_only",
      );
      if (path.endsWith("/me"))
        return Response.json({
          actor: { type: "agent", id: "agent-a", projectId: "project-a" },
        });
      if (path.endsWith("/agent-requests"))
        return Response.json([
          { id: "direct", conversation_id: "conversation-a" },
          { id: "meeting", meeting_id: "meeting-a" },
        ]);
      if (path.endsWith("/claim"))
        return Response.json({
          requestId: "meeting",
          leaseId: "lease-a",
          trigger: { name: "Person", body: "Question" },
        });
      assert.ok(path.endsWith("/meeting/reply"));
      assert.deepEqual(JSON.parse(options.body as string), {
        leaseId: "lease-a",
        body: "Answer",
      });
      controller.abort();
      return Response.json({ status: "replied" });
    },
  );
  await runConnector({
    url: setup.origin,
    token: setup.token!,
    scope: "meeting",
    signal: controller.signal,
    agentId: "agent-a",
    projectId: "project-a",
    replyInstructions: "Be concise",
    adapter: async (context) => {
      assert.equal(context.replyInstructions, "Be concise");
      assert.ok(!JSON.stringify(context).includes(setup.token!));
      return "Answer";
    },
  });
  assert.ok(!calls.some((path) => path.includes("/direct/")));
  assert.equal(calls.length, 4);
});

test("empty queues only poll at the configured interval and never call the model", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  let polls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/me"))
      return Response.json({ actor: { type: "agent", projectId: "p" } });
    polls++;
    return Response.json([]);
  });
  const running = runConnector({
    url: setup.origin,
    token: setup.token!,
    pollMilliseconds: 10000,
    signal: controller.signal,
    adapter: async () => {
      throw new Error("Must not invoke a model for an empty queue");
    },
  });
  await new Promise(setImmediate);
  assert.equal(polls, 1);
  t.mock.timers.tick(9999);
  await new Promise(setImmediate);
  assert.equal(polls, 1);
  t.mock.timers.tick(1);
  await new Promise(setImmediate);
  assert.equal(polls, 2);
  controller.abort();
  await running;
});

test("identity mismatch and revoked credentials stop the local connector", async (t) => {
  let polls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/me"))
      return Response.json({
        actor: { type: "agent", id: "agent-a", projectId: "p" },
      });
    polls++;
    return new Response("Forbidden", { status: 403 });
  });
  const options = {
    url: setup.origin,
    token: setup.token!,
    signal: new AbortController().signal,
    adapter: async () => "Never called",
  };
  await assert.rejects(
    runConnector({ ...options, agentId: "different-agent" }),
    /does not match/,
  );
  assert.equal(polls, 0);
  await assert.rejects(runConnector(options), /403/);
  assert.equal(polls, 1);
});
