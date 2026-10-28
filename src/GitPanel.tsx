import { useEffect, useRef, useState } from "react";
import {
  ArrowsClockwise,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plug,
  X,
} from "@phosphor-icons/react";
import { api, type Item } from "./api";
import { tr, localizeError, useLocale } from "./i18n";
import CopyBox from "./CopyBox";
import type { GitAction } from "../shared/git";

export default function GitPanel(props: {
  projectId: string;
  userId: string;
  ownerId: string;
  agents: Item[];
  tasks: Item[];
  demo: boolean;
}) {
  return (
    <RepositoryPanel key={`${props.projectId}:${props.userId}`} {...props} />
  );
}
function RepositoryPanel({
  projectId,
  userId,
  ownerId,
  agents,
  tasks,
  demo,
}: {
  projectId: string;
  userId: string;
  ownerId: string;
  agents: Item[];
  tasks: Item[];
  demo: boolean;
}) {
  const locale = useLocale();
  const [data, setData] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [selected, setSelected] = useState(""),
    [snapshot, setSnapshot] = useState<Item | null>(null),
    [view, setView] = useState<"changes" | "files" | "history">("changes");
  const [paths, setPaths] = useState<string[]>([]),
    [commits, setCommits] = useState<Item[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [preview, setPreview] = useState<Item | null>(null);
  const [message, setMessage] = useState(""),
    [showSetup, setShowSetup] = useState(false),
    [prompt, setPrompt] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    generation = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    selectedRef = useRef(selected);
  selectedRef.current = selected;
  const root = `/projects/${projectId}/git`,
    workspace = data?.workspaces.find((w: Item) => w.id === selected);
  const ownAgents = agents.filter((a) => a.owner_id === userId);
  const online =
    workspace?.status === "ready" &&
    Date.parse(workspace.last_seen ?? "") > Date.now() - 30000;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  async function refresh() {
    const result = await api<Item>(root);
    if (alive.current) {
      setData(result);
      setSelected((previous) =>
        result.workspaces.some((w: Item) => w.id === previous)
          ? previous
          : (result.workspaces[0]?.id ?? ""),
      );
    }
    return result;
  }
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    const load = () =>
      void refresh().catch((e) => {
        if (!cancelled && alive.current) setError(e.message);
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [root, demo]);
  useEffect(() => {
    generation.current++;
    setSnapshot(null);
    setPreview(null);
    setChosen([]);
    setPaths([]);
    setCommits([]);
    setView("changes");
    setNotice("");
    setError("");
  }, [selected]);
  useEffect(() => {
    if (online && !busy && !demo) void operate({ kind: "status" });
  }, [selected, online]);
  async function operate(action: GitAction) {
    const id = selectedRef.current,
      epoch = generation.current;
    if (!id) return;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress(tr("等待本机执行…"));
    try {
      const job = await api<Item>(
        `${root}/workspaces/${id}/jobs`,
        "POST",
        action,
      );
      for (let attempt = 0; attempt < 180; attempt++) {
        if (!alive.current || generation.current !== epoch) return;
        const status = await api<Item>(
          `${root}/workspaces/${id}/jobs/${job.id}`,
        );
        if (status.status === "succeeded") {
          const result = status.result;
          if (["status", "commit", "sync"].includes(action.kind)) {
            setSnapshot(result);
            setChosen([]);
            setPreview(null);
          }
          if (action.kind === "files") {
            setPaths(result.paths);
            if (result.truncated)
              setNotice(tr("仅展示前 500 个文件，请在本机查看完整目录。"));
          }
          if (action.kind === "log") setCommits(result.commits);
          if (["diff", "read"].includes(action.kind)) setPreview(result);
          if (action.kind === "commit") {
            setMessage("");
            setNotice(tr("已提交到本地，尚未推送。"));
          }
          if (action.kind === "push")
            setNotice(
              tr("工作分支已推送。请打开审核链接创建 PR/MR；尚未合并。"),
            );
          await refresh();
          return;
        }
        if (["failed", "uncertain"].includes(status.status))
          throw new Error(status.error);
        setProgress(
          status.status === "running"
            ? tr("本机正在执行…")
            : tr("等待本机执行…"),
        );
        await new Promise<void>((r) => setTimeout(r, 1000));
      }
      throw new Error(
        "Operation still pending; inspect its status before retrying",
      );
    } catch (e) {
      if (alive.current && generation.current === epoch)
        setError((e as Error).message);
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function change(action: "approve" | "revoke") {
    setBusy(true);
    setError("");
    try {
      await api(`${root}/workspaces/${selected}`, "PATCH", { action });
      await refresh();
      setPrompt("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="git-panel" aria-label={tr("代码仓库")}>
      <header className="git-heading">
        <div>
          <GitBranch size={22} aria-hidden="true" />
          <h2>{tr("代码仓库")}</h2>
          {data?.repository && (
            <span className="git-remote" title={data.repository.remoteUrl}>
              {data.repository.remoteUrl
                .replace(/\.git$/, "")
                .split(/[/:]/)
                .slice(-2)
                .join("/")}
            </span>
          )}
        </div>
        {!demo && data?.repository && (
          <button
            type="button"
            className="quiet"
            onClick={() => setShowSetup((s) => !s)}
            disabled={busy}
          >
            <Plug size={16} aria-hidden="true" />
            {tr("连接本机")}
          </button>
        )}
      </header>
      {demo ? (
        <p className="muted">
          {tr("登录项目后，可连接本地 Git 仓库并提交改动。")}
        </p>
      ) : (
        <>
          {!data && !error && <p role="status">{tr("正在读取仓库信息…")}</p>}
          {data &&
            !data.repository &&
            (ownerId === userId ? (
              <form
                className="git-repository-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    await api(`${root}/repository`, "PUT", {
                      remoteUrl: f.get("remote"),
                      baseBranch: f.get("base"),
                    });
                    await refresh();
                    setShowSetup(true);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p>{tr("关联代码仓库，让任务、改动和审核连在一起。")}</p>
                <div className="git-form-row">
                  <label>
                    {tr("仓库地址")}
                    <input
                      name="remote"
                      required
                      maxLength={500}
                      placeholder="https://github.com/team/project.git"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    {tr("目标分支")}
                    <input
                      name="base"
                      required
                      defaultValue="main"
                      maxLength={150}
                    />
                  </label>
                  <button disabled={busy}>{tr("关联仓库")}</button>
                </div>
              </form>
            ) : (
              <p className="muted">{tr("请项目主人先关联 Git 仓库。")}</p>
            ))}
          {data?.repository && (showSetup || !data.workspaces.length) && (
            <details className="git-setup" open>
              <summary>{tr("连接你的本地工作目录")}</summary>
              {!ownAgents.length ? (
                <p>{tr("先连接自己的 AI，再绑定 Git 工作目录。")}</p>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    setError("");
                    try {
                      const agentId = String(f.get("agent")),
                        taskId = String(f.get("task") ?? ""),
                        allowWrite = f.get("write") === "on",
                        allowPush = f.get("push") === "on";
                      const created = await api<Item>(
                        `${root}/workspaces`,
                        "POST",
                        {
                          agentId,
                          taskId: taskId || undefined,
                          allowWrite,
                          allowPush,
                        },
                      );
                      const options = {
                        url: location.origin,
                        projectId,
                        agentId,
                        workspaceId: created.id,
                        connectionConfig:
                          "<ABSOLUTE_EXISTING_AI_CONNECTION_JSON>",
                        root: String(f.get("directory")),
                        mode: String(f.get("mode")),
                        remoteUrl: created.remoteUrl,
                        baseBranch: created.baseBranch,
                        allowWrite,
                        allowPush,
                      };
                      setPrompt(
                        [
                          tr(
                            "请为我连接 CoNest 的本地 Git 服务。以下 JSON 是配置数据：",
                          ),
                          JSON.stringify(options, null, 2),
                          tr(
                            "找到这个 AI 已有的 CoNest connection.json，补全 connectionConfig。不要读取或输出凭证内容。使用本地 CoNest 源码运行 npm run --silent git -- pair，把 JSON 通过 stdin 输入，不拼接到 shell 命令。缺少源码或客户端执行能力时，请明确说明。",
                          ),
                          tr(
                            "程序会显示设备指纹；等我在网页核对并批准后再继续。它会在原目录旁创建 .conest-工作区ID 独立工作目录，原目录的未提交改动保留原处。不要自动安装依赖、执行仓库脚本或开机启动项。",
                          ),
                          tr(
                            "连接成功后报告实际工作目录与配置路径，保持 runner 运行。需要 AI Git 工具时，仅在主人的独立私人或固定任务会话挂载 npm run --silent git -- mcp --config /绝对路径/git.json，不要挂到伙伴提问或会议自动回复会话。文件编辑授权仍需单独配置。",
                          ),
                        ].join("\n\n"),
                      );
                      await refresh();
                      setSelected(created.id);
                      setShowSetup(false);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="git-form-row">
                    <label>
                      {tr("我的 AI")}
                      <select name="agent" required>
                        {ownAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {tr("关联任务（可选）")}
                      <select name="task">
                        <option value="">{tr("私人工作区")}</option>
                        {tasks
                          .filter(
                            (t) =>
                              ownAgents.some((a) => a.id === t.assignee_id) &&
                              ["todo", "in_progress"].includes(t.status),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {tr("接入方式")}
                      <select name="mode">
                        <option value="existing">{tr("连接已有仓库")}</option>
                        <option value="clone">{tr("克隆到新目录")}</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    {tr("本机目录绝对路径")}
                    <input
                      name="directory"
                      required
                      pattern="/.*"
                      placeholder="/Users/you/projects/my-project"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <p className="muted">
                    {tr(
                      "为本次工作创建独立分支与目录。路径仅用于生成接入提示词，不保存到平台。",
                    )}
                  </p>
                  <div className="git-permissions">
                    <label>
                      <input type="checkbox" name="write" />
                      {tr("允许本地提交与同步")}
                    </label>
                    <label>
                      <input type="checkbox" name="push" />
                      {tr("允许推送工作分支并共享审核信息")}
                    </label>
                  </div>
                  <p className="muted">
                    {tr(
                      "Git 工具可以查看整个仓库；本地文件的子目录授权不会限制 Git。",
                    )}
                  </p>
                  <button disabled={busy}>{tr("生成接入提示词")}</button>
                </form>
              )}
            </details>
          )}
          {prompt && (
            <div className="git-prompt">
              <p>{tr("复制给自己的本地 AI 完成连接，再核对下方设备指纹。")}</p>
              <CopyBox value={prompt} />
            </div>
          )}
          {!!data?.workspaces.length && (
            <div className="git-workspace">
              <div className="git-workspace-bar">
                <label>
                  {tr("我的工作区")}
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                  >
                    {data.workspaces.map((w: Item) => (
                      <option key={w.id} value={w.id}>
                        {agents.find((a) => a.id === w.agent_id)?.name ?? "AI"}{" "}
                        ·{" "}
                        {tasks.find((t) => t.id === w.task_id)?.title ??
                          tr("私人工作区")}{" "}
                        · {w.id.slice(0, 6)}
                      </option>
                    ))}
                  </select>
                </label>
                <span role="status" className={online ? "git-online" : "muted"}>
                  {workspace?.status === "waiting"
                    ? tr("等待本机连接")
                    : workspace?.status === "claimed"
                      ? tr("等待主人确认")
                      : online
                        ? tr("本机在线")
                        : tr("本机离线")}
                </span>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => void change("revoke")}
                >
                  {tr("断开连接")}
                </button>
              </div>
              {workspace?.lastJob && (
                <p className="git-last-operation" role="status">
                  {tr("上次操作")}:{" "}
                  {tr(
                    (
                      {
                        status: "查看状态",
                        files: "查看文件",
                        read: "读取文件",
                        diff: "查看差异",
                        log: "查看历史",
                        commit: "本地提交",
                        sync: "同步分支",
                        push: "推送审核",
                      } as Record<string, string>
                    )[workspace.lastJob.kind] ?? workspace.lastJob.kind,
                  )}{" "}
                  ·{" "}
                  {tr(
                    (
                      {
                        queued: "等待执行",
                        running: "正在执行",
                        succeeded: "已完成",
                        failed: "执行失败",
                        uncertain: "结果待核对",
                      } as Record<string, string>
                    )[workspace.lastJob.status],
                  )}
                  {workspace.lastJob.error && (
                    <span> — {localizeError(workspace.lastJob.error)}</span>
                  )}
                </p>
              )}
              {workspace?.status === "claimed" && (
                <div className="git-approval">
                  <strong>
                    {tr("核对本机显示的设备指纹")}:{" "}
                    <code>{workspace.fingerprint}</code>
                  </strong>
                  <p>{workspace.client_name}</p>
                  <button
                    disabled={busy}
                    onClick={() => void change("approve")}
                  >
                    {tr("指纹一致，允许连接")}
                  </button>
                </div>
              )}
              {workspace?.status === "ready" && (
                <>
                  {!online && (
                    <p className="muted">
                      {tr(
                        "启动本机 Git runner 后即可操作；本机休眠或进程退出会暂停连接。",
                      )}
                    </p>
                  )}
                  <div className="git-actions">
                    <span>
                      <GitBranch size={16} aria-hidden="true" />
                      {snapshot?.branch ?? workspace.summary?.branch ?? "—"}
                    </span>
                    <button
                      disabled={!online || busy}
                      onClick={() => void operate({ kind: "status" })}
                    >
                      <ArrowsClockwise size={16} aria-hidden="true" />
                      {tr("刷新改动")}
                    </button>
                    <button
                      disabled={
                        !online || busy || !snapshot || !workspace.allow_write
                      }
                      onClick={() =>
                        void operate({
                          kind: "sync",
                          expectedVersion: snapshot!.version,
                        })
                      }
                    >
                      {tr("同步目标分支")}
                    </button>
                    <button
                      disabled={
                        !online ||
                        busy ||
                        !snapshot ||
                        !workspace.allow_push ||
                        !!snapshot.changes.length
                      }
                      onClick={() => dialog.current?.showModal()}
                    >
                      <GitPullRequest size={16} aria-hidden="true" />
                      {tr("提交审核")}
                    </button>
                  </div>
                  <div
                    className="git-view-tabs"
                    role="group"
                    aria-label={tr("仓库视图")}
                  >
                    <button
                      aria-pressed={view === "changes"}
                      disabled={busy}
                      onClick={() => {
                        setView("changes");
                        setPreview(null);
                        if (!snapshot && online)
                          void operate({ kind: "status" });
                      }}
                    >
                      {tr("改动")}
                      {snapshot ? ` (${snapshot.changes.length})` : ""}
                    </button>
                    <button
                      aria-pressed={view === "files"}
                      disabled={busy || !online}
                      onClick={() => {
                        setView("files");
                        setPreview(null);
                        void operate({ kind: "files" });
                      }}
                    >
                      {tr("仓库文件")}
                    </button>
                    <button
                      aria-pressed={view === "history"}
                      disabled={busy || !online}
                      onClick={() => {
                        setView("history");
                        setPreview(null);
                        void operate({ kind: "log" });
                      }}
                    >
                      {tr("提交历史")}
                    </button>
                  </div>
                  {view === "changes" && (
                    <>
                      {!snapshot ? (
                        <p className="muted">
                          {tr("刷新改动，查看本机工作分支的最新状态。")}
                        </p>
                      ) : (
                        <>
                          {!snapshot.changes.length && (
                            <p className="muted">
                              {tr("工作目录干净，没有未提交改动。")}
                            </p>
                          )}
                          {!!snapshot.blocked && (
                            <p>
                              {tr(
                                "有 {count} 个敏感或不支持的文件未展示，需在本机处理。",
                                { count: snapshot.blocked },
                              )}
                            </p>
                          )}
                          <ul className="git-file-list">
                            {snapshot.changes.map((c: Item) => (
                              <li key={c.path}>
                                <label>
                                  <input
                                    type="checkbox"
                                    aria-label={tr("选择 {path}", {
                                      path: c.path,
                                    })}
                                    disabled={busy || !workspace.allow_write}
                                    checked={chosen.includes(c.path)}
                                    onChange={(e) =>
                                      setChosen((p) =>
                                        e.target.checked
                                          ? [...p, c.path]
                                          : p.filter((s) => s !== c.path),
                                      )
                                    }
                                  />
                                  <code>{c.status.trim()}</code>
                                </label>
                                <button
                                  disabled={!online || busy}
                                  title={c.path}
                                  onClick={() =>
                                    void operate({ kind: "diff", path: c.path })
                                  }
                                >
                                  {c.path}
                                </button>
                              </li>
                            ))}
                          </ul>
                          {!!snapshot.changes.length &&
                            !!workspace.allow_write && (
                              <form
                                className="git-commit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void operate({
                                    kind: "commit",
                                    paths: chosen,
                                    message,
                                    expectedVersion: snapshot.version,
                                  });
                                }}
                              >
                                <label>
                                  {tr("提交说明")}
                                  <textarea
                                    required
                                    maxLength={2000}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={2}
                                  />
                                </label>
                                <button
                                  disabled={
                                    busy ||
                                    !online ||
                                    !chosen.length ||
                                    !message.trim()
                                  }
                                >
                                  <GitCommit size={16} aria-hidden="true" />
                                  {tr("提交选中文件到本地")}
                                </button>
                              </form>
                            )}
                        </>
                      )}
                    </>
                  )}
                  {view === "files" && (
                    <ul className="git-file-list">
                      {paths.map((path) => (
                        <li key={path}>
                          <button
                            disabled={busy || !online}
                            onClick={() => void operate({ kind: "read", path })}
                          >
                            {path}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {view === "history" && (
                    <ol className="git-log">
                      {commits.map((c) => (
                        <li key={c.id}>
                          <code>{c.id.slice(0, 8)}</code>
                          <div>
                            <strong>{c.subject}</strong>
                            <small>
                              {c.author} ·{" "}
                              {new Date(c.date).toLocaleString(locale)}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {preview && (
                    <section className="git-preview">
                      <header>
                        <strong>{preview.path}</strong>
                        <button
                          aria-label={tr("关闭预览")}
                          onClick={() => setPreview(null)}
                        >
                          <X size={16} />
                        </button>
                      </header>
                      <pre tabIndex={0}>
                        {preview.content || tr("无文本差异")}
                      </pre>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
          {!!data?.reviews.length && (
            <details className="git-reviews">
              <summary>
                {tr("团队提交审核记录")} ({data.reviews.length})
              </summary>
              <p className="muted">
                {tr("分支已推送，PR/MR 创建与合并需在远程完成。")}
              </p>
              {data.reviews.map((r: Item) => (
                <article key={r.id}>
                  <strong>
                    {tasks.find((t) => t.id === r.task_id)?.title ?? r.branch}
                  </strong>
                  <small>
                    {r.owner_name} · {r.commit_id.slice(0, 8)}
                  </small>
                  {r.review_url ? (
                    <a href={r.review_url} target="_blank" rel="noreferrer">
                      {tr("打开远程审核页面")}
                    </a>
                  ) : (
                    <span>{tr("请在仓库托管平台创建审核请求。")}</span>
                  )}
                </article>
              ))}
            </details>
          )}
        </>
      )}
      {busy && <p role="status">{progress || tr("正在处理…")}</p>}
      {notice && (
        <p role="status" className="git-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="git-error">
          {localizeError(error)}
        </p>
      )}
      <dialog ref={dialog} className="git-submit-dialog">
        <h3>{tr("提交工作分支审核")}</h3>
        <p>
          {tr(
            "将当前分支推送到远程，并向项目成员共享分支、提交编号和审核入口。不会自动合并。",
          )}
        </p>
        <code>
          {snapshot?.branch} · {snapshot?.head?.slice(0, 8)}
        </code>
        <div>
          <button autoFocus onClick={() => dialog.current?.close()}>
            {tr("取消")}
          </button>
          <button
            onClick={() => {
              dialog.current?.close();
              if (snapshot)
                void operate({
                  kind: "push",
                  expectedVersion: snapshot.version,
                });
            }}
          >
            {tr("推送并提交审核")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
