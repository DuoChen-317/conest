import { z } from "zod";

export const branchSchema = z
  .string()
  .min(1)
  .max(150)
  .refine(
    (s) =>
      /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(s) &&
      !s.includes("..") &&
      !s.includes("@{") &&
      s
        .split("/")
        .every(
          (p) =>
            p && !p.startsWith(".") && !p.endsWith(".") && !p.endsWith(".lock"),
        ),
    "Invalid branch name",
  );
export function validRemote(value: string) {
  if (/^git@[a-zA-Z0-9][a-zA-Z0-9.-]*:[a-zA-Z0-9_./-]+$/.test(value))
    return !value.split(":")[1].split("/").includes("..");
  try {
    const u = new URL(value);
    return (
      ["https:", "ssh:"].includes(u.protocol) &&
      !!u.hostname &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname !== "/" &&
      (u.protocol === "ssh:" ? /^[\w-]*$/.test(u.username) : !u.username)
    );
  } catch {
    return false;
  }
}
export const remoteSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    validRemote,
    "Use an HTTPS or SSH Git URL without embedded credentials",
  );
export const repoSchema = z.object({
  remoteUrl: remoteSchema,
  baseBranch: branchSchema.default("main"),
});
const pathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (s) =>
      !/[\\\x00-\x1f\x7f]/.test(s) &&
      s.split("/").every((p) => p && p !== "." && p !== "..") &&
      !s.startsWith("/"),
    "Use a relative repository path",
  );
export const gitActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status") }),
  z.object({ kind: z.literal("files") }),
  z.object({ kind: z.literal("read"), path: pathSchema }),
  z.object({ kind: z.literal("diff"), path: pathSchema }),
  z.object({ kind: z.literal("log") }),
  z.object({
    kind: z.literal("commit"),
    paths: z.array(pathSchema).min(1).max(100),
    message: z.string().trim().min(1).max(2000),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    kind: z.literal("push"),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    kind: z.literal("sync"),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export type GitAction = z.infer<typeof gitActionSchema>;
export const workBranch = (workspaceId: string, taskId?: string | null) =>
  `conest/${taskId ? `task-${taskId.slice(0, 8)}` : "workspace"}-${workspaceId.slice(0, 8)}`;
export const isWrite = (a: GitAction) => ["commit", "sync"].includes(a.kind);
export const isPublish = (a: GitAction) => a.kind === "push";
export function reviewUrl(remote: string, base: string, branch: string) {
  const normalized = remote
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "");
  let u = new URL(normalized);
  if (u.protocol === "ssh:") u = new URL(`https://${u.hostname}${u.pathname}`);
  if (u.hostname === "github.com")
    return `${u.origin}${u.pathname}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}?expand=1`;
  if (u.hostname === "gitlab.com")
    return `${u.origin}${u.pathname}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}`;
  return null;
}
