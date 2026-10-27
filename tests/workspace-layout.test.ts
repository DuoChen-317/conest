import test from "node:test";
import assert from "node:assert/strict";
import {
  clampChatWidth,
  clampSceneHeight,
  parseWorkspacePreference,
  chatWidthBounds,
} from "../src/workspace-layout.ts";

test("panel resizing preserves usable chat and scene widths", () => {
  assert.deepEqual(chatWidthBounds(1000), { min: 260, max: 566 });
  assert.equal(clampChatWidth(1000, 1000), 566);
  assert.equal(clampChatWidth(100, 1000), 260);
  assert.equal(clampChatWidth(320, 1000), 320);
  assert.equal(clampChatWidth(320, 450), 260);
  assert.equal(clampSceneHeight(1400), 1000);
  assert.equal(clampSceneHeight(200), 320);
});
test("stored sizes tolerate corrupt preferences and preserve automatic height", () => {
  for (const value of [
    null,
    "broken",
    "null",
    "{}",
    '{"chatWidth":"300","sceneHeight":"600"}',
  ])
    assert.deepEqual(parseWorkspacePreference(value), {
      chatWidth: 300,
      sceneHeight: null,
    });
  assert.deepEqual(
    parseWorkspacePreference('{"chatWidth":340,"sceneHeight":720}'),
    { chatWidth: 340, sceneHeight: 720 },
  );
  assert.deepEqual(
    parseWorkspacePreference('{"chatWidth":9999,"sceneHeight":9999}'),
    { chatWidth: 640, sceneHeight: 1000 },
  );
});
