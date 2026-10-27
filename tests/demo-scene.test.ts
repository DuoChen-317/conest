import test from "node:test";
import assert from "node:assert/strict";
import { demoPhaseAt, demoRoomFor } from "../src/demo-scene.ts";

test("sample playback staggers departures and returns before looping", () => {
  const phases = [0, 1500, 5000, 15_000, 20_000, 32_000].map(demoPhaseAt);
  assert.deepEqual(phases, [0, 1, 2, 3, 4, 0]);
  assert.deepEqual(
    phases.map((phase) => demoRoomFor("demo-human", phase)),
    ["office", "meeting", "meeting", "office", "office", "office"],
  );
  assert.deepEqual(
    phases.map((phase) => demoRoomFor("a1", phase)),
    ["office", "office", "library", "library", "office", "office"],
  );
  assert.equal(demoRoomFor("real-agent", 2), undefined);
});
