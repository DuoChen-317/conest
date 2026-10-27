import {
  Bell,
  CheckCircle,
  Clock,
  Robot,
  UsersThree,
} from "@phosphor-icons/react";
import { useState, useEffect, useRef } from "react";
import { tr, getLocale, localizeError } from "./i18n";
import { api, time, type Item } from "./api";
import ChatTextarea from "./ChatTextarea";

const invitationLabels: Record<string, string> = {
  pending: "待回应",
  accepted: "已接受",
  declined: "已拒绝",
};

export function InvitationRecipients({
  members,
  agents,
  userId,
  existing = [],
}: {
  members: Item[];
  agents: Item[];
  userId?: string;
  existing?: Item[];
}) {
  const invited = new Set(existing.map((i) => `${i.actor_type}:${i.actor_id}`));
  return (
    <>
      <fieldset>
        <legend>{tr("邀请伙伴参会")}</legend>
        {members
          .filter((m) => m.id !== userId)
          .map((m) => (
            <label className="check-label" key={m.id}>
              <input
                type="checkbox"
                name="memberIds"
                value={m.id}
                disabled={invited.has(`human:${m.id}`)}
              />
              <span>
                {m.name}
                <small>
                  {invited.has(`human:${m.id}`) ? tr("已邀请") : m.username}
                </small>
              </span>
            </label>
          ))}
        {members.length < 2 && (
          <p className="muted">
            {tr("先邀请伙伴加入项目，就能给他们发送会议邀请。")}
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>{tr("邀请 AI")}</legend>
        {agents.map((a) => (
          <label className="check-label" key={a.id}>
            <input
              type="checkbox"
              name="agentIds"
              value={a.id}
              disabled={invited.has(`agent:${a.id}`)}
            />
            <span>
              {a.name}
              <small>
                {tr("{name} 的 AI", { name: a.owner_name })} ·{" "}
                {invited.has(`agent:${a.id}`)
                  ? tr("已邀请")
                  : a.owner_id === userId || a.meeting_policy === "auto"
                    ? tr("主人已允许参会")
                    : tr("需要主人确认")}
              </small>
            </span>
          </label>
        ))}
        {!agents.length && (
          <p className="muted">{tr("还没有接入 AI，你们也可以先开会。")}</p>
        )}
      </fieldset>
    </>
  );
}

export function MeetingParticipants({
  invitations,
  presence,
  ended,
}: {
  invitations: Item[];
  presence: Item[];
  ended: boolean;
}) {
  return (
    <details className="meeting-attendees" open>
      <summary>
        <UsersThree size={16} aria-hidden="true" />
        {tr("邀请与到场")} <span>{invitations.length}</span>
      </summary>
      <ul>
        {invitations.map((i) => {
          const current = presence.find(
            (p) => p.actor_id === i.actor_id && p.actor_type === i.actor_type,
          );
          const online =
            current &&
            Date.now() - new Date(current.updated_at).getTime() < 90000;
          const inMeeting =
            i.status === "accepted" &&
            !ended &&
            online &&
            current.room === "meeting" &&
            current.meeting_id === i.meeting_id;
          const label =
            i.status === "declined" && i.actor_type === "agent"
              ? tr("参会授权已撤回")
              : inMeeting
                ? tr("已加入")
                : i.joined_at
                  ? ended
                    ? tr("曾参与")
                    : tr("已离开")
                  : tr(invitationLabels[i.status] ?? "待回应");
          return (
            <li key={i.id}>
              {i.actor_type === "agent" ? (
                <Robot size={16} aria-hidden="true" />
              ) : (
                <UsersThree size={16} aria-hidden="true" />
              )}
              <span>
                {i.name}
                <small>
                  {i.actor_type === "agent" &&
                    tr("{name} 的 AI", { name: i.owner_name })}
                </small>
              </span>
              <span
                className={`invitation-status ${inMeeting ? "joined" : i.status}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function InvitationInbox({
  invitations,
  busy,
  respond,
  open,
}: {
  invitations: Item[];
  busy: boolean;
  respond: (
    i: Item,
    action: "accept" | "decline" | "later" | "seen",
  ) => Promise<unknown>;
  open: (i: Item) => void;
}) {
  const cards = useRef(new Map<string, HTMLElement>());
  const handleResponse = async (
    invitation: Item,
    action: "accept" | "decline" | "later" | "seen",
  ) => {
    await respond(invitation, action);
    requestAnimationFrame(() => cards.current.get(invitation.id)?.focus());
  };
  return (
    <div className="invitation-inbox" aria-busy={busy}>
      <p className="modal-intro">
        {tr("所有项目的会议邀请都会保存在这里，稍后处理的邀请也不会丢失。")}
      </p>
      {!invitations.length && (
        <div className="empty">
          <Bell size={28} aria-hidden="true" />
          <h3>{tr("还没有会议邀请")}</h3>
          <p>{tr("伙伴邀请你或你的 AI 时，会在这里提醒。")}</p>
        </div>
      )}
      {invitations.map((i) => (
        <article
          className={`invitation-card ${i.seen_at ? "" : "unread"}`}
          key={i.id}
          tabIndex={-1}
          aria-label={i.title}
          ref={(element) => {
            if (element) cards.current.set(i.id, element);
            else cards.current.delete(i.id);
          }}
        >
          <div className="invitation-meta">
            <span>{i.project_name}</span>
            <time dateTime={i.created_at}>
              {new Date(i.created_at).toLocaleString(getLocale())}
            </time>
          </div>
          <h3>{i.title}</h3>
          <p>
            {i.actor_type === "agent"
              ? tr("{inviter} 邀请你的 AI {agent} 参会", {
                  inviter: i.inviter_name,
                  agent: i.agent_name,
                })
              : tr("{name} 邀请你参加会议", { name: i.inviter_name })}
          </p>
          {i.agenda && <p className="invitation-agenda">{i.agenda}</p>}
          {i.meeting_status === "ended" ? (
            <>
              <p className="muted">{tr("会议已结束，可查看记录。")}</p>
              <div className="invitation-actions">
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => open(i)}
                >
                  {tr("查看会议记录")}
                </button>
                {!i.seen_at && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void handleResponse(i, "seen")}
                  >
                    {tr("标为已读")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="invitation-state">
                <span className={`invitation-status ${i.status}`}>
                  {i.actor_type === "agent" && i.status === "declined"
                    ? tr("参会授权已撤回")
                    : tr(invitationLabels[i.status])}
                </span>
                {i.deferred_at && (
                  <span>
                    <Clock size={13} aria-hidden="true" />
                    {tr("稍后处理")}
                  </span>
                )}
                {i.actor_type === "agent" &&
                  i.status === "accepted" &&
                  !i.joined_at && <span>{tr("等待 AI 客户端加入")}</span>}
              </p>
              <div className="invitation-actions">
                {i.status === "pending" && (
                  <>
                    <button
                      className="button primary small"
                      disabled={busy}
                      onClick={() => void handleResponse(i, "accept")}
                    >
                      <CheckCircle size={16} />
                      {i.actor_type === "agent"
                        ? tr("允许 AI 参会")
                        : tr("接受邀请")}
                    </button>
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => void handleResponse(i, "later")}
                    >
                      {tr("稍后处理")}
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => void handleResponse(i, "decline")}
                    >
                      {tr("拒绝")}
                    </button>
                  </>
                )}
                {i.status === "accepted" && (
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => open(i)}
                  >
                    {i.actor_type === "human" ? tr("加入会议") : tr("查看会议")}
                  </button>
                )}
                {i.status === "accepted" && i.actor_type === "agent" && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => void handleResponse(i, "decline")}
                  >
                    {tr("撤回参会授权")}
                  </button>
                )}
                {i.status === "declined" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void handleResponse(i, "accept")}
                  >
                    {tr("改为接受")}
                  </button>
                )}
                {!i.seen_at && i.status !== "pending" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void handleResponse(i, "seen")}
                  >
                    {tr("标为已读")}
                  </button>
                )}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export function AgentPreferences({
  agent,
  busy,
  save,
}: {
  agent: Item;
  busy: boolean;
  save: (input: Item) => Promise<unknown>;
}) {
  const [policy, setPolicy] = useState(agent.meeting_policy ?? "ask");
  const [allowDirect, setAllowDirect] = useState(!!agent.allow_direct);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save({ meetingPolicy: policy, allowDirect });
      }}
    >
      <p className="modal-intro">
        {tr("由你决定 {name} 如何接受其他伙伴的邀请。", { name: agent.name })}
      </p>
      <label>
        {tr("其他伙伴邀请我的 AI 参会时")}
        <select value={policy} onChange={(e) => setPolicy(e.target.value)}>
          <option value="ask">{tr("每次由我确认")}</option>
          <option value="auto">{tr("自动接受项目内的会议邀请")}</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={allowDirect}
          onChange={(e) => setAllowDirect(e.target.checked)}
        />
        <span>
          {tr("允许项目伙伴向这个 AI 发起对话")}
          <small>
            {tr("对话会对你可见；不会自动分享办公室记录或私人文件。")}
          </small>
        </span>
      </label>
      <p className="muted">
        {tr("接受邀请不会启动模型，AI 客户端连接并回应后才算到场。")}
      </p>
      <button className="button primary full" disabled={busy}>
        {tr("保存设置")}
      </button>
    </form>
  );
}

export const requestLabels: Record<string, string> = {
  queued: "等待客户端处理",
  processing: "AI 正在处理",
  replied: "已回复",
  failed: "处理失败，可重试",
};

export function DirectConversation({
  conversation,
  projectId,
  userId,
}: {
  conversation: Item;
  projectId: string;
  userId?: string;
}) {
  const [messages, setMessages] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const sendingNow = useRef(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const endpoint = `/projects/${projectId}/conversations/${conversation.id}/messages`;
  const sender = conversation.user_id === userId;
  const canSend =
    sender &&
    !conversation.revoked &&
    (!!conversation.allow_direct ||
      conversation.user_id === conversation.owner_id);
  useEffect(() => {
    let stopped = false;
    const run = async () => {
      try {
        const result = await api<Item[]>(endpoint);
        if (!stopped) {
          setMessages(result);
          setLoaded(true);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void run();
    const timer = setInterval(run, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [endpoint]);
  const retry = async (requestId: string) => {
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${projectId}/agent-requests/${requestId}/retry`,
        "POST",
        {},
      );
      setMessages(await api(endpoint));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="direct-conversation" aria-busy={busy}>
      <p className="modal-intro">
        {tr("{user} 与 {agent} 的对话", {
          user: conversation.user_name,
          agent: conversation.agent_name,
        })}
        <br />
        {tr("仅提问者、这个 AI 及其主人可见。")}
      </p>
      <p className="direct-context-note">
        {tr(
          "自动回复使用本段对话与项目共享资料。AI 客户端需要在线并配置模型。",
        )}
      </p>
      {error && (
        <p role="alert" className="direct-error">
          {localizeError(error)}
        </p>
      )}
      <div className="direct-log" role="log" aria-label={tr("AI 对话记录")}>
        {!loaded ? (
          <p className="muted">{tr("正在读取对话…")}</p>
        ) : !messages.length ? (
          <p className="chat-empty">
            {tr("向这个 AI 提一个关于项目的问题吧。")}
          </p>
        ) : (
          messages.map((m) => (
            <article className={`direct-message ${m.actor_type}`} key={m.id}>
              <header>
                <strong>{m.actor_name}</strong>
                <time dateTime={m.created_at}>{time(m.created_at)}</time>
              </header>
              <p>{m.body}</p>
              {m.request_status && (
                <div className="direct-message-state">
                  <span role="status">
                    {tr(requestLabels[m.request_status])}
                  </span>
                  {m.request_status === "failed" && canSend && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void retry(m.request_id)}
                    >
                      {tr("重试")}
                    </button>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>
      {!canSend && (
        <p className="muted">
          {sender
            ? tr("这个 AI 已暂停接收对话，历史记录仍可查看。")
            : tr("这是伙伴与你的 AI 的对话，你可以在这里查看。")}
        </p>
      )}
      {canSend && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim() || busy || !canSend || sendingNow.current) return;
            sendingNow.current = true;
            setBusy(true);
            setError("");
            try {
              await api(endpoint, "POST", { body: draft });
              setDraft("");
              setMessages(await api(endpoint));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              sendingNow.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            {tr("向 AI 提问")}
            <ChatTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={12000}
              rows={3}
              disabled={busy}
            />
          </label>
          <p className="chat-keyboard-hint">
            {tr("Enter 发送 · Shift + Enter 换行")}
          </p>
          <button
            className="button primary full"
            disabled={busy || !draft.trim()}
          >
            {tr("发送给 {name}", { name: conversation.agent_name })}
          </button>
        </form>
      )}
    </div>
  );
}
