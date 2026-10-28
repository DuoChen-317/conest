import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, id, now, hash } from "../server/store.ts";
import { Service, ApiError, type Actor } from "../server/service.ts";
import { Maintenance } from "../server/maintenance.ts";
import { createApp } from "../server/app.ts";

function fixture(t: { after: (fn: () => void) => void }) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const service = new Service(store);
  const users = ["Alice", "Bob", "Carol", "Outsider"].map((name): Actor => {
    const userId = id();
    store.run(
      "INSERT INTO users VALUES(?,?,?,?,?)",
      userId,
      name.toLowerCase(),
      name,
      "unused",
      now(),
    );
    return { id: userId, userId, name, type: "human" };
  });
  const [alice, bob, carol, outsider] = users;
  const project = service.createProject(alice, { name: "History team" });
  for (const user of [bob, carol])
    store.run(
      "INSERT INTO members VALUES(?,?,?)",
      project.id,
      user.id,
      "member",
    );
  const agents = ["Bob AI", "Sibling AI"].map((name): Actor => {
    const agent = service.createAgent(bob, project.id, {
      name,
      model: "External",
    });
    return {
      id: agent.id,
      userId: bob.id,
      name,
      type: "agent",
      projectId: project.id,
    };
  });
  const [agent, sibling] = agents;
  store.run("INSERT INTO agent_preferences VALUES(?,?,?)", agent.id, "ask", 1);
  const direct = service.conversations.start(alice, project.id, {
    agentId: agent.id,
  });
  const meeting = service.createMeeting(alice, project.id, {
    title: "Meeting",
  })!;
  const scope = { kind: "office" as const };
  const fill = (count: number, owner = alice, start = 0, createdAt = now()) => {
    const ids: string[] = [];
    store.transaction(() => {
      for (let index = start; index < start + count; index++) {
        const messageId = id();
        ids.push(messageId);
        store.run(
          "INSERT INTO office_messages VALUES(?,?,?,?,?,?,?,?)",
          messageId,
          project.id,
          owner.id,
          owner.id,
          "human",
          owner.name,
          `Record ${index}`,
          createdAt,
        );
      }
    });
    return ids;
  };
  return {
    store,
    service,
    h: service.history,
    projectId: project.id,
    alice,
    bob,
    carol,
    outsider,
    agent,
    sibling,
    direct,
    meeting,
    scope,
    fill,
  };
}
function denied(action: () => unknown, status: number) {
  assert.throws(
    action,
    (error) => error instanceof ApiError && error.status === status,
  );
}

test("history pagination crosses 200 records without gaps, handles tied dates and scopes cursors", (t) => {
  const f = fixture(t),
    ids = f.fill(225);
  const actual: string[] = [];
  let before: string | undefined;
  do {
    const page = f.h.page(f.alice, f.projectId, {
      ...f.scope,
      limit: 37,
      before,
    });
    actual.unshift(...page.items.map((message) => message.id));
    before = page.nextBefore ?? undefined;
  } while (before);
  assert.deepEqual(actual, ids);
  const latest = f.h.page(f.alice, f.projectId, f.scope);
  denied(
    () =>
      f.h.page(f.alice, f.projectId, {
        kind: "lounge",
        before: latest.nextBefore,
      }),
    400,
  );
  denied(
    () => f.h.page(f.alice, f.projectId, { ...f.scope, before: "bad" }),
    400,
  );
  denied(
    () =>
      f.h.page(f.alice, f.projectId, {
        ...f.scope,
        before: Buffer.from("null").toString("base64url"),
      }),
    400,
  );
  assert.ok(
    f.h
      .page(f.alice, f.projectId, { ...f.scope, around: ids[10] })
      .items.some((message) => message.id === ids[10]),
  );
  assert.deepEqual(
    f.h
      .page(f.alice, f.projectId, {
        ...f.scope,
        beforeMessage: ids[25],
        limit: 50,
      })
      .items.map((message) => message.id),
    ids.slice(0, 25),
  );
  denied(
    () => f.h.page(f.bob, f.projectId, { ...f.scope, beforeMessage: ids[25] }),
    404,
  );
  denied(
    () => f.h.page(f.bob, f.projectId, { ...f.scope, around: ids[10] }),
    404,
  );
});

test("history, extracts, thread lists and exports preserve private office and direct AI boundaries", (t) => {
  const f = fixture(t);
  f.fill(75, f.alice);
  f.fill(75, f.bob, 1000);
  const directScope = { kind: "direct", conversationId: f.direct.id };
  const question = f.service.conversations.send(
    f.alice,
    f.projectId,
    f.direct.id,
    { body: "Private direct secret" },
  );
  for (const actor of [f.alice, f.bob, f.agent])
    assert.ok(
      f.h
        .page(actor, f.projectId, directScope)
        .items.some((message) => message.id === question.id),
    );
  for (const actor of [f.carol, f.sibling]) {
    denied(() => f.h.page(actor, f.projectId, directScope), 404);
    denied(() => f.h.summaries(actor, f.projectId, directScope), 404);
    denied(() => f.h.context(actor, f.projectId, directScope), 404);
    denied(() => [...f.h.export(actor, f.projectId, directScope)], 404);
    assert.ok(
      !f.h
        .threads(actor, f.projectId)
        .some((thread) => thread.conversationId === f.direct.id),
    );
  }
  for (const actor of [f.agent, f.sibling]) {
    assert.ok(
      f.h
        .page(actor, f.projectId, f.scope)
        .items.every((message) => message.owner_id === f.bob.id),
    );
    assert.ok(
      !JSON.stringify(f.h.summaries(actor, f.projectId, f.scope)).includes(
        f.alice.name,
      ),
    );
    assert.ok(
      ![...f.h.export(actor, f.projectId, f.scope)]
        .join("")
        .includes(f.alice.name),
    );
  }
  denied(
    () =>
      f.h.page(f.agent, f.projectId, {
        kind: "meeting",
        meetingId: f.meeting.id,
      }),
    403,
  );
  f.store.run("INSERT INTO participants VALUES(?,?)", f.meeting.id, f.agent.id);
  assert.equal(
    f.h.page(f.agent, f.projectId, { kind: "meeting", meetingId: f.meeting.id })
      .items.length,
    0,
  );
  denied(() => f.h.threads(f.outsider, f.projectId), 404);
});

test("personal groups, archives and reversible removal do not modify other viewers or AI memory", (t) => {
  const f = fixture(t);
  const message = f.service.sendMessage(f.alice, f.projectId, {
    body: "Shared memory",
  });
  const scope = { kind: "lounge" };
  f.h.preferences(f.alice, f.projectId, {
    ...scope,
    groupName: "Release",
    archived: true,
  });
  assert.equal(
    f.h
      .threads(f.alice, f.projectId)
      .find((thread) => thread.kind === "lounge")!.group_name,
    "Release",
  );
  assert.equal(
    f.h.threads(f.bob, f.projectId).find((thread) => thread.kind === "lounge")!
      .group_name,
    "",
  );
  f.h.changeMessage(f.alice, f.projectId, message.id, {
    ...scope,
    action: "hide",
  });
  assert.equal(f.h.page(f.alice, f.projectId, scope).items.length, 0);
  assert.equal(f.service.readMessages(f.alice, f.projectId).length, 0);
  assert.equal(
    JSON.parse([...f.h.export(f.alice, f.projectId, scope)].join("")).messages
      .length,
    0,
  );
  assert.equal(
    f.h.page(f.alice, f.projectId, { ...scope, includeHidden: "true" }).items[0]
      .hidden,
    true,
  );
  assert.equal(
    f.service.readMessages(f.agent, f.projectId)[0].body,
    "Shared memory",
  );
  assert.equal(
    f.service.readMessages(f.bob, f.projectId)[0].body,
    "Shared memory",
  );
  f.h.changeMessage(f.alice, f.projectId, message.id, {
    ...scope,
    action: "restore",
  });
  assert.equal(f.h.page(f.alice, f.projectId, scope).items[0].id, message.id);
  denied(
    () =>
      f.h.preferences(f.agent, f.projectId, {
        ...scope,
        groupName: "AI",
        archived: true,
      }),
    403,
  );
});

test("hidden records are excluded before pagination limits", (t) => {
  const f = fixture(t),
    ids = f.fill(70);
  for (const messageId of ids.slice(-20))
    f.h.changeMessage(f.alice, f.projectId, messageId, {
      ...f.scope,
      action: "hide",
    });
  const page = f.h.page(f.alice, f.projectId, { ...f.scope, limit: 50 });
  assert.deepEqual(
    page.items.map((message) => message.id),
    ids.slice(0, 50),
  );
  assert.equal(page.hasMore, false);
});

test("automatic extracts retain source IDs, exclude recent context and invalidate withdrawn text", (t) => {
  const f = fixture(t),
    ids = f.fill(110);
  const summaries = f.h.summaries(f.alice, f.projectId, f.scope);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].method, "extractive");
  assert.equal(
    summaries.reduce((count, summary) => count + summary.source_count, 0),
    80,
  );
  for (const summary of summaries)
    for (const extract of summary.extracts) {
      assert.ok(ids.slice(0, 80).includes(extract.messageId));
      assert.ok(extract.quote.length <= 200);
      assert.equal(
        f.store.one(
          "SELECT body FROM office_messages WHERE id=?",
          extract.messageId,
        )!.body,
        extract.quote,
      );
    }
  assert.deepEqual(
    f.h.summaries(f.alice, f.projectId, f.scope).map((summary) => summary.id),
    summaries.map((summary) => summary.id),
  );
  const withdrawn = summaries[0].extracts[0].messageId;
  f.h.changeMessage(f.alice, f.projectId, withdrawn, {
    ...f.scope,
    action: "withdraw",
  });
  assert.equal(f.store.one("SELECT count(*) n FROM chat_summaries")!.n, 0);
  assert.ok(
    !JSON.stringify(f.h.summaries(f.alice, f.projectId, f.scope)).includes(
      withdrawn,
    ),
  );
  assert.equal(
    f.service
      .readOfficeMessages(f.alice, f.projectId)
      .find((message) => message.id === withdrawn)!.body,
    "",
  );
});

test("withdrawal enforces authorship, scrubs event copies and invalidates in-flight replies and retry", (t) => {
  const f = fixture(t);
  const office = f.service.sendOfficeMessage(f.bob, f.projectId, {
    body: "Office secret",
  });
  const shared = f.service.sendMessage(f.bob, f.projectId, {
    body: "Secret to withdraw",
  });
  denied(
    () =>
      f.h.changeMessage(f.alice, f.projectId, shared.id, {
        kind: "lounge",
        action: "withdraw",
      }),
    403,
  );
  f.h.changeMessage(f.bob, f.projectId, shared.id, {
    kind: "lounge",
    action: "withdraw",
  });
  f.h.changeMessage(f.bob, f.projectId, office.id, {
    ...f.scope,
    action: "withdraw",
  });
  assert.ok(
    !JSON.stringify(f.store.all("SELECT * FROM events")).includes(
      "Secret to withdraw",
    ),
  );
  assert.ok(
    !JSON.stringify(f.store.all("SELECT * FROM events")).includes(
      "Office secret",
    ),
  );
  assert.ok(
    ![...f.h.export(f.alice, f.projectId, { kind: "lounge" })]
      .join("")
      .includes("Secret to withdraw"),
  );
  const question = f.service.conversations.send(
    f.alice,
    f.projectId,
    f.direct.id,
    { body: "Question" },
  );
  const request = f.service.conversations.queue(f.agent, f.projectId)[0];
  const claimed = f.service.conversations.claim(
    f.agent,
    f.projectId,
    request.id,
  );
  f.h.changeMessage(f.alice, f.projectId, question.id, {
    kind: "direct",
    conversationId: f.direct.id,
    action: "withdraw",
  });
  denied(
    () =>
      f.service.conversations.finish(f.agent, f.projectId, request.id, {
        leaseId: claimed.leaseId,
        body: "Stale answer",
      }),
    409,
  );
  denied(
    () => f.service.conversations.retry(f.alice, f.projectId, request.id),
    409,
  );
  assert.equal(f.service.conversations.queue(f.agent, f.projectId).length, 0);
  const ownAIMessage = f.service.sendOfficeMessage(f.agent, f.projectId, {
    body: "Owned AI text",
  });
  f.h.changeMessage(f.bob, f.projectId, ownAIMessage.id, {
    ...f.scope,
    action: "withdraw",
  });
  assert.equal(
    f.service
      .readOfficeMessages(f.bob, f.projectId)
      .find((message) => message.id === ownAIMessage.id)!.redaction_reason,
    "withdrawn",
  );
});

test("long AI context includes only older extracts from the addressed conversation", (t) => {
  const f = fixture(t);
  f.fill(80, f.bob); // Must not enter the direct request, even for this same AI owner.
  for (let index = 0; index < 80; index++)
    f.store.run(
      "INSERT INTO direct_messages VALUES(?,?,?,?,?,?,?)",
      id(),
      f.direct.id,
      f.alice.id,
      "human",
      f.alice.name,
      `Direct ${index}`,
      now(),
    );
  const question = f.service.conversations.send(
    f.alice,
    f.projectId,
    f.direct.id,
    { body: "Latest question" },
  );
  const request = f.service.conversations.queue(f.agent, f.projectId)[0];
  // Summaries built later must not leak future messages into an older question.
  for (let index = 0; index < 100; index++)
    f.store.run(
      "INSERT INTO direct_messages VALUES(?,?,?,?,?,?,?)",
      id(),
      f.direct.id,
      f.alice.id,
      "human",
      f.alice.name,
      `Future ${index}`,
      now(),
    );
  f.h.summaries(f.alice, f.projectId, {
    kind: "direct",
    conversationId: f.direct.id,
  });
  const result = f.service.conversations.claim(
    f.agent,
    f.projectId,
    request.id,
  );
  assert.ok(result.memory.length > 0 && result.memory.length <= 3);
  assert.equal(result.messages.length, 30);
  assert.equal(result.trigger.body, "Latest question");
  assert.ok(!JSON.stringify(result).includes("Record "));
  assert.ok(!JSON.stringify(result).includes("Future "));
  assert.ok(!JSON.stringify(result.memory).includes(question.id));
  assert.ok(
    result.memory.every((summary) =>
      summary.extracts.every((extract: any) => /^Direct /.test(extract.quote)),
    ),
  );
});

test("an older meeting question retains its preceding context after more than 200 newer messages", (t) => {
  const f = fixture(t);
  const meeting = f.service.createMeeting(f.bob, f.projectId, {
    title: "Long meeting",
    agentIds: [f.agent.id],
  })!;
  const fill = (count: number, prefix: string) =>
    f.store.transaction(() => {
      for (let index = 0; index < count; index++)
        f.store.run(
          "INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)",
          id(),
          f.projectId,
          meeting.id,
          f.alice.id,
          "human",
          f.alice.name,
          `${prefix} ${index}`,
          now(),
        );
    });
  fill(80, "Earlier meeting");
  f.service.sendMessage(f.alice, f.projectId, {
    meetingId: meeting.id,
    recipientAgentIds: [f.agent.id],
    body: "Past question",
  });
  const request = f.service.conversations.queue(f.agent, f.projectId)[0];
  fill(225, "Future meeting");
  f.h.summaries(f.alice, f.projectId, {
    kind: "meeting",
    meetingId: meeting.id,
  });
  const result = f.service.conversations.claim(
    f.agent,
    f.projectId,
    request.id,
  );
  assert.equal(result.messages.length, 30);
  assert.equal(result.trigger.body, "Past question");
  assert.equal(result.messages[0].body, "Earlier meeting 51");
  assert.ok(result.memory.length > 0);
  assert.ok(!JSON.stringify(result).includes("Future meeting"));
});

test("automatic retrieval finds relevant old requirements beyond the recent window without crossing private or future boundaries", (t) => {
  const f = fixture(t);
  const ids = f.fill(300);
  f.store.run(
    "UPDATE office_messages SET body=? WHERE id=?",
    "Argon migration rollout requirement: explicit owner approval.",
    ids[3],
  );
  for (const messageId of ids.slice(4, 245))
    f.store.run(
      "UPDATE office_messages SET body='General migration notes' WHERE id=?",
      messageId,
    );
  const recent = f.store
    .all(
      "SELECT *,rowid sequence FROM office_messages WHERE owner_id=? ORDER BY rowid DESC LIMIT 30",
      f.alice.id,
    )
    .reverse();
  const memory = f.h.retrieve(
    f.alice,
    f.projectId,
    f.scope,
    "Argon migration rollout",
    recent,
    recent.at(-1)!.sequence + 1,
  );
  assert.ok(memory[0].extracts.some((extract) => extract.messageId === ids[3]));
  const automatic = f.h.context(f.alice, f.projectId, {
    ...f.scope,
    question: "Argon migration rollout",
  });
  assert.ok(
    automatic.memory[0].extracts.some(
      (extract) => extract.messageId === ids[3],
    ),
  );
  assert.ok(
    automatic.messages.reduce((total, row) => total + row.body.length, 0) <=
      16000,
  );
  assert.ok(memory[0].extracts.length <= 7);
  assert.ok(
    memory[0].extracts.every((extract) =>
      ids.slice(0, 270).includes(extract.messageId),
    ),
  );
  assert.ok(
    !JSON.stringify(
      f.h.retrieve(
        f.bob,
        f.projectId,
        f.scope,
        "Argon migration rollout",
        [],
        Number.MAX_SAFE_INTEGER,
      ),
    ).includes("Argon"),
  );
  f.h.changeMessage(f.alice, f.projectId, ids[3], {
    ...f.scope,
    action: "withdraw",
  });
  assert.ok(
    !JSON.stringify(
      f.h.retrieve(
        f.alice,
        f.projectId,
        f.scope,
        "Argon migration rollout",
        recent,
        recent.at(-1)!.sequence + 1,
      ),
    ).includes("explicit owner approval"),
  );
});

test("retention is disabled by default and only managers can expire scoped message bodies", (t) => {
  const f = fixture(t);
  const old = new Date(Date.now() - 100 * 86400000).toISOString();
  const expired = f.fill(1, f.alice, 0, old)[0],
    fresh = f.fill(1, f.alice, 1)[0],
    foreign = f.fill(1, f.bob, 2, old)[0];
  assert.equal(f.h.maintain().redacted, 0);
  denied(
    () =>
      f.h.preferences(f.bob, f.projectId, {
        kind: "lounge",
        groupName: "",
        archived: false,
        retentionDays: 30,
      }),
    403,
  );
  denied(
    () =>
      f.h.preferences(f.bob, f.projectId, {
        kind: "direct",
        conversationId: f.direct.id,
        groupName: "",
        archived: false,
        retentionDays: 30,
      }),
    403,
  );
  f.h.preferences(f.alice, f.projectId, {
    ...f.scope,
    groupName: "",
    archived: false,
    retentionDays: 30,
  });
  assert.equal(f.h.maintain().redacted, 1);
  assert.equal(
    f.store.one("SELECT body FROM office_messages WHERE id=?", expired)!.body,
    "",
  );
  assert.ok(
    f.store.one("SELECT body FROM office_messages WHERE id=?", fresh)!.body,
  );
  assert.ok(
    f.store.one("SELECT body FROM office_messages WHERE id=?", foreign)!.body,
  );
  assert.equal(
    f.h
      .page(f.alice, f.projectId, f.scope)
      .items.find((message) => message.id === expired)!.redaction_reason,
    "expired",
  );
  assert.equal(f.h.maintain().redacted, 0);
});

test("online backups restore a consistent database, restrict file permissions and rotate only owned copies", async (t) => {
  const f = fixture(t),
    directory = mkdtempSync(join(tmpdir(), "conest-backup-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  f.fill(75);
  writeFileSync(join(directory, "other.sqlite"), "do not rotate");
  const maintenance = new Maintenance(f.service, directory, 2);
  const first = maintenance.runBackup();
  assert.equal(maintenance.runBackup(), first);
  const path = (await first)!;
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  const restored = new Store(path);
  try {
    assert.equal(restored.one("PRAGMA integrity_check")!.integrity_check, "ok");
    assert.equal(restored.one("SELECT count(*) n FROM office_messages")!.n, 75);
  } finally {
    restored.close();
  }
  await maintenance.runBackup();
  await maintenance.runBackup();
  const names = readdirSync(directory);
  assert.equal(
    names.filter(
      (name) => name.startsWith("conest-") && name.endsWith(".sqlite"),
    ).length,
    2,
  );
  assert.ok(names.includes("other.sqlite"));
  assert.ok(!names.some((name) => name.endsWith(".tmp")));
  await maintenance.stop();
  assert.throws(() => new Maintenance(f.service, directory, 0), /BACKUP_KEEP/);
  assert.throws(() => maintenance.start(-1), /BACKUP_INTERVAL_HOURS/);
});

test("HTTP history endpoints require authentication and validate export ACLs before sending a file", async (t) => {
  const { app, store, service } = createApp({ database: ":memory:" });
  const userId = id(),
    foreignId = id();
  for (const user of [userId, foreignId])
    store.run(
      "INSERT INTO users VALUES(?,?,?,?,?)",
      user,
      user,
      user,
      "unused",
      now(),
    );
  const actor: Actor = { id: userId, userId, name: userId, type: "human" };
  const project = service.createProject(actor, { name: "HTTP" });
  const message = service.sendOfficeMessage(actor, project.id, {
    body: "Export secret",
  });
  store.run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash("history-cookie"),
    userId,
    new Date(Date.now() + 60000).toISOString(),
  );
  store.run(
    "INSERT INTO sessions VALUES(?,?,?)",
    hash("foreign-cookie"),
    foreignId,
    new Date(Date.now() + 60000).toISOString(),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  });
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/projects/${project.id}/chat`;
  const request = (path: string, cookie = "history-cookie") =>
    fetch(root + path, { headers: { Cookie: `conest_session=${cookie}` } });
  assert.equal((await request("/history?kind=office", "")).status, 401);
  const deniedExport = await request("/export?kind=office", "foreign-cookie");
  assert.equal(deniedExport.status, 404);
  assert.equal(deniedExport.headers.get("content-disposition"), null);
  assert.equal(
    (await request("/export?kind=meeting&meetingId=missing")).status,
    404,
  );
  assert.equal((await request("/export?kind=office&format=html")).status, 400);
  const json = await request("/export?kind=office&format=json");
  assert.match(json.headers.get("content-disposition")!, /conest-chat.json/);
  assert.equal((await json.json()).messages[0].id, message.id);
  const md = await request("/export?kind=office&format=md");
  assert.match(await md.text(), /> Export secret/);
  assert.equal(
    (await (await request("/history?kind=office")).json()).items[0].body,
    "Export secret",
  );
});
