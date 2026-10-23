import test from "node:test";
import assert from "node:assert/strict";
import { humanPose, interactionFor } from "../src/interaction.ts";

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
