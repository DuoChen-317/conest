/** Provider-neutral event listener. Optional trusted handler: JSON in, actions out. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
const url = (process.env.CONEST_URL ?? "http://127.0.0.1:4173").replace(
  /\/$/,
  "",
);
const token = process.env.CONEST_TOKEN;
if (!token)
  throw new Error("Set CONEST_TOKEN to your AI credential. Never commit it.");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
async function request(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const response = await fetch(`${url}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
}
const { actor } = await request("/me");
if (actor.type !== "agent") throw new Error("An AI credential is required");
const endpoint = `/projects/${actor.projectId}`;
const cursorFile = resolve(
  process.env.CONEST_CURSOR_FILE ?? `data/client-${actor.id}.json`,
);
let cursor = 0;
try {
  cursor = JSON.parse(await readFile(cursorFile, "utf8")).cursor ?? 0;
} catch {}
const handler: string[] | undefined = process.env.CONEST_HANDLER
  ? JSON.parse(process.env.CONEST_HANDLER)
  : undefined;
if (
  handler &&
  (!Array.isArray(handler) ||
    handler.length === 0 ||
    !handler.every((s) => typeof s === "string"))
)
  throw new Error(
    "CONEST_HANDLER must be a JSON array [executable, ...arguments]",
  );
console.log(
  `${actor.name} connected to ${url}. ${handler ? "Trusted local handler enabled." : "Observe mode: no model is started."}`,
);
async function handle(payload: unknown): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // Local user selects the executable explicitly. Never interpolate event text into a shell.
    // The child does not inherit CoNest or model-provider credentials from the environment.
    const child = spawn(handler![0], handler!.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
      },
      signal: controller.signal,
    });
    let output = "",
      error = "",
      finished = false;
    const timer = setTimeout(() => child.kill("SIGTERM"), 120000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      if (error.length < 4096) error += chunk;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      if (!finished) {
        finished = true;
        reject(e);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      if (code !== 0)
        return reject(new Error(`Handler exited with ${code}: ${error}`));
      try {
        const result = JSON.parse(output);
        if (!Array.isArray(result) || result.length > 10)
          throw new Error("Return an array of at most 10 actions");
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
while (!controller.signal.aborted) {
  try {
    const events = await request(`${endpoint}/events?after=${cursor}&wait=20`);
    for (const event of events) {
      if (controller.signal.aborted) break;
      const relevant =
        ["message.created", "meeting.ready", "office.message"].includes(
          event.kind,
        ) &&
        event.payload.actor_id !== actor.id &&
        !event.payload.recipientAgentIds?.length &&
        (!["message.created", "office.message"].includes(event.kind) ||
          event.payload.actor_type === "human");
      console.log(
        JSON.stringify({
          id: event.id,
          kind: event.kind,
          ...(relevant && event.kind !== "office.message"
            ? { payload: event.payload }
            : {}),
        }),
      );
      if (handler && relevant) {
        const context = await request(endpoint);
        // Public input must not inherit the owner's private office or direct chats.
        // The full snapshot remains available only for the owner's office workflow.
        if (event.kind !== "office.message") {
          context.files = context.files.filter(
            (file: any) => file.visibility === "shared",
          );
          context.activity = context.activity.filter(
            (item: any) =>
              item.owner_id === null && item.kind !== "direct.updated",
          );
          context.conversations = [];
        }
        for (const action of await handle({ actor, event, project: context })) {
          if (
            event.kind === "office.message" &&
            !["message", "office_message"].includes(action.type)
          )
            throw new Error(
              "Office events may only produce private office replies. Share public work explicitly through your own client.",
            );
          if (
            action.type === "office_message" ||
            (event.kind === "office.message" && action.type === "message")
          )
            await request(`${endpoint}/office/messages`, "POST", {
              body: action.body,
            });
          else if (action.type === "message")
            await request(`${endpoint}/messages`, "POST", {
              body: action.body,
              meetingId: action.meetingId,
            });
          else if (action.type === "decision")
            await request(`${endpoint}/decisions`, "POST", {
              body: action.body,
              meetingId: action.meetingId,
            });
          else if (action.type === "task")
            await request(`${endpoint}/tasks`, "POST", {
              title: action.title,
              description: action.description,
              meetingId: action.meetingId,
            });
          else throw new Error(`Unsupported handler action: ${action.type}`);
        }
      }
      cursor = event.id;
      await mkdir(dirname(cursorFile), { recursive: true });
      await writeFile(cursorFile, JSON.stringify({ cursor }), "utf8");
    }
  } catch (error) {
    if (controller.signal.aborted) break;
    console.error("Listener paused:", (error as Error).message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
console.log("Disconnected. The next run resumes from the saved cursor.");
