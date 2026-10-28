import test from "node:test";
import assert from "node:assert/strict";
import {
  recentContext,
  contextTerms,
  historyExcerpt,
} from "../server/context.ts";
import { mergeMessages, matchesScope } from "../src/chat-timeline.ts";

test("automatic history merging preserves loaded messages, removes duplicates and retains withdrawal against delayed polls", () => {
  const older = [
      { id: "1", body: "first" },
      { id: "2", body: "second" },
    ],
    latest = [
      { id: "2", body: "updated" },
      { id: "3", body: "third" },
    ];
  const merged = mergeMessages(older, latest);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["1", "2", "3"],
  );
  assert.equal(merged[1].body, "updated");
  const withdrawn = mergeMessages(merged, [
    {
      id: "3",
      body: "",
      redacted_at: "2026-10-28",
      redaction_reason: "withdrawn",
    },
  ]);
  assert.equal(mergeMessages(withdrawn, latest).at(-1)!.body, "");
  assert.deepEqual(
    mergeMessages([{ id: "0", body: "older" }], withdrawn).map((row) => row.id),
    ["0", "1", "2", "3"],
  );
});
test("a new chat cannot momentarily show cached messages from another room, project, owner or direct conversation", () => {
  const office = { project_id: "p", owner_id: "alice" },
    meeting = { project_id: "p", meeting_id: "m" },
    direct = { conversation_id: "d" };
  assert.equal(matchesScope(office, "p", { kind: "office" }, "alice"), true);
  assert.equal(matchesScope(office, "p", { kind: "office" }, "bob"), false);
  assert.equal(matchesScope(office, "p", { kind: "lounge" }), false);
  assert.equal(
    matchesScope(meeting, "p", { kind: "meeting", meetingId: "other" }),
    false,
  );
  assert.equal(
    matchesScope(meeting, "other", { kind: "meeting", meetingId: "m" }),
    false,
  );
  assert.equal(
    matchesScope(direct, "p", { kind: "direct", conversationId: "other" }),
    false,
  );
});
test("recent context fits its character budget, keeps the full current question and marks shortened earlier material", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    sequence: index + 1,
    actor_name: "Alice",
    actor_type: "human",
    body:
      index === 29
        ? "Current requirement: no manual archiving."
        : `Message ${index}:` + "x".repeat(12000),
  }));
  const result = recentContext(rows, rows.at(-1)!);
  assert.ok(result.reduce((total, row) => total + row.body.length, 0) <= 16000);
  assert.equal(result.at(-1)!.body, rows.at(-1)!.body);
  assert.ok(result.some((row) => row.truncated));
  assert.ok(!JSON.stringify(result).includes("Message 0:"));
});
test("retrieval handles Chinese and English questions and excerpts the relevant passage of a long message", () => {
  const terms = contextTerms("继续优化权限设计和 context management");
  assert.ok(terms.includes("权限"));
  assert.ok(terms.includes("context"));
  assert.ok(!terms.includes("这个"));
  const body =
    "x".repeat(3000) +
    "权限设计：办公室只给本人和本人 AI 读取。" +
    "y".repeat(3000);
  const extract = historyExcerpt({ id: "source", actor_name: "Alice", body }, [
    "权限",
  ]);
  assert.ok(extract.quote.includes("办公室只给本人"));
  assert.ok(extract.quote.length <= 900);
  assert.equal(extract.truncated, true);
  assert.equal(extract.messageId, "source");
});
