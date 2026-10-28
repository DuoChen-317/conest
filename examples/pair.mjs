/** Dependency-free pairing + stdio/HTTP MCP bridge. Contains no model runner or local-file tools. */
import { constants } from "node:fs";
import { open, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const maxBytes = 16000000;
function origin(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Invalid service origin");
  return url.origin;
}
async function privateText(path) {
  if (!isAbsolute(path)) throw new Error("Use an absolute local config path");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.size > 64000 ||
      info.mode & 0o077 ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw new Error("Local config must be owner-only");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
async function request(url, path, body, headers = {}) {
  const target = new URL(path, url);
  // Browsers resolve *.localhost themselves; Node's OS resolver may not. Preserve virtual-host routing.
  const localHost =
    target.protocol === "http:" && target.hostname.endsWith(".localhost")
      ? target.host
      : undefined;
  if (localHost) target.hostname = "127.0.0.1";
  const response = await fetch(target, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(localHost ? { Host: localHost } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`CoNest request failed (${response.status})`);
  return response;
}
async function pair() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 64000) throw new Error("Input too large");
  }
  const options = JSON.parse(input),
    url = origin(options.url);
  if (
    !/^[A-Za-z0-9_-]{30,100}$/.test(options.code) ||
    typeof options.clientName !== "string" ||
    options.clientName.length > 60
  )
    throw new Error("Invalid pairing input");
  const token = "cn_" + randomBytes(32).toString("base64url");
  const base = join(homedir(), ".config", "conest", "connections");
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(base, "client-"));
  const tokenFile = join(directory, "credential"),
    configPath = join(directory, "connection.json");
  await writeFile(tokenFile, token, { mode: 0o600, flag: "wx" });
  const claimed = await (
    await request(url, "/api/connect/claim", {
      code: options.code,
      credentialHash: sha256(token),
      clientName: options.clientName,
    })
  ).json();
  if (
    (options.projectId && options.projectId !== claimed.projectId) ||
    (options.agentId && options.agentId !== claimed.agentId)
  )
    throw new Error("Pairing identity did not match");
  const config = {
    url,
    tokenFile,
    projectId: claimed.projectId,
    agentId: claimed.agentId,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.error(
    JSON.stringify({
      status: "waiting_for_owner_approval",
      fingerprint: sha256(token).slice(0, 8),
      configPath,
    }),
  );
  for (let count = 0; count < 300; count++) {
    const state = await (
      await request(url, "/api/connect/poll", { id: claimed.id, token })
    ).json();
    if (state.status === "approved") {
      const { actor } = await (
        await request(url, "/api/me", undefined, {
          Authorization: `Bearer ${token}`,
        })
      ).json();
      if (actor.id !== claimed.agentId || actor.projectId !== claimed.projectId)
        throw new Error("Credential identity mismatch");
      console.log(
        JSON.stringify({
          status: "credential_verified",
          configPath,
          projectId: actor.projectId,
          agentId: actor.id,
        }),
      );
      return;
    }
    if (state.status !== "claimed") throw new Error("Connection was cancelled");
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error("Connection approval timed out; generate a new prompt");
}
async function proxy(configPath) {
  const config = JSON.parse(await privateText(configPath)),
    url = origin(config.url);
  let protocolVersion;
  let verifiedHash;
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let pending = 0;
  lines.on("line", (line) => {
    if (line.length > maxBytes || ++pending > 16) {
      console.error("MCP input limit exceeded");
      process.exit(1);
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      pending--;
      console.error("Invalid MCP input");
      return;
    }
    void (async () => {
      try {
        const token = (await privateText(config.tokenFile)).trim();
        if (!/^cn_[A-Za-z0-9_-]+$/.test(token))
          throw new Error("Invalid local credential");
        if (verifiedHash !== sha256(token)) {
          const { actor } = await (
            await request(url, "/api/me", undefined, {
              Authorization: `Bearer ${token}`,
            })
          ).json();
          if (
            actor.type !== "agent" ||
            actor.id !== config.agentId ||
            actor.projectId !== config.projectId
          )
            throw new Error("Credential identity mismatch");
          verifiedHash = sha256(token);
        }
        const response = await request(url, "/mcp", message, {
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
          ...(protocolVersion
            ? { "MCP-Protocol-Version": protocolVersion }
            : {}),
        });
        if (response.status === 202 || message.id === undefined) return;
        let text = "";
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          text += decoder.decode(chunk, { stream: true });
          if (Buffer.byteLength(text) > maxBytes)
            throw new Error("MCP output limit exceeded");
        }
        text += decoder.decode();
        const replies = response.headers
          .get("content-type")
          ?.includes("text/event-stream")
          ? text.split(/\r?\n\r?\n/).flatMap((event) => {
              const data = event
                .split(/\r?\n/)
                .filter((row) => row.startsWith("data:"))
                .map((row) => row.slice(5).trimStart())
                .join("\n");
              return data ? [JSON.parse(data)] : [];
            })
          : [JSON.parse(text)];
        for (const reply of replies) {
          if (message.method === "initialize" && reply.result?.protocolVersion)
            protocolVersion = reply.result.protocolVersion;
          process.stdout.write(JSON.stringify(reply) + "\n");
        }
      } catch {
        if (message.id !== undefined)
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32001,
                message:
                  "CoNest connection failed; check local configuration, authorization and service availability",
              },
            }) + "\n",
          );
      } finally {
        pending--;
      }
    })();
  });
  lines.on("close", () => process.exit(0));
}

try {
  if (process.argv[2] === "pair" && process.argv.length === 3) await pair();
  else if (
    process.argv[2] === "proxy" &&
    process.argv[3] === "--config" &&
    process.argv.length === 5
  )
    await proxy(process.argv[4]);
  else
    throw new Error(
      "Use pair with JSON stdin, or proxy --config /absolute/path/connection.json",
    );
} catch {
  console.error(
    "CoNest setup failed. Check the pairing expiry, browser approval, network and owner-only local files. No credential was printed.",
  );
  process.exitCode = 1;
}
