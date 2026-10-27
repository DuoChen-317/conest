import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "../src/clipboard.ts";

const configuration = '{\n  "name": "助手",\n  "token": "example-only"\n}';

function environment(
  t: TestContext,
  clipboard?: { writeText: (value: string) => Promise<void> },
  fallback = true,
) {
  let copied = "",
    removed = false,
    focused = false;
  class Element {
    focus() {
      focused = true;
    }
  }
  const input = {
    value: "",
    readOnly: false,
    style: { cssText: "" },
    setAttribute() {},
    focus() {},
    select() {},
    remove() {
      removed = true;
    },
  };
  const values = {
    navigator: { clipboard },
    HTMLElement: Element,
    document: {
      activeElement: new Element(),
      getSelection: () => null,
      createElement: () => input,
      body: { append() {} },
      execCommand(command: string) {
        assert.equal(command, "copy");
        copied = input.value;
        return fallback;
      },
    },
  };
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return () => ({ copied, removed, focused });
}

test("native clipboard preserves multiline Unicode configuration", async (t) => {
  let value = "";
  const state = environment(t, {
    writeText: async (text) => {
      value = text;
    },
  });
  await copyText(configuration);
  assert.equal(value, configuration);
  assert.equal(state().removed, false);
});

test("missing Clipboard API uses selection copy and restores focus", async (t) => {
  const state = environment(t);
  await copyText(configuration);
  assert.deepEqual(state(), {
    copied: configuration,
    removed: true,
    focused: true,
  });
});

test("denied clipboard permission falls back without losing content", async (t) => {
  const state = environment(t, {
    writeText: async () => {
      throw new Error("NotAllowedError");
    },
  });
  await copyText(configuration);
  assert.deepEqual(state(), {
    copied: configuration,
    removed: true,
    focused: true,
  });
});

test("failure of both APIs is reported after temporary input cleanup", async (t) => {
  const state = environment(t, undefined, false);
  await assert.rejects(copyText(configuration), /Clipboard unavailable/);
  assert.equal(state().removed, true);
  assert.equal(state().focused, true);
});
