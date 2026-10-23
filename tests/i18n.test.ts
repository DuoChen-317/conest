import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  translate,
  resolveLocale,
  setLocale,
  localizeError,
} from "../src/i18n.ts";
import { createDemoData } from "../src/api.ts";
import en from "../src/locales/en.json";
import zh from "../src/locales/zh-CN.json";

test("saved language wins; first browser preference selects Chinese or English", () => {
  assert.equal(resolveLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(resolveLocale(null, ["zh-TW", "en-US"]), "zh-CN");
  assert.equal(resolveLocale("unsupported", ["en-GB", "zh-CN"]), "en");
  assert.equal(resolveLocale(null, ["fr-FR"]), "en");
  assert.equal(resolveLocale(null, []), "en");
});

test("interpolation preserves names and treats values as literal content", () => {
  const key = "{name} 的 AI";
  assert.equal(translate("zh-CN", key, { name: "Maya" }), "Maya 的 AI");
  assert.equal(
    translate("en", key, { name: "小明 {name}" }),
    "小明 {name}'s AI",
  );
  assert.equal(
    translate("en", "{count} 个 AI 受邀", { count: 3 }),
    "Invited AI: 3",
  );
});

test("demo seeds are localized without changing identity, permissions or protocol values", () => {
  const chinese = createDemoData("zh-CN");
  const english = createDemoData("en");
  assert.match(chinese.project.name, /一起/);
  assert.doesNotMatch(JSON.stringify(english), /\p{Script=Han}/u);
  assert.deepEqual(english.agents, chinese.agents);
  assert.deepEqual(english.members, chinese.members);
  assert.equal(english.project.id, chinese.project.id);
  assert.equal(english.meetings[0].status, chinese.meetings[0].status);
  assert.equal(english.files[0].path, chinese.files[0].path);
  assert.equal(english.files[0].visibility, chinese.files[0].visibility);
});

test("translations retain interpolation fields and cover all Chinese UI keys", () => {
  const fields = (value: string) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, value] of Object.entries(en)) {
    assert.doesNotMatch(value, /\p{Script=Han}/u, key);
    assert.deepEqual(fields(key), fields(value), key);
  }
  for (const [key, value] of Object.entries(zh))
    assert.deepEqual(fields(key), fields(value), key);
  for (const path of ["src/App.tsx", "src/api.ts", "src/i18n.ts"]) {
    const source = ts.createSourceFile(
      path,
      readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "tr"
      ) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key) && /\p{Script=Han}/u.test(key.text))
          assert.ok(
            Object.hasOwn(en, key.text),
            `Missing English text in ${path}: ${key.text}`,
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test("API failures and conflict recovery instructions use the selected language", () => {
  setLocale("zh-CN");
  assert.equal(
    localizeError("Username or password is incorrect"),
    "用户名或密码不正确",
  );
  assert.equal(localizeError("Please sign in"), "请先登录");
  assert.match(
    localizeError(
      "Version conflict: current version is 3. Read it before submitting again.",
    ),
    /最新版本/,
  );
  assert.equal(
    localizeError("Validation failed"),
    "请检查输入内容是否符合要求。",
  );
  setLocale("en");
  assert.equal(
    localizeError("Username or password is incorrect"),
    "Username or password is incorrect",
  );
  assert.match(localizeError("Validation failed"), /Please check/);
});
