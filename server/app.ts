import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  Store,
  hash,
  id,
  now,
  secret,
  passwordHash,
  passwordMatches,
} from "./store.ts";
import { Service, ApiError, requireThat, type Actor } from "./service.ts";
import { handleMcp } from "./mcp.ts";

type Options = {
  database: string;
  publicOrigin?: string;
  secureCookies?: boolean;
  trustProxy?: boolean;
};
export function createApp(options: Options) {
  const store = new Store(options.database);
  const service = new Service(store);
  const app = express();
  app.disable("x-powered-by");
  if (options.trustProxy) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api") || req.path === "/mcp")
      res.setHeader("Cache-Control", "no-store");
    if (req.headers.origin) {
      const expected =
        options.publicOrigin ?? `${req.protocol}://${req.get("host")}`;
      if (req.headers.origin !== expected)
        return res
          .status(403)
          .json({ error: "Cross-origin requests are not allowed" });
    }
    next();
  });
  app.use(express.json({ limit: "13mb", inflate: false }));
  const attempts = new Map<string, { count: number; until: number }>();
  const limitAuth = (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    let bucket = attempts.get(key);
    if (!bucket || bucket.until < Date.now()) {
      bucket = { count: 0, until: Date.now() + 600000 };
      attempts.set(key, bucket);
    }
    if (++bucket.count > 20)
      return next(
        new ApiError(
          429,
          "Too many sign-in attempts. Try again in 10 minutes.",
        ),
      );
    if (attempts.size > 10000)
      for (const [k, b] of attempts)
        if (b.until < Date.now()) attempts.delete(k);
    next();
  };
  const route =
    (fn: (req: Request, res: Response) => any) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };
  const current = (res: Response): Actor => res.locals.actor;
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (token) {
      const agent = store.one(
        "SELECT * FROM agents WHERE token_hash=? AND revoked=0",
        hash(token),
      );
      if (!agent) return next(new ApiError(401, "Invalid AI credential"));
      store.run("UPDATE agents SET last_seen=? WHERE id=?", now(), agent.id);
      res.locals.actor = {
        id: agent.id,
        userId: agent.owner_id,
        name: agent.name,
        type: "agent",
        projectId: agent.project_id,
      } satisfies Actor;
      return next();
    }
    const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("conest_session="))
      ?.slice("conest_session=".length);
    const user = cookie
      ? store.one(
          "SELECT u.id,u.name,u.username FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",
          hash(cookie),
          now(),
        )
      : undefined;
    if (!user) return next(new ApiError(401, "Please sign in"));
    res.locals.actor = {
      id: user.id,
      userId: user.id,
      name: user.name,
      type: "human",
    } satisfies Actor;
    res.locals.user = user;
    next();
  };
  const session = (res: Response, userId: string) => {
    const token = secret();
    store.run("DELETE FROM sessions WHERE expires_at<=?", now());
    store.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      userId,
      new Date(Date.now() + 7 * 86400000).toISOString(),
    );
    res.cookie("conest_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: options.secureCookies ?? false,
      maxAge: 7 * 86400000,
      path: "/",
    });
  };
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: "0.1.0" }),
  );
  app.post(
    "/api/auth/register",
    limitAuth,
    route((req, res) => {
      const data = z
        .object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9_-]{3,32}$/),
          name: z.string().trim().min(1).max(60),
          password: z.string().min(10).max(256),
        })
        .parse(req.body);
      requireThat(
        !store.one("SELECT 1 FROM users WHERE username=?", data.username),
        409,
        "Username already exists",
      );
      const user = { id: id(), username: data.username, name: data.name };
      store.run(
        "INSERT INTO users VALUES(?,?,?,?,?)",
        user.id,
        user.username,
        user.name,
        passwordHash(data.password),
        now(),
      );
      session(res, user.id);
      res.status(201).json(user);
    }),
  );
  app.post(
    "/api/auth/login",
    limitAuth,
    route((req, res) => {
      const data = z
        .object({
          username: z.string().trim().toLowerCase().max(32),
          password: z.string().max(256),
        })
        .parse(req.body);
      const user = store.one(
        "SELECT * FROM users WHERE username=?",
        data.username,
      );
      // Equalize password work for unknown usernames.
      const valid = passwordMatches(
        data.password,
        user?.password ?? dummyPassword,
      );
      requireThat(user && valid, 401, "Username or password is incorrect");
      session(res, user.id);
      res.json({ id: user.id, name: user.name, username: user.username });
    }),
  );
  const dummyPassword = passwordHash(secret());
  app.use("/api", authenticate);
  app.get("/api/me", (_req, res) =>
    res.json({ actor: current(res), user: res.locals.user }),
  );
  app.get(
    "/api/notifications",
    route((_req, res) =>
      res.json(service.collaboration.notifications(current(res))),
    ),
  );
  app.post(
    "/api/projects/:projectId/conversations",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.conversations.start(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.get(
    "/api/projects/:projectId/conversations/:conversationId/messages",
    route((req, res) =>
      res.json(
        service.conversations.messages(
          current(res),
          String(req.params.projectId),
          String(req.params.conversationId),
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/conversations/:conversationId/messages",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.conversations.send(
            current(res),
            String(req.params.projectId),
            String(req.params.conversationId),
            req.body,
          ),
        ),
    ),
  );
  app.get(
    "/api/projects/:projectId/agent-requests",
    route((req, res) =>
      res.json(
        service.conversations.queue(current(res), String(req.params.projectId)),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/agent-requests/:requestId/claim",
    route((req, res) =>
      res.json(
        service.conversations.claim(
          current(res),
          String(req.params.projectId),
          String(req.params.requestId),
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/agent-requests/:requestId/reply",
    route((req, res) =>
      res.json(
        service.conversations.finish(
          current(res),
          String(req.params.projectId),
          String(req.params.requestId),
          req.body,
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/agent-requests/:requestId/retry",
    route((req, res) =>
      res.json(
        service.conversations.retry(
          current(res),
          String(req.params.projectId),
          String(req.params.requestId),
        ),
      ),
    ),
  );
  app.patch(
    "/api/notifications/:invitationId",
    route((req, res) =>
      res.json(
        service.collaboration.respond(
          current(res),
          String(req.params.invitationId),
          req.body,
        ),
      ),
    ),
  );
  app.patch(
    "/api/projects/:projectId/agents/:agentId/preferences",
    route((req, res) =>
      res.json(
        service.collaboration.preferences(
          current(res),
          String(req.params.projectId),
          String(req.params.agentId),
          req.body,
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/meetings/:meetingId/invitations",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.collaboration.invite(
            current(res),
            String(req.params.projectId),
            String(req.params.meetingId),
            req.body,
          ),
        ),
    ),
  );
  app.post(
    "/api/projects/:projectId/meetings/:meetingId/join",
    route((req, res) =>
      res.json(
        service.collaboration.join(
          current(res),
          String(req.params.projectId),
          String(req.params.meetingId),
        ),
      ),
    ),
  );
  app.post(
    "/api/auth/logout",
    route((req, res) => {
      service.human(current(res));
      const token = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("conest_session="))
        ?.slice(15);
      if (token)
        store.run("DELETE FROM sessions WHERE token_hash=?", hash(token));
      res.clearCookie("conest_session", { path: "/" });
      res.json({ ok: true });
    }),
  );
  app.get("/api/projects", (_req, res) => {
    const a = current(res);
    res.json(
      a.type === "agent"
        ? store.all("SELECT * FROM projects WHERE id=?", a.projectId!)
        : store.all(
            "SELECT p.*,m.role FROM projects p JOIN members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.created_at",
            a.userId,
          ),
    );
  });
  app.post(
    "/api/projects",
    route((req, res) =>
      res.status(201).json(service.createProject(current(res), req.body)),
    ),
  );
  app.post(
    "/api/invites/accept",
    route((req, res) =>
      res.json(
        service.acceptInvite(
          current(res),
          z.object({ token: z.string().min(1).max(200) }).parse(req.body).token,
        ),
      ),
    ),
  );
  app.get(
    "/api/projects/:projectId",
    route((req, res) =>
      res.json(service.snapshot(current(res), String(req.params.projectId))),
    ),
  );
  app.post(
    "/api/projects/:projectId/invites",
    route((req, res) =>
      res
        .status(201)
        .json(service.invite(current(res), String(req.params.projectId))),
    ),
  );
  app.post(
    "/api/projects/:projectId/agents",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.createAgent(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.delete(
    "/api/projects/:projectId/agents/:agentId",
    route((req, res) => {
      service.revokeAgent(
        current(res),
        String(req.params.projectId),
        String(req.params.agentId),
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/projects/:projectId/meetings",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.createMeeting(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.patch(
    "/api/projects/:projectId/meetings/:meetingId",
    route((req, res) =>
      res.json(
        service.updateMeeting(
          current(res),
          String(req.params.projectId),
          String(req.params.meetingId),
          req.body,
        ),
      ),
    ),
  );
  app.get(
    "/api/projects/:projectId/messages",
    route((req, res) =>
      res.json(
        service.readMessages(
          current(res),
          String(req.params.projectId),
          typeof req.query.meetingId === "string"
            ? req.query.meetingId
            : undefined,
        ),
      ),
    ),
  );
  app.put(
    "/api/projects/:projectId/presence",
    route((req, res) =>
      res.json(
        service.setPresence(
          current(res),
          String(req.params.projectId),
          req.body,
        ),
      ),
    ),
  );
  app.get(
    "/api/projects/:projectId/office/messages",
    route((req, res) =>
      res.json(
        service.readOfficeMessages(current(res), String(req.params.projectId)),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/office/messages",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.sendOfficeMessage(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.post(
    "/api/projects/:projectId/messages",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.sendMessage(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.post(
    "/api/projects/:projectId/decisions",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.proposeDecision(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.patch(
    "/api/projects/:projectId/decisions/:decisionId",
    route((req, res) =>
      res.json(
        service.confirmDecision(
          current(res),
          String(req.params.projectId),
          String(req.params.decisionId),
          req.body,
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/tasks",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.createTask(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.patch(
    "/api/projects/:projectId/tasks/:taskId",
    route((req, res) =>
      res.json(
        service.updateTask(
          current(res),
          String(req.params.projectId),
          String(req.params.taskId),
          req.body,
        ),
      ),
    ),
  );
  app.post(
    "/api/projects/:projectId/files",
    route((req, res) =>
      res
        .status(201)
        .json(
          service.writeFile(
            current(res),
            String(req.params.projectId),
            req.body,
          ),
        ),
    ),
  );
  app.get(
    "/api/projects/:projectId/files/:fileId",
    route((req, res) => {
      const version = req.query.version
        ? z.coerce.number().int().min(1).parse(req.query.version)
        : undefined;
      const { file, entry, versions } = service.readFile(
        current(res),
        String(req.params.projectId),
        String(req.params.fileId),
        version,
      );
      if (req.query.download === "1") {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(file.path.split("/").pop())}`,
        );
        return res.send(Buffer.from(entry.content));
      }
      res.json({
        ...file,
        version: entry.version,
        content: Buffer.from(entry.content).toString("base64"),
        encoding: "base64",
        versions,
      });
    }),
  );
  app.get(
    "/api/projects/:projectId/events",
    route(async (req, res) => {
      const after = z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .parse(req.query.after);
      const wait = z.coerce
        .number()
        .int()
        .min(0)
        .max(25)
        .default(0)
        .parse(req.query.wait);
      const abort = new AbortController();
      res.on("close", () => abort.abort());
      res.json(
        await service.waitForEvents(
          current(res),
          String(req.params.projectId),
          after,
          wait,
          abort.signal,
        ),
      );
    }),
  );
  app.post(
    "/api/agent/status",
    route((req, res) => {
      const a = current(res);
      requireThat(a.type === "agent", 403, "AI credential required");
      const { status } = z
        .object({ status: z.enum(["idle", "working", "meeting", "waiting"]) })
        .parse(req.body);
      store.run(
        "UPDATE agents SET status=?,last_seen=? WHERE id=?",
        status,
        now(),
        a.id,
      );
      res.json({ status });
    }),
  );
  app.post(
    "/mcp",
    authenticate,
    route((req, res) => {
      const a = current(res);
      requireThat(a.type === "agent", 403, "Use an AI credential for MCP");
      return handleMcp(req, res, service, a);
    }),
  );
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Use MCP Streamable HTTP POST requests" });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof z.ZodError)
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request is too large" });
    if (error.type === "encoding.unsupported")
      return res
        .status(415)
        .json({ error: "Compressed request bodies are not supported" });
    if (error instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON" });
    console.error("Request failed:", error.message);
    res.status(500).json({ error: "Server error" });
  });
  return { app, store, service };
}
