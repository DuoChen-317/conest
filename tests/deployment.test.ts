import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("production serves the homepage and SPA routes from a hidden deployment directory", async () => {
  const base = await mkdtemp(join(tmpdir(), "conest-deployment-"));
  const cwd = join(base, ".local", "conest");
  await mkdir(join(cwd, "dist", "assets"), { recursive: true });
  const html = "<!doctype html><title>CoNest deployment</title>";
  await writeFile(join(cwd, "dist", "index.html"), html);
  await writeFile(join(cwd, "dist", "assets", "app.js"), "/* app */");
  await writeFile(join(cwd, "dist", ".private"), "private marker");
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done) => probe.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    ["--import", import.meta.resolve("tsx"), resolve("server/index.ts")],
    {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        DATA_DIR: join(cwd, "data"),
        SCENE_ASSET_DIR: join(cwd, "data", "scene-assets"),
        PUBLIC_ORIGIN: origin,
        SECURE_COOKIES: "0",
        TRUST_PROXY: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (value) => (logs += value));
  child.stderr.on("data", (value) => (logs += value));
  const closed = once(child, "close");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      try {
        ready = (await fetch(`${origin}/api/health`)).ok;
      } catch {}
      if (ready) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    assert.ok(ready, `Production server did not start: ${logs}`);
    for (const path of ["/", "/projects/example"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.equal(await response.text(), html, path);
    }
    assert.equal(
      await (await fetch(`${origin}/assets/app.js`)).text(),
      "/* app */",
    );
    assert.ok(
      !(await (await fetch(`${origin}/.private`)).text()).includes(
        "private marker",
      ),
      "Hidden public files must remain inaccessible",
    );
  } finally {
    child.kill("SIGTERM");
    await closed;
    await rm(base, { recursive: true, force: true });
  }
});
