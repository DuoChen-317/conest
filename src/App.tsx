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
  Robot,
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
  Bell,
} from "@phosphor-icons/react";
import {
  AgentPreferences,
  DirectConversation,
  InvitationInbox,
  InvitationRecipients,
  MeetingParticipants,
  requestLabels,
} from "./CollaborationUI";
import { api, createDemoData, decodeText, time, type Item } from "./api";
import HouseWorld, { SceneSprite } from "./HouseWorld";
import CopyBox from "./CopyBox";
import ConnectorSetup from "./ConnectorSetup";
import FilesBrowser from "./FilesBrowser";
import GitPanel from "./GitPanel";
import OfficeWorkspace from "./OfficeWorkspace";
import MessageForm from "./MessageForm";
import ChatHistory from "./ChatHistory";
import ChatTimeline, { MessageActions } from "./ChatTimeline";
import type { ChatScope } from "./chat-timeline";
import { pathInDirectory } from "./file-browser";
import type { Room } from "./house";
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
  "meeting.invited": "发送了会议邀请",
  "meeting.responded": "回应了会议邀请",
  "meeting.ready": "允许 AI 参会",
  "message.created": "发送了消息",
  "decision.proposed": "提出了方案",
  "decision.reviewed": "确认了讨论结果",
  "task.created": "创建了任务",
  "task.updated": "更新了进展",
  "file.updated": "提交了文件",
  "presence.changed": "更新了所在房间",
  "office.message": "在办公室发送了消息",
  "direct.updated": "更新了 AI 对话",
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
  size = small ? 34 : 48,
}: {
  index?: number;
  small?: boolean;
  size?: number;
}) {
  const i = ((index % 6) + 6) % 6;
  return (
    <span
      aria-hidden="true"
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: "none", width: size, height: size }}
    >
      <SceneSprite robot={i % 2 === 1} skin={Math.floor(i / 2)} size={size} />
    </span>
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
          src="/assets/shared-house.png"
          alt={tr("俯视像素办公楼，包含工作室、会议室、资料室和接待区")}
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
  const [ownWorking, setOwnWorking] = useState(false);
  const [chatScope, setChatScope] = useState<"office" | "lounge">("office");
  const [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState<Item | null>(null),
    [file, setFile] = useState<Item | null>(null);
  const [fileText, setFileText] = useState(""),
    [filePath, setFilePath] = useState(""),
    [filePrivate, setFilePrivate] = useState(false),
    [fileEditable, setFileEditable] = useState(true);
  const [fileDirectory, setFileDirectory] = useState("");
  useEffect(() => setFileDirectory(""), [projectId, user?.id, demo]);
  const [invite] = useState(new URLSearchParams(location.search).get("invite"));
  const [selectedMember, setSelectedMember] = useState<Item | null>(null);
  const [notifications, setNotifications] = useState<Item[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Item | null>(
    null,
  );
  const [mentionAgentId, setMentionAgentId] = useState("");
  const notify = (message: string) => setToast(message);
  const close = useCallback(() => {
    setModal(null);
    setCredential(null);
    setSelectedMember(null);
    setSelectedConversation(null);
  }, []);
  useEffect(() => {
    // A different person must never inherit the previous person's meeting or chat.
    setTab("office");
    setMeetingId(null);
    setMessages([]);
    setChatScope("office");
    setMentionAgentId("");
    setOwnWorking(false);
    close();
  }, [user?.id, demo, close]);
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
  const loadNotifications = useCallback(async () => {
    if (user && !demo) setNotifications(await api<Item[]>("/notifications"));
  }, [user, demo]);
  useEffect(() => {
    setNotifications([]);
    if (!user || demo) return;
    let stopped = false;
    const run = () =>
      api<Item[]>("/notifications")
        .then((items) => {
          if (!stopped) setNotifications(items);
        })
        .catch(() => {});
    void run();
    const timer = setInterval(run, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [user, demo]);
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
        `/projects/${projectId}/${meetingId ? `messages?meetingId=${meetingId}` : chatScope === "office" ? "office/messages" : "messages"}`,
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
  }, [projectId, meetingId, demo, locale, chatScope]);
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
  const meetingInvitations = (data?.meetingInvitations ?? []).filter(
    (i: Item) => i.meeting_id === meetingId,
  );
  const approvedMeetingAgents = (data?.agents ?? []).filter((a: Item) =>
    meetingInvitations.some(
      (i: Item) =>
        i.actor_type === "agent" &&
        i.actor_id === a.id &&
        i.status === "accepted",
    ),
  );
  const unreadInvitations = notifications.filter((i) => !i.seen_at).length;
  const invitationReminder = notifications.find(
    (i) =>
      !i.seen_at &&
      !i.deferred_at &&
      i.status === "pending" &&
      i.meeting_status !== "ended",
  );
  const isOwner = data?.project.owner_id === user?.id;
  useEffect(() => {
    setMentionAgentId("");
  }, [projectId, meetingId]);
  const locationRoom: Room =
    tab === "files"
      ? "library"
      : tab === "meetings" &&
          meetingId &&
          selectedMeeting &&
          selectedMeeting.status !== "ended"
        ? "meeting"
        : tab === "office" && chatScope === "lounge"
          ? "commons"
          : "office";
  useEffect(() => {
    if (demo || !user?.id || !projectId) return;
    const actorId = user.id;
    let stopped = false;
    const update = () => {
      if (document.visibilityState === "hidden") return;
      void api(`/projects/${projectId}/presence`, "PUT", {
        room: locationRoom,
        ...(locationRoom === "meeting" ? { meetingId } : {}),
      })
        .then((record) => {
          if (!stopped)
            setData((previous) =>
              previous?.project.id === projectId
                ? {
                    ...previous,
                    presence: [
                      ...(previous.presence ?? []).filter(
                        (p: Item) =>
                          !(p.actor_id === actorId && p.actor_type === "human"),
                      ),
                      record,
                    ],
                  }
                : previous,
            );
        })
        .catch(() => {});
    };
    update();
    const timer = setInterval(update, 20000);
    document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [
    locationRoom,
    projectId,
    meetingId,
    selectedMeeting?.status,
    demo,
    user?.id,
    data?.project.id,
  ]);

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
          path: pathInDirectory(fileDirectory, uploaded.name),
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
  const respondInvitation = async (
    invitation: Item,
    response: "accept" | "decline" | "later" | "seen",
  ) => {
    return action(
      async () => {
        await api(`/notifications/${invitation.id}`, "PATCH", {
          action: response,
        });
        await loadNotifications();
      },
      response === "accept"
        ? tr("已接受邀请，可进入会议。")
        : response === "decline"
          ? invitation.actor_type === "agent" &&
            invitation.status === "accepted"
            ? tr("已撤回 AI 参会授权")
            : tr("已拒绝邀请")
          : undefined,
    );
  };
  const openInvitedMeeting = (invitation: Item) => {
    void action(
      async () => {
        await api(`/notifications/${invitation.id}`, "PATCH", {
          action: "seen",
        });
        if (invitation.meeting_status !== "ended")
          await api(
            `/projects/${invitation.project_id}/meetings/${invitation.meeting_id}/join`,
            "POST",
            {},
          );
        if (projectId !== invitation.project_id) setData(null);
        setProjectId(invitation.project_id);
        enterMeeting(invitation.meeting_id);
        close();
        await loadNotifications();
      },
      undefined,
      true,
    );
  };
  const startDirectConversation = (agent: Item) => {
    void action(async () => {
      const conversation = await api(`${endpoint}/conversations`, "POST", {
        agentId: agent.id,
      });
      setSelectedConversation(conversation);
      setModal("directConversation");
    });
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
                setFileDirectory("");
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
            {!demo && user && data && (
              <button
                className="notification-button"
                aria-label={tr("AI 对话")}
                onClick={() => setModal("conversations")}
              >
                <ChatCircleDots size={19} aria-hidden="true" />
                <span>{tr("AI 对话")}</span>
              </button>
            )}
            {!demo && user && (
              <button
                className="notification-button"
                aria-label={tr("会议通知，{count} 条未读", {
                  count: unreadInvitations,
                })}
                onClick={() => setModal("notifications")}
              >
                <Bell size={19} aria-hidden="true" />
                <span>{tr("通知")}</span>
                {unreadInvitations > 0 && <b>{unreadInvitations}</b>}
              </button>
            )}
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
                      close();
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
              src="/assets/shared-house.png"
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
            {invitationReminder && (
              <section className="invitation-reminder" role="status">
                <Bell size={20} aria-hidden="true" />
                <div>
                  <strong>
                    {invitationReminder.actor_type === "agent"
                      ? tr("{inviter} 邀请你的 AI {agent} 参会", {
                          inviter: invitationReminder.inviter_name,
                          agent: invitationReminder.agent_name,
                        })
                      : tr("{name} 邀请你参加会议", {
                          name: invitationReminder.inviter_name,
                        })}
                  </strong>
                  <p>
                    {invitationReminder.project_name} ·{" "}
                    {invitationReminder.title}
                  </p>
                </div>
                <button
                  className="button small"
                  onClick={() => setModal("notifications")}
                >
                  {tr("查看邀请")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void respondInvitation(invitationReminder, "later")
                  }
                >
                  {tr("稍后处理")}
                </button>
              </section>
            )}
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
                        ? tr("查看代码改动，或管理共享文档与附件。")
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
                        setFilePath(fileDirectory ? `${fileDirectory}/` : "");
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
            {["office", "meetings", "files"].includes(tab) && (
              <OfficeWorkspace
                active={tab === "office"}
                scene={
                  <HouseWorld
                    data={data}
                    ownId={demo ? "demo-human" : user!.id}
                    demo={demo}
                    ownWorking={ownWorking}
                    recentMessages={messages}
                    compact={tab !== "office"}
                  />
                }
              >
                {tab === "office" && (
                  <section className="office-conversation">
                    <div className="office-conversation-heading">
                      <LockSimple size={19} />
                      <div>
                        <h2>
                          {tr(chatScope === "office" ? "我的办公室" : "接待区")}
                        </h2>
                        <p>
                          {tr(
                            chatScope === "office"
                              ? "仅你和自己的 AI 可见"
                              : "项目成员和接入的 AI 均可见",
                          )}
                        </p>
                      </div>
                    </div>
                    <div
                      className="office-chat-tabs"
                      role="group"
                      aria-label={tr("对话范围")}
                    >
                      <button
                        className={chatScope === "office" ? "selected" : ""}
                        onClick={() => setChatScope("office")}
                      >
                        {tr("办公室对话")}
                      </button>
                      <button
                        className={chatScope === "lounge" ? "selected" : ""}
                        onClick={() => setChatScope("lounge")}
                      >
                        {tr("公共留言板")}
                      </button>
                    </div>
                    {!demo && (
                      <ChatHistory
                        projectId={projectId}
                        scope={{ kind: chatScope }}
                      />
                    )}
                    {messages.length ? (
                      <Chat
                        currentUserId={user?.id}
                        messages={messages}
                        agents={data.agents}
                        projectId={demo ? undefined : projectId}
                        scope={{ kind: chatScope }}
                      />
                    ) : (
                      <div className="office-chat-empty">
                        <SceneSprite robot size={60} />
                        <h3>{tr("从自己的工位开始")}</h3>
                        <p>
                          {tr(
                            chatScope === "office"
                              ? "和自己的 AI 沟通工作，需要一起讨论时再前往会议室。"
                              : "在接待区向项目伙伴分享想法。",
                          )}
                        </p>
                      </div>
                    )}
                    <MessageForm
                      onDraftChange={setOwnWorking}
                      disabled={busy}
                      placeholder={tr(
                        chatScope === "office"
                          ? "和自己的 AI 说点什么…"
                          : "留下一条消息，让伙伴们知道你的想法…",
                      )}
                      send={(body) =>
                        action(async () => {
                          const path =
                            chatScope === "office"
                              ? `${endpoint}/office/messages`
                              : `${endpoint}/messages`;
                          await api(path, "POST", { body });
                          setMessages(await api(path));
                        })
                      }
                    />
                    <p className="office-client-note">
                      <PlugsConnected size={13} />
                      {tr("AI 客户端在线时才能读取并回复消息。")}
                    </p>
                  </section>
                )}
              </OfficeWorkspace>
            )}
            {tab === "office" && (
              <div className="office-layout">
                <div className="office-main">
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
                          <Avatar index={[0, 2, 4][i]} size={40} />
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
                          <Avatar index={[1, 3, 5][i]} size={40} />
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
                                onClick={() => setModal("meetingInvite")}
                              >
                                <Plus size={15} />
                                {tr("追加邀请")}
                              </button>
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
                      <MeetingParticipants
                        invitations={meetingInvitations}
                        presence={data.presence ?? []}
                        ended={selectedMeeting.status === "ended"}
                      />
                      {!demo && (
                        <ChatHistory
                          projectId={projectId}
                          scope={{
                            kind: "meeting",
                            meetingId: meetingId ?? undefined,
                          }}
                        />
                      )}
                      <Chat
                        projectId={demo ? undefined : projectId}
                        scope={{
                          kind: "meeting",
                          meetingId: meetingId ?? undefined,
                        }}
                        messages={messages}
                        agents={data.agents}
                        currentUserId={user?.id}
                        ended={selectedMeeting.status === "ended"}
                        busy={busy || selectedMeeting.status !== "active"}
                        retry={(requestId) =>
                          action(async () => {
                            await api(
                              `${endpoint}/agent-requests/${requestId}/retry`,
                              "POST",
                              {},
                            );
                            setMessages(
                              await api(
                                `${endpoint}/messages?meetingId=${meetingId}`,
                              ),
                            );
                          })
                        }
                      />
                      <label className="meeting-mention">
                        {tr("定向提问（@ AI）")}
                        <select
                          value={mentionAgentId}
                          onChange={(e) => setMentionAgentId(e.target.value)}
                          disabled={busy || selectedMeeting.status !== "active"}
                        >
                          <option value="">{tr("发给会议中的所有人")}</option>
                          {approvedMeetingAgents.map((a: Item) => (
                            <option value={a.id} key={a.id}>
                              @{a.name} · {a.owner_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <MessageForm
                        onDraftChange={setOwnWorking}
                        disabled={selectedMeeting.status !== "active" || busy}
                        placeholder={
                          selectedMeeting.status === "active"
                            ? mentionAgentId
                              ? tr("向选中的 AI 提问，回答会留在会议中。")
                              : tr("分享你的想法，或选择一个 AI 定向提问…")
                            : selectedMeeting.status === "paused"
                              ? tr("会议已暂停")
                              : tr("会议已结束")
                        }
                        send={async (body) => {
                          return action(async () => {
                            await api(`${endpoint}/messages`, "POST", {
                              body,
                              meetingId,
                              recipientAgentIds: mentionAgentId
                                ? [mentionAgentId]
                                : [],
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
                          disabled={
                            selectedMeeting.status !== "active" ||
                            !approvedMeetingAgents.length ||
                            busy
                          }
                          onClick={() =>
                            void action(
                              () =>
                                api(`${endpoint}/messages`, "POST", {
                                  body: tr(
                                    "请整理本次会议：列出共识、保留分歧，并给出建议的方案与待办，交由项目成员确认。",
                                  ),
                                  meetingId,
                                  recipientAgentIds: approvedMeetingAgents.map(
                                    (a: Item) => a.id,
                                  ),
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
              <div className="project-files-area">
                <GitPanel
                  projectId={data.project.id}
                  userId={user?.id ?? "demo-human"}
                  ownerId={data.project.owner_id}
                  agents={data.agents}
                  tasks={data.tasks}
                  demo={demo}
                />
                <FilesBrowser
                  key={data.project.id}
                  files={data.files}
                  directory={fileDirectory}
                  navigate={setFileDirectory}
                  openFile={(f) => void openFile(f)}
                />
              </div>
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
                        <small>
                          {tr("{count} 个 AI 助手", {
                            count: data.agents.filter(
                              (a: Item) => a.owner_id === m.id,
                            ).length,
                          })}
                        </small>
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
                            className="text-button"
                            onClick={() => {
                              setSelectedMember(a);
                              setModal("agentPreferences");
                            }}
                          >
                            {tr("协作设置")}
                          </button>
                        )}
                        {(a.owner_id === user?.id || demo) && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelectedMember(a);
                              setModal("connectorSetup");
                            }}
                          >
                            {tr("连接 AI")}
                          </button>
                        )}
                        <button
                          className="text-button"
                          disabled={
                            busy ||
                            (!demo &&
                              a.owner_id !== user?.id &&
                              !a.allow_direct)
                          }
                          onClick={() => startDirectConversation(a)}
                        >
                          {tr("发起对话")}
                        </button>
                        {a.owner_id !== user?.id &&
                          !a.allow_direct &&
                          !demo && <small>{tr("主人尚未开放对话")}</small>}
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
              notifications: tr("会议通知"),
              meetingInvite: tr("邀请伙伴参会"),
              agentPreferences: tr("AI 协作设置"),
              connectorSetup: tr("连接 AI"),
              conversations: tr("AI 对话"),
              directConversation: tr("与 AI 对话"),
            }[modal] ?? "CoNest"
          }
          close={close}
          wide={
            modal === "file" ||
            modal === "help" ||
            modal === "connectorSetup" ||
            !!credential
          }
        >
          {modal === "connectorSetup" && selectedMember && (
            <ConnectorSetup
              key={selectedMember.id}
              projectId={projectId}
              agentId={selectedMember.id}
              agentName={selectedMember.name}
            />
          )}
          {modal === "notifications" && (
            <InvitationInbox
              invitations={notifications}
              busy={busy}
              respond={respondInvitation}
              open={openInvitedMeeting}
            />
          )}
          {modal === "directConversation" && selectedConversation && (
            <DirectConversation
              key={selectedConversation.id}
              conversation={
                (data?.conversations ?? []).find(
                  (c: Item) => c.id === selectedConversation.id,
                ) ?? selectedConversation
              }
              projectId={projectId}
              userId={user?.id}
            />
          )}
          {modal === "conversations" && (
            <div className="direct-inbox">
              <p className="modal-intro">
                {tr("查看你发起的对话，以及伙伴与你的 AI 的对话。")}
              </p>
              {(data?.conversations ?? []).map((c: Item) => (
                <button
                  className="direct-inbox-item"
                  key={c.id}
                  onClick={() => {
                    setSelectedConversation(c);
                    setModal("directConversation");
                  }}
                >
                  <ChatCircleDots size={20} aria-hidden="true" />
                  <span>
                    <strong>
                      {tr("{user} 与 {agent} 的对话", {
                        user: c.user_name,
                        agent: c.agent_name,
                      })}
                    </strong>
                    <small>{tr("{name} 的 AI", { name: c.owner_name })}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
              {!data?.conversations?.length && (
                <p>{tr("还没有对话。点击一个 AI，选择“发起对话”。")}</p>
              )}
            </div>
          )}
          {modal === "agentPreferences" && selectedMember && (
            <AgentPreferences
              key={selectedMember.id}
              agent={selectedMember}
              busy={busy}
              save={(input) =>
                action(async () => {
                  await api(
                    `${endpoint}/agents/${selectedMember.id}/preferences`,
                    "PATCH",
                    input,
                  );
                  close();
                }, tr("协作设置已保存"))
              }
            />
          )}
          {modal === "meetingInvite" && selectedMeeting && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void action(async () => {
                  await api(
                    `${endpoint}/meetings/${meetingId}/invitations`,
                    "POST",
                    {
                      memberIds: form.getAll("memberIds"),
                      agentIds: form.getAll("agentIds"),
                    },
                  );
                  close();
                }, tr("会议邀请已发送"));
              }}
            >
              <InvitationRecipients
                members={data?.members ?? []}
                agents={data?.agents ?? []}
                userId={user?.id}
                existing={meetingInvitations}
              />
              <button className="button primary full" disabled={busy}>
                {tr("发送邀请")}
              </button>
            </form>
          )}
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
                    memberIds: form.getAll("memberIds"),
                  });
                  close();
                  enterMeeting(m.id);
                }, tr("会议已创建，邀请已发送。"));
              }}
            >
              <p className="modal-intro">
                {tr(
                  "选择要通知的伙伴和 AI。其他项目成员也可以进入会议，AI 需要主人允许。",
                )}
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
              <InvitationRecipients
                members={data?.members ?? []}
                agents={data?.agents ?? []}
                userId={user?.id}
              />
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
                    "一个人可以接入多个 AI 助手，每个助手都有独立身份和工位。",
                  )}
                </p>
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
              <ConnectorSetup
                projectId={projectId}
                agents={(data?.agents ?? [])
                  .filter((agent: Item) => agent.owner_id === user?.id)
                  .map((agent: Item) => ({ id: agent.id, name: agent.name }))}
              />
              <details>
                <summary>{tr("开发者手动接入说明")}</summary>
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
                <CopyBox value={`${location.origin}/mcp`} />
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
              </details>
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
                      href={
                        demo
                          ? `data:text/plain;charset=utf-8,${encodeURIComponent(fileText)}`
                          : `/api${endpoint}/files/${file.id}?version=${file.version}&download=1`
                      }
                      download={demo ? filePath.split("/").pop() : undefined}
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
                size={96}
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
                className="button primary"
                disabled={
                  busy ||
                  (!demo &&
                    selectedMember.owner_id !== user?.id &&
                    !selectedMember.allow_direct)
                }
                onClick={() => startDirectConversation(selectedMember)}
              >
                {tr("发起对话")}
              </button>
              {selectedMember.owner_id !== user?.id &&
                !selectedMember.allow_direct &&
                !demo && <p className="muted">{tr("主人尚未开放对话")}</p>}
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
function Chat({
  messages,
  agents,
  projectId,
  scope,
  retry,
  currentUserId,
  busy,
  ended,
}: {
  projectId?: string;
  scope?: ChatScope;
  messages: Item[];
  agents: Item[];
  retry?: (requestId: string) => Promise<unknown>;
  currentUserId?: string;
  busy?: boolean;
  ended?: boolean;
}) {
  return (
    <ChatTimeline
      viewerId={currentUserId}
      projectId={projectId}
      scope={scope}
      messages={messages}
      className="chat-log"
      label={tr("讨论消息")}
    >
      {(items, update) => (
        <>
          {items.length ? (
            items.map((m) => (
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
                    <MessageActions
                      projectId={projectId}
                      scope={scope}
                      message={m}
                      update={update}
                    />
                  </header>
                  <p>
                    {m.redacted_at
                      ? tr(
                          m.redaction_reason === "expired"
                            ? "消息已按保留期限清除"
                            : "消息已撤回",
                        )
                      : m.body}
                  </p>
                  {m.ai_requests?.length > 0 && (
                    <div className="direct-message-state">
                      {m.ai_requests.map((r: Item) => (
                        <span key={r.id}>
                          @
                          {agents.find((a) => a.id === r.agentId)?.name ??
                            tr("伙伴")}{" "}
                          ·{" "}
                          {ended && r.status !== "replied"
                            ? tr("会议已结束，未回复")
                            : tr(requestLabels[r.status])}
                          {r.status === "failed" &&
                            !ended &&
                            !m.redacted_at &&
                            m.actor_id === currentUserId &&
                            retry && (
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => void retry(r.id)}
                              >
                                {tr("重试")}
                              </button>
                            )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="chat-empty">
              {tr("议题已经准备好，分享第一个想法吧。")}
            </p>
          )}
        </>
      )}
    </ChatTimeline>
  );
}
function Credential({ credential }: { credential: Item }) {
  return (
    <div className="credential">
      <div className="success-note">
        <CheckCircle size={22} />
        <div>
          <b>{tr("{name} 的身份已创建", { name: credential.name })}</b>
          <p>{tr("复制接入提示词，由客户端完成连接。")}</p>
        </div>
      </div>
      <ConnectorSetup
        projectId={credential.projectId}
        agentId={credential.id}
        agentName={credential.name}
      />
      <details>
        <summary>{tr("原始凭证与手动配置（可选）")}</summary>
        <p>{tr("凭证仅展示这一次。请保存到你的客户端配置中。")}</p>
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
      </details>
    </div>
  );
}
