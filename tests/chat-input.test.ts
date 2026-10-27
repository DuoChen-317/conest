import test from "node:test";
import assert from "node:assert/strict";
import { enterAction } from "../src/chat-input.ts";

test("Enter sends while Shift+Enter keeps a newline", () => {
  assert.equal(enterAction({ key: "Enter" }), "send");
  assert.equal(enterAction({ key: "Enter", shiftKey: true }), "newline");
  assert.equal(enterAction({ key: "a" }), "newline");
});
test("IME confirmation and modifier shortcuts never send messages", () => {
  assert.equal(enterAction({ key: "Enter", isComposing: true }), "newline");
  assert.equal(enterAction({ key: "Enter", keyCode: 229 }), "newline");
  for (const modifier of ["ctrlKey", "altKey", "metaKey"])
    assert.equal(enterAction({ key: "Enter", [modifier]: true }), "newline");
});
test("holding Enter cannot repeatedly send the same message", () => {
  assert.equal(enterAction({ key: "Enter", repeat: true }), "ignore");
  assert.equal(
    enterAction({ key: "Enter", repeat: true, shiftKey: true }),
    "newline",
  );
});
