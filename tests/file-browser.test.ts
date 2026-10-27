import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFileIndex,
  fileName,
  parentDirectory,
  pathInDirectory,
  resolveDirectory,
  searchDirectory,
  type ProjectFile,
} from "../src/file-browser.ts";

const file = (path: string, visibility = "shared"): ProjectFile => ({
  id: path,
  path,
  visibility,
  version: 1,
  size: 100,
  updated_at: "2026-10-27T00:00:00Z",
});
const files = [
  file("docs/integrations/setup.md"),
  file("README.md"),
  file("docs/project.md"),
  file("design/notes.md"),
  file("docs-archive/old.md"),
  file("docs/private.md", "private"),
];

test("folder browsing groups direct children, preserves nested paths and counts descendants", () => {
  const index = buildFileIndex(files);
  const root = index.get("")!;
  assert.deepEqual(
    root.folders.map((f) => f.name),
    ["design", "docs", "docs-archive"],
  );
  assert.deepEqual(
    root.files.map((f) => f.path),
    ["README.md"],
  );
  assert.equal(root.fileCount, 6);
  const docs = index.get("docs")!;
  assert.deepEqual(
    docs.files.map((f) => f.path),
    ["docs/private.md", "docs/project.md"],
  );
  assert.deepEqual(
    docs.folders.map((f) => f.path),
    ["docs/integrations"],
  );
  assert.equal(docs.fileCount, 3);
  assert.equal(index.get("docs/integrations")!.files[0], files[0]);
  assert.deepEqual(
    files.map((f) => f.path),
    [
      "docs/integrations/setup.md",
      "README.md",
      "docs/project.md",
      "design/notes.md",
      "docs-archive/old.md",
      "docs/private.md",
    ],
  );
});

test("directory names remain exact and naturally sorted even when file and folder share a name", () => {
  const index = buildFileIndex([
    file("folder10/a.md"),
    file("folder2/notes10.md"),
    file("folder2/notes2.md"),
    file("folder2"),
    file("Docs/a.md"),
    file("docs/b.md"),
  ]);
  assert.ok(index.has("Docs") && index.has("docs"));
  assert.deepEqual(
    index
      .get("")!
      .folders.filter((f) => f.name.startsWith("folder"))
      .map((f) => f.name),
    ["folder2", "folder10"],
  );
  assert.deepEqual(
    index.get("folder2")!.files.map((f) => fileName(f.path)),
    ["notes2.md", "notes10.md"],
  );
  assert.equal(index.get("")!.files[0].path, "folder2");
});

test("search is recursive within the current directory without crossing similarly named siblings", () => {
  assert.deepEqual(
    searchDirectory(files, "docs", " SETUP ").map((f) => f.path),
    ["docs/integrations/setup.md"],
  );
  assert.equal(searchDirectory(files, "docs", "old").length, 0);
  assert.equal(
    searchDirectory(files, "", "old")[0].path,
    "docs-archive/old.md",
  );
  assert.equal(searchDirectory(files, "design", "setup").length, 0);
});

test("a folder removed by data refresh falls back to the closest accessible parent", () => {
  const index = buildFileIndex(files);
  assert.equal(
    resolveDirectory(index, "docs/integrations/missing").path,
    "docs/integrations",
  );
  assert.equal(resolveDirectory(index, "removed/nested").path, "");
  const visible = buildFileIndex(
    files.filter((f) => f.visibility !== "private"),
  );
  assert.equal(visible.get("docs")!.fileCount, 2);
  assert.equal(visible.get("docs")!.files.length, 1);
  assert.equal(resolveDirectory(buildFileIndex([]), "docs").path, "");
});

test("new document and upload paths follow the selected folder and support breadcrumb parents", () => {
  assert.equal(
    pathInDirectory("docs/integrations", "settings.md"),
    "docs/integrations/settings.md",
  );
  assert.equal(pathInDirectory("", "settings.md"), "settings.md");
  assert.equal(parentDirectory("docs/integrations"), "docs");
  assert.equal(parentDirectory("docs"), "");
  assert.equal(parentDirectory(""), "");
});
