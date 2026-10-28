import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  gitActionSchema,
  validRemote,
  workBranch,
  type GitAction,
} from "../shared/git.ts";

const digest = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
export const safeGitPath = (p: string) =>
  !!p &&
  !isAbsolute(p) &&
  !/[\\\x00-\x1f\x7f]/.test(p) &&
  p
    .split("/")
    .every(
      (s) =>
        s &&
        s !== "." &&
        s !== ".." &&
        s !== ".git" &&
        s !== "node_modules" &&
        (!s.startsWith(".") ||
          [".gitignore", ".gitattributes", ".github"].includes(s)) &&
        !/^\.env(?:\.|$)/i.test(s) &&
        !/^\.?(?:ssh|aws|config|credentials|secrets?)(?:\.|$)/i.test(s) &&
        !/\.(?:pem|key|p12|pfx|sqlite3?|db)(?:-wal|-shm)?$/i.test(s),
    );
function environment() {
  const env: NodeJS.ProcessEnv = {};
  for (const k of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "SSH_AUTH_SOCK",
    "XDG_CONFIG_HOME",
    "SystemRoot",
  ])
    if (process.env[k]) env[k] = process.env[k];
  return {
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/usr/bin/false",
    SSH_ASKPASS: "/usr/bin/false",
    GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    LC_ALL: "C",
    GIT_LITERAL_PATHSPECS: "1",
  };
}
/** Fixed argv only. No shell, inherited model/CoNest tokens, hooks, fsmonitor or external diff. */
export async function git(root: string, args: string[], allowLocal = false) {
  return new Promise<string>((done, fail) => {
    const child = spawn(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "submodule.recurse=false",
        "-c",
        "diff.external=",
        "-c",
        "protocol.ext.allow=never",
        "-c",
        `protocol.file.allow=${allowLocal ? "always" : "never"}`,
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        "protocol.ssh.allow=always",
        ...args,
      ],
      { cwd: root, env: environment(), stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = Buffer.alloc(0),
      error = Buffer.alloc(0),
      settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(
        new Error("Git timed out; inspect the repository before retrying"),
      );
    }, 120000);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? fail(err) : done(output.toString("utf8"));
    };
    child.stdout.on("data", (b: Buffer) => {
      output = Buffer.concat([output, b]);
      if (output.length > 1_000_000) {
        child.kill("SIGKILL");
        finish(new Error("Git output is too large; narrow the operation"));
      }
    });
    child.stderr.on("data", (b: Buffer) => {
      if (error.length < 64000) error = Buffer.concat([error, b]);
    });
    child.on("error", () =>
      finish(new Error("Git could not start; install Git on this machine")),
    );
    child.on("close", (code) => {
      if (code === 0) return finish();
      const detail = error.toString("utf8");
      // Never forward arbitrary Git diagnostics: URLs, credentials and absolute paths may appear.
      finish(
        new Error(
          /non-fast-forward|fetch first|rejected/.test(detail)
            ? "Remote branch has changed; fetch and review before pushing"
            : /user.email|identity|ident/.test(detail)
              ? "Configure your local Git user.name and user.email first"
              : /Authentication|Permission denied|could not read Username/.test(
                    detail,
                  )
                ? "Git authentication failed; sign in with your local credential manager"
                : "Git operation failed; inspect local Git status and credentials",
        ),
      );
    });
  });
}

export class GitRepository {
  constructor(
    public root: string,
    public remote: string,
    public base: string,
    private allowLocal = false,
    private expectedBranch?: string,
  ) {}
  async validate() {
    if (!isAbsolute(this.root) || (await realpath(this.root)) !== this.root)
      throw new Error("Repository path changed or contains symlinks");
    if (
      (
        await git(this.root, ["rev-parse", "--show-toplevel"], this.allowLocal)
      ).trim() !== this.root
    )
      throw new Error("Bind the repository root, not a subdirectory");
    if (
      this.expectedBranch &&
      (
        await git(
          this.root,
          ["symbolic-ref", "--quiet", "--short", "HEAD"],
          this.allowLocal,
        )
      ).trim() !== this.expectedBranch
    )
      throw new Error("Git branch does not match this workspace");
    // Repository-controlled helpers/includes can execute programs. User-level authentication stays available.
    const config = await git(
      this.root,
      ["config", "--local", "--no-includes", "--list"],
      this.allowLocal,
    );
    if (
      config
        .split("\n")
        .some((l) =>
          /^(?:include(?:if)?\.|filter\.|credential\.|core\.(?:sshcommand|gitproxy)|remote\..*\.(?:uploadpack|receivepack|proxy)|extensions\.(?:worktreeconfig|objectformat))/i.test(
            l,
          ),
        )
    )
      throw new Error(
        "Repository has unsupported executable or included Git configuration",
      );
    const remote = (
      await git(this.root, ["remote", "get-url", "origin"], this.allowLocal)
    ).trim();
    const push = (
      await git(
        this.root,
        ["remote", "get-url", "--push", "--all", "origin"],
        this.allowLocal,
      )
    ).trim();
    if (
      remote !== this.remote ||
      push !== this.remote ||
      (!this.allowLocal && !validRemote(remote))
    )
      throw new Error("Repository origin differs from the authorized remote");
    return this;
  }
  private async path(p: string, missing = false) {
    if (!safeGitPath(p))
      throw new Error("File is outside the permitted repository tree");
    let current = this.root;
    for (const part of p.split("/")) {
      current = join(current, part);
      try {
        const s = await lstat(current);
        if (
          s.isSymbolicLink() ||
          (!s.isDirectory() && (!s.isFile() || s.nlink !== 1))
        )
          throw new Error(
            "Symlinks, hardlinks and special files are not supported",
          );
        const actual = await realpath(current),
          rel = relative(this.root, actual);
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
          throw new Error("File escaped the repository");
      } catch (e) {
        if (missing && (e as NodeJS.ErrnoException).code === "ENOENT") break;
        throw e;
      }
    }
    return current;
  }
  private async bytes(p: string) {
    const target = await this.path(p);
    const f = await open(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const s = await f.stat();
      if (!s.isFile() || s.nlink !== 1 || s.size > 1_000_000)
        throw new Error("File is too large or unsupported");
      return await f.readFile();
    } finally {
      await f.close();
    }
  }
  async status() {
    const head = (
      await git(this.root, ["rev-parse", "HEAD"], this.allowLocal)
    ).trim();
    const branch = (
      await git(
        this.root,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        this.allowLocal,
      )
    ).trim();
    const raw = await git(
      this.root,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      this.allowLocal,
    );
    const parts = raw.split("\0"),
      changes: { path: string; status: string }[] = [];
    const fingerprint = [head, raw];
    let blocked = 0;
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      const code = parts[i].slice(0, 2),
        p = parts[i].slice(3);
      if (/[RC]/.test(code)) i++; // Rename paths are separate NUL records; Git add is still path-specific.
      if (!safeGitPath(p)) {
        blocked++;
        continue;
      }
      if (changes.length >= 500)
        throw new Error("Too many changed files; narrow this workspace");
      await this.path(p, true);
      let content = "deleted";
      try {
        content = digest(await this.bytes(p));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      fingerprint.push(p, content);
      changes.push({ path: p, status: code });
    }
    // Includes staged content, so an index change invalidates the reviewed snapshot too.
    fingerprint.push(
      await git(
        this.root,
        ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--binary"],
        this.allowLocal,
      ),
    );
    return {
      head,
      branch,
      changes,
      blocked,
      version: digest(fingerprint.join("\0")),
    };
  }
  async execute(
    input: unknown,
    reauthorize: () => Promise<unknown> = async () => {},
  ) {
    const a = gitActionSchema.parse(input);
    await this.validate();
    // Serialize even read snapshots with other CoNest processes sharing this repository.
    const common = (
      await git(this.root, ["rev-parse", "--git-common-dir"], this.allowLocal)
    ).trim();
    const lockPath = resolve(this.root, common, "conest-operation.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch {
      throw new Error("Repository is busy; wait for the other Git operation");
    }
    try {
      await lock.writeFile(String(process.pid));
      return await this.operation(a, reauthorize);
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  private async operation(
    a: GitAction,
    reauthorize: () => Promise<unknown>,
  ): Promise<Record<string, any>> {
    if (a.kind === "status") return this.status();
    if (a.kind === "files") {
      const all = (
        await git(
          this.root,
          ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
          this.allowLocal,
        )
      )
        .split("\0")
        .filter((p) => safeGitPath(p));
      const paths = [];
      for (const p of [...new Set(all)].slice(0, 500)) {
        try {
          await this.path(p);
          paths.push(p);
        } catch {}
      }
      return { paths, truncated: all.length > 500 };
    }
    if (a.kind === "read") {
      const b = await this.bytes(a.path);
      if (b.length > 64000 || b.includes(0))
        throw new Error("Only UTF-8 text files up to 64 KB can be previewed");
      return {
        path: a.path,
        content: new TextDecoder("utf-8", { fatal: true }).decode(b),
      };
    }
    if (a.kind === "diff") {
      await this.path(a.path, true);
      const status = await this.status();
      const change = status.changes.find((c) => c.path === a.path);
      if (!change)
        return { path: a.path, content: "", version: status.version };
      let content;
      if (change.status === "??") {
        const b = await this.bytes(a.path);
        content = b.includes(0)
          ? "Binary file"
          : b
              .toString("utf8")
              .split("\n")
              .map((l) => `+${l}`)
              .join("\n");
      } else
        content = await git(
          this.root,
          [
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "HEAD",
            "--",
            a.path,
          ],
          this.allowLocal,
        );
      return { path: a.path, content, version: status.version };
    }
    if (a.kind === "log")
      return {
        commits: (
          await git(
            this.root,
            ["log", "-20", "--format=%H%x00%an%x00%aI%x00%s"],
            this.allowLocal,
          )
        )
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [id, author, date, subject] = l.split("\0");
            return { id, author, date, subject };
          }),
      };
    const snapshot = await this.status();
    if (snapshot.version !== a.expectedVersion)
      throw new Error(
        "Repository changed; refresh and review the latest changes",
      );
    if (a.kind === "commit") {
      if (
        snapshot.changes.some(
          (c) => c.status[0] !== " " && c.status !== "??",
        ) ||
        (
          await git(
            this.root,
            ["diff", "--cached", "--name-only"],
            this.allowLocal,
          )
        ).trim()
      )
        throw new Error(
          "The index already contains changes; review or unstage them locally first",
        );
      for (const p of a.paths) {
        await this.path(p, true);
        if (!snapshot.changes.some((c) => c.path === p))
          throw new Error("Selected file is no longer changed");
      }
      const blobs = new Map<string, string | null>();
      for (const p of a.paths) {
        try {
          const bytes = await this.bytes(p);
          blobs.set(
            p,
            createHash(snapshot.head.length === 64 ? "sha256" : "sha1")
              .update(`blob ${bytes.length}\0`)
              .update(bytes)
              .digest("hex"),
          );
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          blobs.set(p, null);
        }
      }
      await reauthorize();
      await this.validate();
      if ((await this.status()).version !== a.expectedVersion)
        throw new Error(
          "Repository changed; refresh and review the latest changes",
        );
      await git(this.root, ["add", "--", ...new Set(a.paths)], this.allowLocal);
      await reauthorize();
      await this.validate();
      const staged = (
        await git(
          this.root,
          ["diff", "--cached", "--name-only", "-z", "--no-renames"],
          this.allowLocal,
        )
      )
        .split("\0")
        .filter(Boolean);
      if (staged.some((p) => !a.paths.includes(p)))
        throw new Error(
          "The index includes unrelated changes; inspect it locally",
        );
      for (const p of a.paths) {
        const records = (
          await git(
            this.root,
            ["ls-files", "--stage", "-z", "--", p],
            this.allowLocal,
          )
        )
          .split("\0")
          .filter(Boolean);
        const actual = records[0]?.split(" ")[1] ?? null;
        if (records.length > 1 || actual !== blobs.get(p))
          throw new Error(
            "Staged contents differ from the reviewed files; inspect the index locally",
          );
      }
      if (
        (
          await git(this.root, ["rev-parse", "HEAD"], this.allowLocal)
        ).trim() !== snapshot.head
      )
        throw new Error(
          "Repository changed; refresh and review the latest changes",
        );
      await git(this.root, ["commit", "-m", a.message], this.allowLocal);
      return this.status();
    }
    if (a.kind === "push") {
      if (
        !/^conest\/[a-zA-Z0-9/_-]+$/.test(snapshot.branch) ||
        snapshot.branch === this.base
      )
        throw new Error(
          "Publish only a CoNest task branch, never the base branch",
        );
      if (snapshot.changes.length || snapshot.blocked)
        throw new Error(
          "Commit or resolve local changes before submitting for review",
        );
      await reauthorize();
      await this.validate();
      if ((await this.status()).version !== a.expectedVersion)
        throw new Error(
          "Repository changed; refresh and review the latest changes",
        );
      await git(
        this.root,
        [
          "push",
          "--porcelain",
          "origin",
          `refs/heads/${snapshot.branch}:refs/heads/${snapshot.branch}`,
        ],
        this.allowLocal,
      );
      return { branch: snapshot.branch, head: snapshot.head };
    }
    if (snapshot.changes.length || snapshot.blocked)
      throw new Error("Save or commit local changes before syncing");
    await reauthorize();
    await git(
      this.root,
      [
        "fetch",
        "--no-tags",
        "origin",
        `refs/heads/${this.base}:refs/remotes/origin/${this.base}`,
      ],
      this.allowLocal,
    );
    await reauthorize();
    await this.validate();
    if ((await this.status()).version !== a.expectedVersion)
      throw new Error(
        "Repository changed; refresh and review the latest changes",
      );
    await git(
      this.root,
      ["merge", "--ff-only", `refs/remotes/origin/${this.base}`],
      this.allowLocal,
    );
    return this.status();
  }
}

export async function prepareRepository(
  options: {
    root: string;
    mode: "clone" | "existing";
    remoteUrl: string;
    baseBranch: string;
    workspaceId: string;
    taskId?: string | null;
  },
  allowLocal = false,
) {
  const { root, remoteUrl, baseBranch } = options;
  if (!isAbsolute(root) || (!allowLocal && !validRemote(remoteUrl)))
    throw new Error("Use an absolute directory and an authorized Git remote");
  if (options.mode === "clone") {
    // Refuse existing destinations, even empty directories, to preserve user material.
    try {
      await lstat(root);
      throw new Error("Clone destination already exists");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const parent = await realpath(dirname(root));
    if (parent !== dirname(root))
      throw new Error("Choose a destination without symlink ancestors");
    await git(
      parent,
      [
        "clone",
        "--no-recurse-submodules",
        "--origin",
        "origin",
        "--",
        remoteUrl,
        root,
      ],
      allowLocal,
    );
  }
  await new GitRepository(root, remoteUrl, baseBranch, allowLocal).validate();
  // A task always gets a new branch/worktree; an existing checkout is never switched or cleaned.
  {
    const workRoot = `${root}.conest-${options.workspaceId}`;
    const branch = workBranch(options.workspaceId, options.taskId);
    await git(
      root,
      [
        "worktree",
        "add",
        "-b",
        branch,
        workRoot,
        `refs/remotes/origin/${baseBranch}`,
      ],
      allowLocal,
    );
    return new GitRepository(
      workRoot,
      remoteUrl,
      baseBranch,
      allowLocal,
      branch,
    ).validate();
  }
}
