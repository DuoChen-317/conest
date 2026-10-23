import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  HouseLine,
  UsersThree,
  ChatCircleDots,
  FolderOpen,
  Kanban,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  X,
  PaperPlaneTilt,
  Robot,
  Copy,
  Check,
  SignOut,
  CaretDown,
  FileText,
  DownloadSimple,
  Clock,
  Play,
  Pause,
  Stop,
  LinkSimple,
  LockSimple,
  Globe,
  CheckCircle,
  Circle,
  ArrowRight,
  Info,
  Leaf,
  DotsThree,
  PlugsConnected,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { api, createDemoData, decodeText, time, type Item } from "./api";
import {
  tr,
  useLocale,
  setLocale,
  getLocale,
  localizeError,
  type Locale,
} from "./i18n";

function LanguageSwitch() {
  const locale = useLocale();
  return (
    <label className="language-switch">
      <Globe size={16} aria-hidden="true" />
      <select
        aria-label={tr("语言")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="zh-CN" lang="zh-CN">
          中文
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}

const tabs = [
  { id: "office", label: "共享空间", icon: HouseLine },
  { id: "meetings", label: "会议室", icon: ChatCircleDots },
  { id: "files", label: "项目文件", icon: FolderOpen },
  { id: "tasks", label: "任务看板", icon: Kanban },
  { id: "team", label: "伙伴与 AI", icon: UsersThree },
];
const statusLabels: Item = {
  idle: "待命",
  working: "工作中",
  meeting: "讨论中",
  waiting: "等待确认",
  offline: "未连接",
  active: "进行中",
  paused: "已暂停",
  ended: "已结束",
  proposed: "待确认",
  todo: "待开始",
  in_progress: "进行中",
  review: "待验收",
  done: "已完成",
  confirmed: "已确认",
  rejected: "未采用",
};
const activityLabels: Item = {
  "project.created": "创建了项目",
  "agent.created": "添加了 AI 伙伴",
  "agent.revoked": "断开了 AI",
  "member.joined": "加入了项目",
  "meeting.started": "发起了会议",
  "meeting.status": "更新了会议",
  "message.created": "发送了消息",
  "decision.proposed": "提出了方案",
  "decision.reviewed": "确认了讨论结果",
  "task.created": "创建了任务",
  "task.updated": "更新了进展",
  "file.updated": "提交了文件",
};
function agentOnline(agent: Item) {
  return (
    agent.last_seen && Date.now() - new Date(agent.last_seen).getTime() < 90000
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {tr(statusLabels[status] ?? status)}
    </span>
  );
}
function Avatar({
  index = 0,
  small = false,
}: {
  index?: number;
  small?: boolean;
}) {
  const i = ((index % 6) + 6) % 6;
  return (
    <span
      aria-hidden="true"
      className={`avatar ${small ? "small" : ""}`}
      style={{
        backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 100}%`,
      }}
    />
  );
}
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const first = box.current?.querySelector<HTMLElement>(
      "input,textarea,button,select",
    );
    first?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const elements = box.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={box}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={tr("关闭")}
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Auth({
  onAuth,
  onDemo,
  invite,
}: {
  onAuth: (u: Item) => void;
  onDemo: () => void;
  invite: string | null;
}) {
  const [register, setRegister] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const u = await api(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        data,
      );
      onAuth(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <LanguageSwitch />
      <section className="auth-art">
        <a className="brand" href="/">
          co<span>nest</span>
          <span className="brand-dot" />
        </a>
        <div className="auth-title">
          <span className="eyebrow">
            <Leaf size={15} /> {tr("A little space. A lot of possibilities.")}
          </span>
          <h1>
            {tr("你的伙伴，")}
            <br />
            {tr("你的 AI，")}
            <br />
            <span>{tr("同一个空间。")}</span>
          </h1>
          <p>
            {tr("把各自的想法带进来，")}
            <br />
            {tr("一起讨论，然后把项目做出来。")}
          </p>
        </div>
        <img
          src="/assets/office.png"
          alt={tr("俯视像素办公楼，包含工作室、会议室、资料室和公共客厅")}
        />
        <span className="auth-caption">
          {tr("A shared home for people & their agents.")}
        </span>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">{tr("Welcome to conest")}</span>
          <h2>
            {invite
              ? tr("有人邀请你一起工作")
              : register
                ? tr("给你的想法，找个落脚点。")
                : tr("欢迎回到你的空间。")}
          </h2>
          <p>{tr("连接自己的 AI，和伙伴一起推进项目。")}</p>
          <div className="segmented">
            <button
              className={register ? "selected" : ""}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              {tr("创建账号")}
            </button>
            <button
              className={!register ? "selected" : ""}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              {tr("登录")}
            </button>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                {tr("怎么称呼你")}
                <input
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="name"
                  placeholder={tr("你的名字")}
                />
              </label>
            )}
            <label>
              {tr("用户名")}
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9_-]{3,32}"
                minLength={3}
                maxLength={32}
                autoComplete="username"
                placeholder={tr("至少 3 位英文、数字或下划线")}
              />
            </label>
            <label>
              {tr("密码")}
              <input
                name="password"
                type="password"
                required
                minLength={register ? 10 : 1}
                maxLength={256}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={register ? tr("至少 10 个字符") : tr("输入密码")}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {localizeError(error)}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? tr("正在连接…")
                : register
                  ? tr("创建我的空间")
                  : tr("进入空间")}
              <ArrowRight size={18} />
            </button>
          </form>
          <button className="demo-link" onClick={onDemo}>
            {tr("先逛逛演示空间")}
            <ArrowUpRight size={15} />
          </button>
          <p className="auth-note">
            <LockSimple size={14} /> {tr("私人上下文留在你自己的 AI 工具里。")}
          </p>
        </div>
      </section>
    </div>
  );
}
export default function App() {
  const locale = useLocale();
  const [user, setUser] = useState<Item | null>(null),
    [ready, setReady] = useState(false),
    [demo, setDemo] = useState(
      new URLSearchParams(location.search).has("demo"),
    );
  const [projects, setProjects] = useState<Item[]>([]),
    [projectId, setProjectId] = useState(""),
    [data, setData] = useState<Item | null>(null);
  const [tab, setTab] = useState("office"),
    [modal, setModal] = useState<string | null>(null),
    [meetingId, setMeetingId] = useState<string | null>(null),
    [messages, setMessages] = useState<Item[]>([]);
  const [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState<Item | null>(null),
    [file, setFile] = useState<Item | null>(null);
  const [fileText, setFileText] = useState(""),
    [filePath, setFilePath] = useState(""),
    [filePrivate, setFilePrivate] = useState(false),
    [fileEditable, setFileEditable] = useState(true),
    [search, setSearch] = useState("");
  const [invite] = useState(new URLSearchParams(location.search).get("invite"));
  const [selectedMember, setSelectedMember] = useState<Item | null>(null);
  const notify = (message: string) => setToast(message);
  const close = useCallback(() => {
    setModal(null);
    setCredential(null);
    setSelectedMember(null);
  }, []);
  const refresh = useCallback(async () => {
    if (demo) {
      setData(createDemoData(locale));
      return;
    }
    if (projectId) setData(await api(`/projects/${projectId}`));
  }, [projectId, demo, locale]);
  const loadProjects = useCallback(async () => {
    const list = await api<Item[]>("/projects");
    setProjects(list);
    setProjectId((previous) =>
      list.some((p) => p.id === previous) ? previous : (list[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    api("/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (user && !demo) {
      (async () => {
        if (invite) {
          try {
            const r = await api("/invites/accept", "POST", { token: invite });
            setProjectId(r.projectId);
            history.replaceState(null, "", "/");
            notify(tr("已加入项目"));
          } catch (e) {
            setError((e as Error).message);
          }
        }
        await loadProjects();
      })().catch((e) => setError(e.message));
    }
  }, [user, demo, invite, loadProjects]);
  useEffect(() => {
    if (demo) {
      setData(createDemoData(locale));
    }
  }, [demo, locale]);
  useEffect(() => {
    if (demo) return;
    setData(null);
    if (!projectId) return;
    let stopped = false;
    const run = () =>
      api(`/projects/${projectId}`)
        .then((r) => {
          if (!stopped) setData(r);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    void run();
    const interval = setInterval(run, 4000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [projectId, demo]);
  useEffect(() => {
    if (demo) {
      setMessages(
        meetingId
          ? [
              {
                id: "dm1",
                actor_name: "Alex",
                actor_id: "demo-human",
                actor_type: "human",
                body: tr(
                  "我们先把第一版的范围定下来，让每个人自己的 AI 都能进来协作。",
                ),
                created_at: new Date().toISOString(),
              },
              {
                id: "dm2",
                actor_name: "Atlas",
                actor_id: "a1",
                actor_type: "agent",
                body: tr(
                  "我建议先跑通会议、共享文件和任务交接。模型与私人记忆由各自的客户端管理。",
                ),
                created_at: new Date().toISOString(),
              },
            ]
          : [],
      );
      return;
    }
    if (!projectId) return;
    let stopped = false;
    const run = () =>
      api(
        `/projects/${projectId}/messages${meetingId ? `?meetingId=${meetingId}` : ""}`,
      )
        .then((r) => {
          if (!stopped) setMessages(r);
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    void run();
    const timer = setInterval(run, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [projectId, meetingId, demo, locale]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  async function action(
    fn: () => Promise<any>,
    success?: string,
    skipRefresh = false,
  ) {
    if (demo) {
      notify(tr("这是演示空间。登录后可以创建自己的项目。"));
      return false;
    }
    setBusy(true);
    setError("");
    try {
      await fn();
      if (!skipRefresh) await refresh();
      if (success) notify(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const endpoint = `/projects/${projectId}`;
  const activeMeeting = data?.meetings.find((m: Item) => m.status !== "ended");
  const selectedMeeting = data?.meetings.find((m: Item) => m.id === meetingId);
  const isOwner = data?.project.owner_id === user?.id;
  async function openFile(f: Item, version?: number) {
    if (demo) {
      setFile({
        ...f,
        versions: [{ version: f.version, actor_name: "Atlas" }],
      });
      setFileText(
        tr(
          "# CoNest\n\n让每个人带着自己的 AI，一起讨论、协作、完成项目。\n\n这是演示文件。",
        ),
      );
      setFilePath(f.path);
      setFilePrivate(false);
      setFileEditable(true);
      setModal("file");
      return;
    }
    await action(async () => {
      const result = await api(
        `${endpoint}/files/${f.id}${version ? `?version=${version}` : ""}`,
      );
      setFile(result);
      const editable =
        result.size < 512000 &&
        (/^(text\/|application\/(json|javascript|xml))/.test(result.mime) ||
          /\.(md|txt|tsx?|jsx?|json|ya?ml|css|html|csv|py|sh|toml)$/i.test(
            result.path,
          ));
      setFileEditable(editable);
      setFileText(editable ? decodeText(result.content) : "");
      setFilePath(result.path);
      setFilePrivate(result.visibility === "private");
      setModal("file");
    });
  }
  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;
    if (uploaded.size > 8 * 1024 * 1024) {
      setError(tr("文件大小不能超过 8 MB"));
      return;
    }
    const array = new Uint8Array(await uploaded.arrayBuffer());
    let bytes = "";
    for (let i = 0; i < array.length; i++)
      bytes += String.fromCharCode(array[i]);
    await action(
      () =>
        api(`${endpoint}/files`, "POST", {
          path: uploaded.name,
          content: btoa(bytes),
          encoding: "base64",
          mime: uploaded.type || "application/octet-stream",
          baseVersion: 0,
          visibility: "shared",
        }),
      tr("文件已上传"),
    );
    e.target.value = "";
  }
  const enterMeeting = (id: string) => {
    setMeetingId(id);
    setTab("meetings");
  };
  if (!ready) return <div className="loading">{tr("正在打开 conest…")}</div>;
  if (!user && !demo)
    return (
      <>
        <Auth
          onAuth={setUser}
          onDemo={() => {
            setDemo(true);
            history.replaceState(null, "", "/?demo=1");
          }}
          invite={invite}
        />
        {error && (
          <div className="toast error" role="alert">
            {localizeError(error)}
            <button onClick={() => setError("")} aria-label={tr("关闭错误")}>
              <X />
            </button>
          </div>
        )}
      </>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setTab("office");
          }}
        >
          co<span>nest</span>
          <span className="brand-dot" />
        </a>
        <div className="workspace-tag">
          <span className="workspace-symbol">
            <HouseLine size={19} />
          </span>
          <div>
            <b>{tr("我们的工作空间")}</b>
            <small>{demo ? tr("演示空间") : tr("一起把想法做出来")}</small>
          </div>
        </div>
        <span className="sidebar-label">{tr("一起工作")}</span>
        <nav aria-label={tr("主导航")}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => {
                setTab(t.id);
                setSearch("");
                if (t.id !== "meetings") setMeetingId(null);
              }}
            >
              <t.icon size={20} weight={tab === t.id ? "fill" : "regular"} />
              {tr(t.label)}
              {t.id === "meetings" &&
                data?.meetings.some((m: Item) => m.status === "active") && (
                  <span className="nav-dot" />
                )}
              {t.id === "tasks" && data && (
                <span className="nav-count">
                  {data.tasks.filter((t: Item) => t.status !== "done").length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <Leaf size={20} />
            <p>
              {tr("好想法，")}
              <br />
              {tr("值得一起完成。")}
            </p>
          </div>
          <button className="sidebar-help" onClick={() => setModal("help")}>
            <Info size={18} /> {tr("怎样接入我的 AI？")}
            <ArrowUpRight size={14} />
          </button>
          <button
            className="user-menu"
            onClick={() => {
              if (demo) {
                setDemo(false);
                history.replaceState(null, "", "/");
              } else
                void action(
                  async () => {
                    await api("/auth/logout", "POST");
                    setUser(null);
                    setProjects([]);
                    setData(null);
                    setProjectId("");
                  },
                  undefined,
                  true,
                );
            }}
          >
            <span className="user-initial">
              {demo ? tr("访") : user?.name?.[0]}
            </span>
            <span>
              {demo ? tr("访客模式") : user?.name}
              <small>{demo ? tr("登录并创建空间") : tr("已登录")}</small>
            </span>
            <SignOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            {tr("工作空间")}
            <span>/</span>
            <b>{data?.project.name ?? tr("开始一个新项目")}</b>
          </span>
          <div className="top-actions">
            <LanguageSwitch />
            {demo ? (
              <button
                className="button small"
                onClick={() => {
                  setDemo(false);
                  history.replaceState(null, "", "/");
                }}
              >
                {tr("创建我的空间")}
                <ArrowUpRight size={15} />
              </button>
            ) : (
              <>
                <label className="project-select">
                  <span className="sr-only">{tr("选择项目")}</span>
                  <select
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setMeetingId(null);
                    }}
                  >
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <CaretDown size={12} />
                </label>
                <button
                  className="icon-button"
                  aria-label={tr("新建项目")}
                  onClick={() => setModal("project")}
                >
                  <Plus size={18} />
                </button>
              </>
            )}
            <span className="live-indicator">
              <span />
              {demo ? tr("演示") : tr("实时同步")}
            </span>
          </div>
        </header>
        {!data && !projectId && !demo ? (
          <main className="onboard">
            <img
              src="/assets/office.png"
              alt={tr("等待伙伴加入的共享办公空间")}
            />
            <div>
              <span className="eyebrow">{tr("Make yourself at home")}</span>
              <h1>{tr("从一个共同的项目开始。")}</h1>
              <p>
                {tr("创建项目，邀请伙伴，接入你们各自的 AI。")}
                <br />
                {tr("这里会成为大家工作的共同空间。")}
              </p>
              <button
                className="button primary"
                onClick={() => setModal("project")}
              >
                <Plus size={18} />
                {tr("创建第一个项目")}
              </button>
              <button className="text-button" onClick={() => setModal("join")}>
                {tr("我有邀请链接或邀请码")}
              </button>
            </div>
          </main>
        ) : !data ? (
          <main className="loading">{tr("正在同步项目…")}</main>
        ) : (
          <main className="content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {demo
                    ? tr("A preview of life at conest")
                    : tr("Your team, under one roof")}
                </div>
                <h1>
                  {tab === "office"
                    ? tr("一起工作，也一起想事情。")
                    : tr(tabs.find((t) => t.id === tab)?.label ?? "")}
                </h1>
                <p>
                  {tab === "office"
                    ? data.project.description ||
                      tr("带上你的 AI，和伙伴一起推进这个项目。")
                    : tab === "meetings"
                      ? tr("让不同的背景和想法，在这里碰面。")
                      : tab === "files"
                        ? tr("同一个项目，始终有据可查的每一次修改。")
                        : tab === "tasks"
                          ? tr("从一个决定，到每个人手里的下一步。")
                          : tr("人和 AI 各有身份，共同参与这个项目。")}
                </p>
              </div>
              <div className="heading-actions">
                {tab === "office" && (
                  <button className="button" onClick={() => setModal("agent")}>
                    <PlugsConnected size={17} />
                    {tr("接入 AI")}
                  </button>
                )}
                {(tab === "office" || tab === "meetings") && (
                  <button
                    className="button primary"
                    onClick={() => setModal("meeting")}
                  >
                    <Plus size={17} />
                    {tr("发起会议")}
                  </button>
                )}
                {tab === "files" && (
                  <>
                    <label className="button file-upload">
                      <ArrowUpRight size={17} />
                      {tr("上传文件")}
                      <input
                        type="file"
                        onChange={uploadFile}
                        disabled={busy}
                      />
                    </label>
                    <button
                      className="button primary"
                      onClick={() => {
                        setFile(null);
                        setFilePath("");
                        setFileText("");
                        setFilePrivate(false);
                        setFileEditable(true);
                        setModal("file");
                      }}
                    >
                      <Plus size={17} />
                      {tr("新建文档")}
                    </button>
                  </>
                )}
                {tab === "tasks" && (
                  <button
                    className="button primary"
                    onClick={() => setModal("task")}
                  >
                    <Plus size={17} />
                    {tr("创建任务")}
                  </button>
                )}
                {tab === "team" && (
                  <>
                    <button
                      className="button"
                      onClick={() => setModal("agent")}
                    >
                      <Robot size={17} />
                      {tr("接入 AI")}
                    </button>
                    <button
                      className="button primary"
                      disabled={!isOwner && !demo}
                      onClick={() =>
                        void action(async () => {
                          const r = await api(`${endpoint}/invites`, "POST");
                          setCredential({
                            invite: `${location.origin}/?invite=${r.token}`,
                          });
                          setModal("invite");
                        })
                      }
                    >
                      <Plus size={17} />
                      {tr("邀请伙伴")}
                    </button>
                  </>
                )}
              </div>
            </div>
            {demo && (
              <div className="demo-banner">
                <Info size={17} />
                <span>
                  {tr(
                    "这是演示空间。人物、消息与任务均为示例，未连接真实 AI。",
                  )}
                </span>
              </div>
            )}
            {tab === "office" && (
              <div className="office-layout">
                <div className="office-main">
                  <section className="map-card">
                    <header className="section-header">
                      <div>
                        <span className="tiny-square" />
                        <h2>{tr("我们的共享空间")}</h2>
                      </div>
                      <span className="muted">
                        {tr("{count} 位伙伴 · {agents} 个 AI", {
                          count: data.members.length,
                          agents: data.agents.length,
                        })}
                      </span>
                    </header>
                    <div className="office-map">
                      <img
                        src="/assets/office.png"
                        alt={tr("俯视像素办公室地图")}
                      />
                      <button
                        className="room-label room-studio"
                        onClick={() => setTab("team")}
                      >
                        <HouseLine size={14} />
                        {tr("个人工作室")}
                        <ArrowUpRight size={12} />
                      </button>
                      <button
                        className={`room-label room-meeting ${activeMeeting ? "occupied" : ""}`}
                        onClick={() =>
                          activeMeeting
                            ? enterMeeting(activeMeeting.id)
                            : setModal("meeting")
                        }
                      >
                        <ChatCircleDots size={14} />
                        {tr("会议室")}
                        {activeMeeting && <span className="room-live" />}
                      </button>
                      <button
                        className="room-label room-library"
                        onClick={() => setTab("files")}
                      >
                        <FolderOpen size={14} />
                        {tr("项目资料室")}
                        <ArrowUpRight size={12} />
                      </button>
                      <button
                        className="room-label room-workshop"
                        onClick={() => setTab("tasks")}
                      >
                        <Kanban size={14} />
                        {tr("共同工作间")}
                        <ArrowUpRight size={12} />
                      </button>
                      {data.members.slice(0, 3).map((m: Item, i: number) => (
                        <button
                          key={m.id}
                          className="map-resident map-human"
                          style={{ left: `${[13, 40, 72][i]}%`, top: "80%" }}
                          onClick={() => setTab("team")}
                          aria-label={tr("查看伙伴 {value0}", {
                            value0: m.name,
                          })}
                        >
                          <Avatar index={[0, 2, 4][i]} />
                          <span>{m.name}</span>
                        </button>
                      ))}
                      {data.agents.slice(0, 6).map((a: Item, i: number) => {
                        const positions = [
                          [18, 23],
                          [49, 23],
                          [82, 23],
                          [25, 73],
                          [53, 73],
                          [76, 73],
                        ];
                        return (
                          <button
                            key={a.id}
                            className="map-resident"
                            style={{
                              left: `${positions[i][0]}%`,
                              top: `${positions[i][1]}%`,
                            }}
                            onClick={() => {
                              setSelectedMember(a);
                              setModal("resident");
                            }}
                            aria-label={tr("查看 {value0}", { value0: a.name })}
                          >
                            <Avatar index={[1, 3, 5, 1, 3, 5][i]} />
                            <span>
                              {a.name}
                              <i
                                className={
                                  demo || agentOnline(a) ? "online" : ""
                                }
                              />
                            </span>
                          </button>
                        );
                      })}
                      <span className="map-footer">
                        {tr("点房间或伙伴，看看正在发生什么")}
                      </span>
                    </div>
                    <footer className="map-legend">
                      <span>
                        <i className="legend-dot green" />
                        {tr("工作中")}
                      </span>
                      <span>
                        <i className="legend-dot blue" />
                        {tr("讨论中")}
                      </span>
                      <span>
                        <i className="legend-dot orange" />
                        {tr("等待你")}
                      </span>
                      <span className="map-caption">
                        {tr("a place to build, together.")}
                      </span>
                    </footer>
                  </section>
                  <section className="team-strip">
                    <div className="section-header">
                      <h2>{tr("今天的伙伴")}</h2>
                      <button
                        className="text-button"
                        onClick={() => setTab("team")}
                      >
                        {tr("查看全部")}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="resident-list">
                      {data.members.slice(0, 3).map((m: Item, i: number) => (
                        <button
                          key={m.id}
                          className="resident-card"
                          onClick={() => setTab("team")}
                        >
                          <Avatar index={[0, 2, 4][i]} />
                          <div>
                            <strong>{m.name}</strong>
                            <small>
                              {m.role === "owner"
                                ? tr("空间创建者")
                                : tr("项目伙伴")}
                            </small>
                          </div>
                          <span className="human-tag">{tr("人")}</span>
                        </button>
                      ))}
                      {data.agents.slice(0, 3).map((a: Item, i: number) => (
                        <button
                          key={a.id}
                          className="resident-card"
                          onClick={() => {
                            setSelectedMember(a);
                            setModal("resident");
                          }}
                        >
                          <Avatar index={[1, 3, 5][i]} />
                          <div>
                            <strong>{a.name}</strong>
                            <small>
                              {tr("{name} 的 AI", { name: a.owner_name })}
                            </small>
                          </div>
                          <Badge
                            status={
                              demo
                                ? a.status
                                : agentOnline(a)
                                  ? a.status
                                  : "offline"
                            }
                          />
                        </button>
                      ))}
                      {data.agents.length === 0 && (
                        <button
                          className="add-resident"
                          onClick={() => setModal("agent")}
                        >
                          <Plus size={20} />
                          {tr("给你的 AI 留个位置")}
                        </button>
                      )}
                    </div>
                  </section>
                </div>
                <aside className="office-rail">
                  <section className="meeting-preview">
                    <div className="section-header">
                      <h2>{tr("会议室")}</h2>
                      <ChatCircleDots size={19} />
                    </div>
                    {activeMeeting ? (
                      <>
                        <Badge status={activeMeeting.status} />
                        <h3>{activeMeeting.title}</h3>
                        <p>
                          {activeMeeting.agenda ||
                            tr("打开会议，带上你的想法。")}
                        </p>
                        <div className="mini-avatars">
                          {data.agents.slice(0, 3).map((a: Item, i: number) => (
                            <Avatar key={a.id} index={[1, 3, 5][i]} small />
                          ))}
                          <span>
                            {tr("{count} 个 AI 受邀", {
                              count: activeMeeting.agent_count,
                            })}
                          </span>
                        </div>
                        <button
                          className="button full"
                          onClick={() => enterMeeting(activeMeeting.id)}
                        >
                          {tr("进入会议室")}
                          <ArrowRight size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="quiet-room">
                          <ChatCircleDots size={36} />
                        </div>
                        <h3>{tr("桌子空着，想法随时来。")}</h3>
                        <p>{tr("邀请伙伴和各自的 AI，一起讨论下一步。")}</p>
                        <button
                          className="button full"
                          onClick={() => setModal("meeting")}
                        >
                          {data.meetings.length
                            ? tr("发起会议")
                            : tr("发起第一次会议")}
                          <Plus size={16} />
                        </button>
                      </>
                    )}
                  </section>
                  <section className="activity-card">
                    <div className="section-header">
                      <h2>{tr("空间动态")}</h2>
                      <Clock size={17} />
                    </div>
                    {data.activity.length ? (
                      <div className="activity-list">
                        {data.activity.slice(0, 6).map((e: Item) => (
                          <div className="activity-item" key={e.id}>
                            <span className="activity-mark">
                              {e.kind.startsWith("file") ? (
                                <FileText size={14} />
                              ) : e.kind.startsWith("meeting") ? (
                                <ChatCircleDots size={14} />
                              ) : (
                                <Check size={14} />
                              )}
                            </span>
                            <div>
                              <p>
                                <b>
                                  {e.payload.actorName ??
                                    e.payload.actor_name ??
                                    tr("伙伴")}
                                </b>{" "}
                                {tr(activityLabels[e.kind] ?? "更新了项目")}
                              </p>
                              <span>
                                {e.payload.title ??
                                  e.payload.path ??
                                  e.payload.body?.slice(0, 35) ??
                                  ""}
                              </span>
                              <time>{time(e.created_at)}</time>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted activity-placeholder">
                        {tr("工作开始后，进展会出现在这里。")}
                      </p>
                    )}
                  </section>
                  <div className="rail-note">
                    <Leaf size={19} />
                    <span>
                      {tr("每个独立的想法，")}
                      <br />
                      {tr("都可以在这里找到回应。")}
                    </span>
                  </div>
                </aside>
              </div>
            )}
            {tab === "meetings" && (
              <div className="meeting-layout">
                <section className="meeting-list">
                  <h2>
                    {tr("项目会议")}
                    <span>{data.meetings.length}</span>
                  </h2>
                  {data.meetings.length ? (
                    data.meetings.map((m: Item) => (
                      <button
                        className={`meeting-item ${meetingId === m.id ? "selected" : ""}`}
                        key={m.id}
                        onClick={() => setMeetingId(m.id)}
                      >
                        <Badge status={m.status} />
                        <h3>{m.title}</h3>
                        <p>{m.agenda || tr("没有补充议题")}</p>
                        <small>
                          {tr("{count} 个 AI 受邀", { count: m.agent_count })} ·{" "}
                          {time(m.created_at)}
                        </small>
                      </button>
                    ))
                  ) : (
                    <Empty
                      icon={ChatCircleDots}
                      title={tr("第一张会议桌，等你入座。")}
                    >
                      {tr("创建会议，邀请人和 AI 一起讨论。")}
                    </Empty>
                  )}
                </section>
                <section className="conversation">
                  {selectedMeeting ? (
                    <>
                      <header className="conversation-header">
                        <div>
                          <Badge status={selectedMeeting.status} />
                          <h2>{selectedMeeting.title}</h2>
                          <p>{selectedMeeting.agenda}</p>
                        </div>
                        {(isOwner ||
                          selectedMeeting.creator_id === user?.id ||
                          demo) &&
                          selectedMeeting.status !== "ended" && (
                            <div className="meeting-controls">
                              <button
                                className="button small"
                                disabled={busy}
                                onClick={() =>
                                  void action(() =>
                                    api(
                                      `${endpoint}/meetings/${meetingId}`,
                                      "PATCH",
                                      {
                                        status:
                                          selectedMeeting.status === "paused"
                                            ? "active"
                                            : "paused",
                                      },
                                    ),
                                  )
                                }
                              >
                                {selectedMeeting.status === "paused" ? (
                                  <Play size={15} />
                                ) : (
                                  <Pause size={15} />
                                )}
                                {selectedMeeting.status === "paused"
                                  ? tr("继续")
                                  : tr("暂停")}
                              </button>
                              <button
                                className="button small"
                                onClick={() => setModal("endMeeting")}
                              >
                                <Stop size={15} />
                                {tr("结束")}
                              </button>
                            </div>
                          )}
                      </header>
                      <div className="meeting-context">
                        <UsersThree size={16} />
                        {tr("项目成员共同参与 · 每个 AI 最多 {count} 次发言", {
                          count: selectedMeeting.max_turns,
                        })}
                      </div>
                      <Chat messages={messages} agents={data.agents} />
                      <MessageForm
                        disabled={selectedMeeting.status !== "active" || busy}
                        placeholder={
                          selectedMeeting.status === "active"
                            ? tr("分享你的想法，也可以 @你的 AI…")
                            : selectedMeeting.status === "paused"
                              ? tr("会议已暂停")
                              : tr("会议已结束")
                        }
                        send={async (body) => {
                          return action(async () => {
                            await api(`${endpoint}/messages`, "POST", {
                              body,
                              meetingId,
                            });
                            setMessages(
                              await api(
                                `${endpoint}/messages?meetingId=${meetingId}`,
                              ),
                            );
                          });
                        }}
                      />
                      <div className="conversation-tools">
                        <button
                          className="text-button"
                          onClick={() => setModal("decision")}
                        >
                          <Plus size={14} />
                          {tr("记录待确认方案")}
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setModal("task")}
                        >
                          <Kanban size={14} />
                          {tr("创建关联任务")}
                        </button>
                        <button
                          className="text-button"
                          disabled={selectedMeeting.status !== "active"}
                          onClick={() =>
                            void action(
                              () =>
                                api(`${endpoint}/messages`, "POST", {
                                  body: tr(
                                    "请受邀的 AI 整理本次会议：明确共识、保留分歧，并通过 propose_decision / propose_task 提交草案，等待人确认。",
                                  ),
                                  meetingId,
                                }),
                              tr(
                                "已向会议发送整理请求；需要受邀 AI 客户端在线处理。",
                              ),
                            )
                          }
                        >
                          {tr("请 AI 整理会议")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon={ChatCircleDots}
                      title={tr("选一场会议，加入讨论。")}
                    >
                      {tr("会议记录会一直保存在项目中。")}
                    </Empty>
                  )}
                </section>
                <section className="decision-panel">
                  <h2>{tr("讨论留下的结果")}</h2>
                  <p className="muted">{tr("AI 可以提议，由人确认。")}</p>
                  {data.decisions
                    .filter(
                      (d: Item) => !meetingId || d.meeting_id === meetingId,
                    )
                    .map((d: Item) => (
                      <article className="decision" key={d.id}>
                        <Badge status={d.status} />
                        <p>{d.body}</p>
                        <small>
                          {tr("{name} 提出", { name: d.actor_name })}
                        </small>
                        {d.status === "proposed" &&
                          (isOwner ||
                            selectedMeeting?.creator_id === user?.id ||
                            demo) && (
                            <div>
                              <button
                                className="button small"
                                disabled={busy}
                                onClick={() =>
                                  void action(
                                    () =>
                                      api(
                                        `${endpoint}/decisions/${d.id}`,
                                        "PATCH",
                                        { status: "confirmed" },
                                      ),
                                    tr("方案已确认"),
                                  )
                                }
                              >
                                <Check size={14} />
                                {tr("确认")}
                              </button>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  void action(() =>
                                    api(
                                      `${endpoint}/decisions/${d.id}`,
                                      "PATCH",
                                      { status: "rejected" },
                                    ),
                                  )
                                }
                              >
                                {tr("不采用")}
                              </button>
                            </div>
                          )}
                      </article>
                    ))}
                  {data.decisions.filter(
                    (d: Item) => !meetingId || d.meeting_id === meetingId,
                  ).length === 0 && (
                    <p className="muted no-decisions">
                      {tr("讨论中的决定和分歧，可以记录在这里。")}
                    </p>
                  )}
                </section>
              </div>
            )}
            {tab === "files" && (
              <section className="files-panel">
                <div className="files-toolbar">
                  <h2>
                    {tr("项目资料")}
                    <span>{data.files.length}</span>
                  </h2>
                  <label className="search">
                    <MagnifyingGlass size={17} />
                    <input
                      aria-label={tr("搜索文件")}
                      placeholder={tr("查找文件…")}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {data.files.length ? (
                  <div className="file-table">
                    <div className="file-row table-head">
                      <span>{tr("文件名")}</span>
                      <span>{tr("可见范围")}</span>
                      <span>{tr("版本")}</span>
                      <span>{tr("大小")}</span>
                      <span>{tr("最近更新")}</span>
                    </div>
                    {data.files
                      .filter((f: Item) =>
                        f.path.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((f: Item) => (
                        <button
                          className="file-row"
                          key={f.id}
                          onClick={() => void openFile(f)}
                        >
                          <span>
                            <FileText size={22} />
                            <b>{f.path}</b>
                          </span>
                          <span>
                            {f.visibility === "private" ? (
                              <>
                                <LockSimple size={14} />
                                {tr("仅自己与自己的 AI")}
                              </>
                            ) : (
                              <>
                                <Globe size={14} />
                                {tr("项目共享")}
                              </>
                            )}
                          </span>
                          <span className="file-version">v{f.version}</span>
                          <span>
                            {f.size < 1024
                              ? `${f.size} B`
                              : `${(f.size / 1024).toFixed(1)} KB`}
                          </span>
                          <span>
                            {new Date(f.updated_at).toLocaleDateString(
                              getLocale(),
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <Empty
                    icon={FolderOpen}
                    title={tr("把共同工作的背景，放在这里。")}
                  >
                    {tr(
                      "上传项目资料，或创建第一份需求文档。AI 只能读取获准访问的文件。",
                    )}
                  </Empty>
                )}
                <footer className="file-note">
                  <Info size={16} />
                  {tr("每次修改保存为新版本。发生冲突时，需要先读取最新内容。")}
                </footer>
              </section>
            )}
            {tab === "tasks" && (
              <div className="kanban">
                {["proposed", "todo", "in_progress", "review", "done"].map(
                  (status) => (
                    <section className="kanban-column" key={status}>
                      <h2>
                        <span className={`column-dot ${status}`} />
                        {tr(statusLabels[status])}
                        <span>
                          {
                            data.tasks.filter((t: Item) => t.status === status)
                              .length
                          }
                        </span>
                      </h2>
                      {data.tasks
                        .filter((t: Item) => t.status === status)
                        .map((task: Item) => (
                          <article className="task-card" key={task.id}>
                            <h3>{task.title}</h3>
                            <p>{task.description}</p>
                            {task.meeting_id && (
                              <button
                                className="task-meeting"
                                onClick={() => enterMeeting(task.meeting_id)}
                              >
                                <ChatCircleDots size={13} />
                                {tr("来自项目会议")}
                              </button>
                            )}
                            <footer>
                              <span>
                                {data.agents.find(
                                  (a: Item) => a.id === task.assignee_id,
                                )?.name ?? tr("待分配")}
                              </span>
                              <select
                                aria-label={tr("更新任务 {value0} 状态", {
                                  value0: task.title,
                                })}
                                disabled={busy}
                                value={task.status}
                                onChange={(e) =>
                                  void action(() =>
                                    api(
                                      `${endpoint}/tasks/${task.id}`,
                                      "PATCH",
                                      { status: e.target.value },
                                    ),
                                  )
                                }
                              >
                                {status === "proposed" && (
                                  <option value="proposed">
                                    {tr("待确认")}
                                  </option>
                                )}
                                {["todo", "in_progress", "review", "done"].map(
                                  (s) => (
                                    <option key={s} value={s}>
                                      {tr(statusLabels[s])}
                                    </option>
                                  ),
                                )}
                              </select>
                            </footer>
                            <label className="task-assign">
                              <span className="sr-only">
                                {tr("分配任务")}
                                {task.title}
                              </span>
                              <select
                                aria-label={tr("分配任务 {value0}", {
                                  value0: task.title,
                                })}
                                disabled={busy || task.status === "proposed"}
                                value={task.assignee_id ?? ""}
                                onChange={(e) =>
                                  void action(() =>
                                    api(
                                      `${endpoint}/tasks/${task.id}`,
                                      "PATCH",
                                      {
                                        status: task.status,
                                        assigneeId: e.target.value || null,
                                      },
                                    ),
                                  )
                                }
                              >
                                <option value="">{tr("分配给 AI…")}</option>
                                {data.agents.map((a: Item) => (
                                  <option value={a.id} key={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </article>
                        ))}
                      {data.tasks.filter((t: Item) => t.status === status)
                        .length === 0 && (
                        <div className="column-empty">{tr("暂时没有任务")}</div>
                      )}
                    </section>
                  ),
                )}
              </div>
            )}
            {tab === "team" && (
              <div className="team-page">
                <section>
                  <h2>
                    {tr("项目成员")}
                    <span>{data.members.length}</span>
                  </h2>
                  <div className="people-grid">
                    {data.members.map((m: Item, i: number) => (
                      <article className="person-card" key={m.id}>
                        <Avatar index={[0, 2, 4][i % 3]} />
                        <h3>{m.name}</h3>
                        <p>@{m.username}</p>
                        <span className="role">
                          {m.role === "owner"
                            ? tr("空间创建者")
                            : tr("项目伙伴")}
                        </span>
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <div className="section-header">
                    <h2>
                      {tr("接入的 AI")}
                      <span>{data.agents.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setModal("help")}
                    >
                      {tr("接入说明")}
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="people-grid">
                    {data.agents.map((a: Item, i: number) => (
                      <article className="person-card agent-card" key={a.id}>
                        <Avatar index={[1, 3, 5][i % 3]} />
                        <Badge
                          status={
                            demo
                              ? a.status
                              : agentOnline(a)
                                ? a.status
                                : "offline"
                          }
                        />
                        <h3>{a.name}</h3>
                        <p>
                          {a.model} ·{" "}
                          {tr("{name} 的 AI", { name: a.owner_name })}
                        </p>
                        <small>
                          {a.last_seen
                            ? tr("最近连接 {value0}", {
                                value0: time(a.last_seen),
                              })
                            : tr("等待客户端连接")}
                        </small>
                        {a.owner_id === user?.id && (
                          <button
                            className="text-button danger"
                            onClick={() => {
                              setSelectedMember(a);
                              setModal("revoke");
                            }}
                          >
                            {tr("撤销接入凭证")}
                          </button>
                        )}
                      </article>
                    ))}
                    <button
                      className="connect-card"
                      onClick={() => setModal("agent")}
                    >
                      <Plus size={26} />
                      <h3>{tr("带上你的 AI")}</h3>
                      <p>{tr("创建身份，连接你自己的工具。")}</p>
                    </button>
                  </div>
                </section>
              </div>
            )}
            {tab === "office" && (
              <section className="lounge">
                <div className="section-header">
                  <h2>
                    <ChatCircleDots size={18} />
                    {tr("公共留言板")}
                  </h2>
                  <span className="muted">
                    {tr("人和接入的 AI 都可以发言")}
                  </span>
                </div>
                {messages.length > 0 && (
                  <Chat messages={messages.slice(-5)} agents={data.agents} />
                )}
                <MessageForm
                  disabled={busy}
                  placeholder={tr("留下一条消息，让伙伴们知道你的想法…")}
                  send={(body) =>
                    action(async () => {
                      await api(`${endpoint}/messages`, "POST", { body });
                      setMessages(await api(`${endpoint}/messages`));
                    })
                  }
                />
              </section>
            )}
            <footer className="page-footer">
              <span>
                conest <span className="footer-separator">/</span>{" "}
                {tr("made for working together")}
              </span>
              <a
                href="https://github.com/DuoChen-317/conest"
                target="_blank"
                rel="noreferrer"
              >
                {tr("Open source")}
                <ArrowUpRight size={12} />
              </a>
            </footer>
          </main>
        )}
      </div>
      {modal && (
        <Modal
          title={
            {
              project: tr("开始一个新项目"),
              join: tr("加入伙伴的项目"),
              meeting: tr("把大家叫到一起"),
              agent: tr("带上你的 AI"),
              help: tr("让自己的 AI 接入 CoNest"),
              invite: tr("邀请伙伴加入"),
              file: file ? tr("项目文件") : tr("新建项目文档"),
              task: tr("明确下一步"),
              decision: tr("记录讨论结果"),
              resident: tr("你的 AI 伙伴"),
              revoke: tr("撤销 AI 接入凭证"),
              endMeeting: tr("结束这场会议"),
            }[modal] ?? "CoNest"
          }
          close={close}
          wide={modal === "file" || modal === "help" || !!credential}
        >
          {modal === "project" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                void action(async () => {
                  const p = await api("/projects", "POST", values);
                  await loadProjects();
                  setProjectId(p.id);
                  setTab("office");
                  close();
                }, tr("项目已创建"));
              }}
            >
              <p className="modal-intro">
                {tr("先定下共同要做的事，再邀请伙伴和 AI。")}
              </p>
              <label>
                {tr("项目名称")}
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder={tr("例如：一起搭建我们的新产品")}
                />
              </label>
              <label>
                {tr("项目说明")}
                <textarea
                  name="description"
                  maxLength={4000}
                  rows={3}
                  placeholder={tr("我们想完成什么？")}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {tr("创建项目")}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {modal === "join" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = String(
                  new FormData(e.currentTarget).get("token"),
                );
                let token = input;
                try {
                  token = new URL(input).searchParams.get("invite") ?? input;
                } catch {}
                void action(async () => {
                  const r = await api("/invites/accept", "POST", { token });
                  await loadProjects();
                  setProjectId(r.projectId);
                  close();
                });
              }}
            >
              <label>
                {tr("邀请链接或邀请码")}
                <input
                  name="token"
                  required
                  placeholder={tr("粘贴伙伴发来的链接")}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {tr("加入项目")}
              </button>
            </form>
          )}
          {modal === "meeting" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action(async () => {
                  const m = await api(`${endpoint}/meetings`, "POST", {
                    title: form.get("title"),
                    agenda: form.get("agenda"),
                    maxTurns: Number(form.get("maxTurns")),
                    agentIds: form.getAll("agentIds"),
                  });
                  close();
                  enterMeeting(m.id);
                }, tr("会议已开始，受邀 AI 可通过客户端读取消息"));
              }}
            >
              <p className="modal-intro">
                {tr("项目成员都能参与。选择需要带上背景一起讨论的 AI。")}
              </p>
              <label>
                {tr("会议主题")}
                <input
                  name="title"
                  required
                  maxLength={160}
                  placeholder={tr("这次一起决定什么？")}
                />
              </label>
              <label>
                {tr("议题与背景")}
                <textarea
                  name="agenda"
                  rows={3}
                  maxLength={12000}
                  placeholder={tr("目标、需要讨论的问题，以及相关资料路径")}
                />
              </label>
              <fieldset>
                <legend>{tr("邀请 AI")}</legend>
                {data?.agents.length ? (
                  data.agents.map((a: Item) => (
                    <label className="check-label" key={a.id}>
                      <input
                        type="checkbox"
                        name="agentIds"
                        value={a.id}
                        defaultChecked
                      />
                      <span>
                        {a.name}
                        <small>
                          {tr("{owner} 的 {name}", {
                            owner: a.owner_name,
                            name: a.model,
                          })}
                        </small>
                      </span>
                      <Badge
                        status={demo || agentOnline(a) ? a.status : "offline"}
                      />
                    </label>
                  ))
                ) : (
                  <p className="muted">
                    {tr("还没有接入 AI，你们也可以先开会。")}
                  </p>
                )}
              </fieldset>
              <label>
                {tr("每个 AI 的发言上限")}
                <input
                  name="maxTurns"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={12}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {tr("开始会议")}
                <ChatCircleDots size={18} />
              </button>
            </form>
          )}
          {modal === "agent" &&
            (credential ? (
              <Credential credential={credential} />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  void action(async () => {
                    setCredential(
                      await api(`${endpoint}/agents`, "POST", values),
                    );
                  });
                }}
              >
                <p className="modal-intro">
                  {tr(
                    "CoNest 为它提供身份和协作工具。模型和私人上下文仍由你自己的客户端管理。",
                  )}
                </p>
                <label>
                  {tr("AI 的名字")}
                  <input
                    name="name"
                    required
                    maxLength={80}
                    placeholder={tr("例如：Atlas")}
                  />
                </label>
                <label>
                  {tr("模型或工具")}
                  <input
                    name="model"
                    required
                    maxLength={120}
                    placeholder={tr("例如：Claude / GPT / 自己的 Agent")}
                  />
                </label>
                <button className="button primary full" disabled={busy}>
                  {tr("生成接入凭证")}
                  <ArrowRight size={17} />
                </button>
              </form>
            ))}
          {modal === "help" && (
            <div className="help-content">
              <p>
                {tr(
                  "在“伙伴与 AI”里创建 AI 身份后，把专属凭证配置到你自己的 AI 工具中。",
                )}
              </p>
              <h3>{tr("MCP 接入")}</h3>
              <p>
                {tr(
                  "在支持远程 MCP 和 Bearer 凭证的客户端里，配置下面的服务地址。具体配置字段随客户端不同。",
                )}
              </p>
              <pre>{`${location.origin}/mcp`}</pre>
              <h3>{tr("普通 HTTP API")}</h3>
              <p>
                {tr(
                  "也可以用自己的程序调用项目 API。每个 AI 只能访问凭证对应的项目，以及其所属用户获准共享的资料。",
                )}
              </p>
              <pre>
                {tr(
                  "Authorization: Bearer <你的 AI 凭证>\nGET /api/projects/<项目 ID>\nGET /api/projects/<项目 ID>/events?after=0&wait=20",
                )}
              </pre>
              <h3>{tr("持续参与会议")}</h3>
              <p>
                {tr(
                  "外部客户端需要保持运行，读取新消息并触发自己的 AI。连接接口不会自动启动模型。仓库里的 examples/agent.ts 提供事件监听入口。",
                )}
              </p>
              <a
                className="button"
                href="https://github.com/DuoChen-317/conest/blob/main/docs/agent-integration.md"
                target="_blank"
                rel="noreferrer"
              >
                {tr("查看完整接入文档")}
                <ArrowUpRight size={16} />
              </a>
            </div>
          )}
          {modal === "invite" && credential && (
            <div>
              <p>
                {tr(
                  "把链接发给伙伴。对方登录后即可加入这个项目。链接 24 小时内有效，最多加入 20 人。",
                )}
              </p>
              <CopyBox value={credential.invite} />
            </div>
          )}
          {modal === "file" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api(`${endpoint}/files`, "POST", {
                    path: filePath,
                    content: fileText,
                    mime: file?.mime ?? "text/markdown",
                    baseVersion: file?.version ?? 0,
                    visibility: filePrivate ? "private" : "shared",
                  });
                  close();
                }, tr("文件新版本已保存"));
              }}
            >
              <div className="file-editor-toolbar">
                <label>
                  {tr("文件路径")}
                  <input
                    required
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    readOnly={!!file}
                    maxLength={240}
                    placeholder="docs/project-brief.md"
                  />
                </label>
                {file && (
                  <>
                    <a
                      className="button small"
                      href={`/api${endpoint}/files/${file.id}?version=${file.version}&download=1`}
                    >
                      <DownloadSimple size={16} />
                      {tr("下载 v")}
                      {file.version}
                    </a>
                    <label>
                      {tr("查看版本")}
                      <select
                        aria-label={tr("查看文件版本")}
                        value={file.version}
                        onChange={(e) =>
                          void openFile(file, Number(e.target.value))
                        }
                      >
                        {file.versions?.map((v: Item) => (
                          <option value={v.version} key={v.version}>
                            v{v.version} · {v.actor_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
              {!file || fileEditable ? (
                <label>
                  {tr("文档内容")}
                  <textarea
                    className="code-editor"
                    rows={15}
                    value={fileText}
                    onChange={(e) => setFileText(e.target.value)}
                    spellCheck={false}
                  />
                </label>
              ) : (
                <div className="binary-preview">
                  <FileText size={32} />
                  <p>
                    {tr(
                      "此文件适合下载查看。编辑上传的文本文件支持 500 KB 以内。",
                    )}
                  </p>
                </div>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={filePrivate}
                  disabled={!!file && file.owner_id !== user?.id}
                  onChange={(e) => setFilePrivate(e.target.checked)}
                />
                {tr("仅我与我的 AI 可见")}
              </label>
              <div className="modal-footer">
                <p className="muted">
                  {tr("保存时检查版本，避免覆盖他人的更新。")}
                </p>
                <button
                  className="button primary"
                  disabled={busy || (!!file && !fileEditable)}
                >
                  {file ? tr("保存新版本") : tr("保存文档")}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )}
          {modal === "task" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action(async () => {
                  await api(`${endpoint}/tasks`, "POST", {
                    title: form.get("title"),
                    description: form.get("description"),
                    assigneeId: form.get("assigneeId") || null,
                    ...(meetingId ? { meetingId } : {}),
                  });
                  close();
                }, tr("任务已创建"));
              }}
            >
              <label>
                {tr("任务名称")}
                <input
                  name="title"
                  required
                  maxLength={200}
                  placeholder={tr("接下来要完成什么？")}
                />
              </label>
              <label>
                {tr("说明与验收要求")}
                <textarea name="description" rows={4} maxLength={12000} />
              </label>
              <label>
                {tr("负责的 AI")}
                <select name="assigneeId">
                  <option value="">{tr("稍后分配")}</option>
                  {data?.agents.map((a: Item) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.owner_name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button primary full" disabled={busy}>
                {tr("创建任务")}
                <Plus size={16} />
              </button>
            </form>
          )}
          {modal === "decision" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void action(async () => {
                  await api(`${endpoint}/decisions`, "POST", {
                    body: form.get("body"),
                    ...(meetingId ? { meetingId } : {}),
                  });
                  close();
                }, tr("已保存待确认方案"));
              }}
            >
              <label>
                {tr("方案、共识或需要保留的分歧")}
                <textarea
                  name="body"
                  required
                  maxLength={12000}
                  rows={7}
                  placeholder={tr(
                    "把讨论中重要的结果记录下来，确认后成为项目依据。",
                  )}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {tr("保存为待确认方案")}
              </button>
            </form>
          )}
          {modal === "resident" && selectedMember && (
            <div className="resident-detail">
              <Avatar
                index={
                  [1, 3, 5][
                    Math.max(
                      0,
                      data?.agents.findIndex(
                        (a: Item) => a.id === selectedMember.id,
                      ) ?? 0,
                    ) % 3
                  ]
                }
              />
              <h3>{selectedMember.name}</h3>
              <p>
                {tr("{owner} 的 {name}", {
                  owner: selectedMember.owner_name,
                  name: selectedMember.model,
                })}
              </p>
              <Badge
                status={
                  demo || agentOnline(selectedMember)
                    ? selectedMember.status
                    : "offline"
                }
              />
              <p className="muted">
                {selectedMember.last_seen
                  ? tr("最近连接：{value0}", {
                      value0: new Date(selectedMember.last_seen).toLocaleString(
                        getLocale(),
                      ),
                    })
                  : tr(
                      "尚未收到客户端连接。配置好 MCP 或 API 后，它就可以参与项目。",
                    )}
              </p>
              <button
                className="button"
                onClick={() => {
                  close();
                  setTab("team");
                }}
              >
                {tr("查看伙伴与 AI")}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {modal === "revoke" && selectedMember && (
            <div>
              <p>
                {tr(
                  "撤销后，{name} 的现有凭证将立即失效。历史发言和提交的成果会保留。",
                  { name: selectedMember.name },
                )}
              </p>
              <button
                className="button destructive full"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api(
                      `${endpoint}/agents/${selectedMember.id}`,
                      "DELETE",
                    );
                    close();
                  }, tr("AI 凭证已撤销"))
                }
              >
                {tr("撤销凭证")}
              </button>
            </div>
          )}
          {modal === "endMeeting" && (
            <div>
              <p>
                {tr(
                  "结束后将停止接收本场会议的新发言。讨论记录、方案与关联任务都会保留。",
                )}
              </p>
              <button
                className="button primary full"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api(`${endpoint}/meetings/${meetingId}`, "PATCH", {
                      status: "ended",
                    });
                    close();
                  }, tr("会议已结束"))
                }
              >
                {tr("结束会议")}
              </button>
            </div>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={19} />
          {toast}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert">
          <span>{localizeError(error)}</span>
          <button onClick={() => setError("")} aria-label={tr("关闭错误")}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
function MessageForm({
  send,
  disabled,
  placeholder,
}: {
  send: (body: string) => Promise<any>;
  disabled: boolean;
  placeholder: string;
}) {
  const [body, setBody] = useState(""),
    [sending, setSending] = useState(false);
  return (
    <form
      className="message-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setSending(true);
        try {
          const sent = await send(body);
          if (sent !== false) setBody("");
        } finally {
          setSending(false);
        }
      }}
    >
      <label className="sr-only" htmlFor="message-body">
        {tr("消息内容")}
      </label>
      <textarea
        id="message-body"
        rows={2}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={12000}
        disabled={disabled || sending}
      />
      <button
        className="send-button"
        aria-label={tr("发送消息")}
        disabled={disabled || sending || !body.trim()}
      >
        <PaperPlaneTilt size={19} weight="fill" />
      </button>
    </form>
  );
}
function Chat({ messages, agents }: { messages: Item[]; agents: Item[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages.length]);
  return (
    <div className="chat-log" role="log" aria-label={tr("讨论消息")}>
      {messages.length ? (
        messages.map((m) => (
          <article className={`chat-message ${m.actor_type}`} key={m.id}>
            <Avatar
              index={
                m.actor_type === "human"
                  ? 0
                  : [1, 3, 5][
                      Math.max(
                        0,
                        agents.findIndex((a) => a.id === m.actor_id),
                      ) % 3
                    ]
              }
              small
            />
            <div>
              <header>
                <b>{m.actor_name}</b>
                {m.actor_type === "agent" && (
                  <span className="ai-label">
                    AI ·{" "}
                    {agents.find((a) => a.id === m.actor_id)?.owner_name ??
                      tr("伙伴")}
                  </span>
                )}
                <time>{time(m.created_at)}</time>
              </header>
              <p>{m.body}</p>
            </div>
          </article>
        ))
      ) : (
        <p className="chat-empty">{tr("议题已经准备好，分享第一个想法吧。")}</p>
      )}
      <div ref={end} />
    </div>
  );
}
function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  return (
    <div className="copy-box">
      <pre tabIndex={0}>{value}</pre>
      <button
        className="icon-button"
        aria-label={tr("复制")}
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => setError(true));
        }}
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
      </button>
      {error && (
        <small role="status">{tr("无法自动复制，请选中文本手动复制。")}</small>
      )}
    </div>
  );
}
function Credential({ credential }: { credential: Item }) {
  return (
    <div className="credential">
      <div className="success-note">
        <CheckCircle size={22} />
        <div>
          <b>{tr("{name} 的身份已创建", { name: credential.name })}</b>
          <p>{tr("凭证仅展示这一次。请保存到你的客户端配置中。")}</p>
        </div>
      </div>
      <label>
        {tr("AI 专属凭证")}
        <CopyBox value={credential.token} />
      </label>
      <label>
        {tr("远程 MCP 配置示例")}
        <CopyBox
          value={JSON.stringify(
            {
              mcpServers: {
                conest: {
                  url: `${location.origin}/mcp`,
                  headers: { Authorization: `Bearer ${credential.token}` },
                },
              },
            },
            null,
            2,
          )}
        />
      </label>
      <p className="muted">
        {tr(
          "这是通用示例，客户端的配置字段可能不同。保持客户端运行，AI 才能持续参与会议。",
        )}
      </p>
      <label>
        {tr("项目 ID")}
        <CopyBox value={credential.projectId} />
      </label>
    </div>
  );
}
