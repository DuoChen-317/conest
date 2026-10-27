import test from "node:test";
import assert from "node:assert/strict";
import {
  humanPose,
  interactionFor,
  sceneStateFor,
} from "../src/interaction.ts";

test("scene residents follow reported room and work status, and stale reports cannot show active work", () => {
  const now = Date.parse("2026-10-26T03:00:00Z");
  const recent = new Date(now - 10_000).toISOString();
  const stale = new Date(now - 90_001).toISOString();
  const robot = { robot: true, status: "working", last_seen: recent };
  assert.equal(
    sceneStateFor(robot, { room: "office" }, { now }).activity,
    "typing",
  );
  assert.equal(
    sceneStateFor(robot, { room: "library" }, { now }).activity,
    "reading",
  );
  assert.equal(
    sceneStateFor(robot, { room: "meeting" }, { now }).activity,
    "listening",
  );
  assert.equal(
    sceneStateFor({ ...robot, status: "idle" }, { room: "office" }, { now })
      .activity,
    "seated",
  );
  for (const last_seen of [null, stale, "invalid"]) {
    const state = sceneStateFor(
      { ...robot, last_seen },
      { room: "meeting" },
      { now },
    );
    assert.equal(state.status, "offline");
    assert.equal(state.room, "office");
    assert.equal(state.activity, "idle");
  }
  assert.equal(
    sceneStateFor(robot, { room: "unknown" }, { now }).room,
    "office",
  );
});

test("human typing needs current presence and an actual composer signal; examples require explicit sample mode", () => {
  const now = Date.parse("2026-10-26T03:00:00Z");
  const presence = { room: "office", updated_at: new Date(now).toISOString() };
  assert.equal(
    sceneStateFor({ robot: false }, presence, { now, working: true }).activity,
    "typing",
  );
  assert.equal(
    sceneStateFor({ robot: false }, presence, { now }).activity,
    "seated",
  );
  assert.equal(
    sceneStateFor({ robot: false }, undefined, { now, working: true }).status,
    "offline",
  );
  assert.equal(
    sceneStateFor({ robot: true, status: "working" }, undefined, {
      now,
      sample: true,
    }).activity,
    "typing",
  );
});

test("work actions follow presence and actual work state; disconnected actors never pretend to work", () => {
  assert.equal(interactionFor("office", "idle", false), "seated");
  assert.equal(interactionFor("office", "working", true), "typing");
  assert.equal(interactionFor("library", "idle", false), "reading");
  assert.equal(interactionFor("meeting", "working", true), "listening");
  for (const room of ["office", "library", "meeting", "commons"] as const)
    assert.equal(interactionFor(room, "offline", true), "idle");
});
test("directional walk, seated poses and reading use their own real atlas rows", () => {
  // Direction contract used by navigation: left, down, up, right.
  const expected = [12, 18, 6, 0];
  for (let direction = 0; direction < 4; direction++) {
    assert.deepEqual(humanPose("walking", direction, 0), {
      x: expected[direction] * 16,
      y: 64,
    });
    assert.deepEqual(humanPose("walking", direction, 5), {
      x: (expected[direction] + 5) * 16,
      y: 64,
    });
  }
  // North-facing office bodies must retain the up-facing atlas group rather than
  // falling back to the right-facing sitter when the desk orientation changes.
  for (const action of ["typing", "seated"] as const)
    assert.deepEqual(humanPose(action, 2, 2), { x: 128, y: 32 });
  assert.deepEqual(humanPose("reading", 2, 2), { x: 32, y: 224 });
  assert.deepEqual(humanPose("typing", 0, 2), { x: 128, y: 128 });
  assert.deepEqual(humanPose("listening", 3, 2), { x: 32, y: 128 });
  assert.deepEqual(humanPose("seated", 3, 2), { x: 32, y: 160 });
});
