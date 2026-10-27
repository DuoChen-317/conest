import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createApp } from "./app.ts";
import express from "express";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(
  portIndex >= 0 ? args[portIndex + 1] : (process.env.PORT ?? 4173),
);
const hostIndex = args.indexOf("--host");
const host =
  hostIndex >= 0 ? args[hostIndex + 1] : (process.env.HOST ?? "127.0.0.1");
const { app, store } = createApp({
  database: resolve(process.env.DATA_DIR ?? "data", "conest.sqlite"),
  publicOrigin: process.env.PUBLIC_ORIGIN,
  secureCookies: process.env.SECURE_COOKIES === "1",
  trustProxy: process.env.TRUST_PROXY === "1",
});
// Purchased art is an optional local runtime pack, never bundled in the repository.
const sceneAssets = resolve(
  process.env.SCENE_ASSET_DIR ??
    resolve(process.env.DATA_DIR ?? "data", "scene-assets"),
);
app.get("/scene-assets/manifest.json", (_req, res) => {
  const manifest = resolve(sceneAssets, "manifest.json");
  res.setHeader("Cache-Control", "no-store");
  res.json(
    existsSync(manifest)
      ? JSON.parse(readFileSync(manifest, "utf8"))
      : { available: false },
  );
});
app.use(
  "/scene-assets",
  express.static(sceneAssets, {
    index: false,
    dotfiles: "deny",
    fallthrough: false,
    maxAge: "1h",
  }),
);
let vite:
  Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | undefined;
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist"), { index: false }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile("index.html", { root: resolve("dist") }),
  );
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const http = app.listen(port, host, () =>
  console.log(`CoNest is ready at http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    http.closeAllConnections();
    http.close(() => {
      void vite?.close();
      store.close();
      process.exit(0);
    });
  });
