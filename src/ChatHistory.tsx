import { useEffect, useRef, useState } from "react";
import { DotsThree, DownloadSimple } from "@phosphor-icons/react";
import { api, type Item } from "./api";
import { tr, localizeError, getLocale } from "./i18n";
import { scopeQuery, type ChatScope } from "./chat-timeline";

export default function ChatHistory(props: {
  projectId: string;
  scope: ChatScope;
}) {
  return (
    <ConversationOptions
      key={`${props.projectId}:${JSON.stringify(props.scope)}`}
      {...props}
    />
  );
}
function ConversationOptions({
  projectId,
  scope,
}: {
  projectId: string;
  scope: ChatScope;
}) {
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState<Item | null>(null);
  const [days, setDays] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [removed, setRemoved] = useState<Item[] | null>(null),
    [before, setBefore] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const alive = useRef(true);
  const root = `/projects/${projectId}/chat`;
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("focusin", close);
    };
  }, [open]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const query = scopeQuery(scope);
    query.set("limit", "1");
    void api<Item>(`${root}/history?${query}`)
      .then((result) => {
        if (!stopped) {
          setSettings(result);
          setDays(result.retentionDays);
        }
      })
      .catch((e) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [open, root]);
  async function hidden(append = false) {
    setBusy(true);
    setError("");
    try {
      const query = scopeQuery(scope);
      query.set("onlyHidden", "true");
      if (append && before) query.set("before", before);
      const page = await api<Item>(`${root}/history?${query}`);
      if (!alive.current) return;
      setRemoved((previous) =>
        append ? [...(previous ?? []), ...page.items] : page.items,
      );
      setBefore(page.nextBefore);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="conversation-options">
      <details
        ref={menu}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") menu.current!.open = false;
        }}
      >
        <summary
          role="button"
          aria-expanded={open}
          aria-label={tr("对话选项")}
          title={tr("对话选项")}
        >
          <DotsThree size={20} aria-hidden="true" />
        </summary>
        {open && (
          <div className="conversation-options-panel">
            <strong>{tr("对话选项")}</strong>
            <a
              href={`/api${root}/export?${scopeQuery(scope)}&format=md`}
              download
            >
              <DownloadSimple size={16} aria-hidden="true" />
              {tr("导出聊天记录")}
            </a>
            <details>
              <summary>{tr("高级选项")}</summary>
              <a
                href={`/api${root}/export?${scopeQuery(scope)}&format=json`}
                download
              >
                {tr("导出 JSON")}
              </a>
              {settings?.canManage && (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setError("");
                    setSaved(false);
                    try {
                      await api(`${root}/preferences`, "PATCH", {
                        ...scope,
                        groupName: settings.preference.group_name,
                        archived: !!settings.preference.archived,
                        retentionDays: days,
                      });
                      if (alive.current) setSaved(true);
                    } catch (e) {
                      if (alive.current) setError((e as Error).message);
                    } finally {
                      if (alive.current) setBusy(false);
                    }
                  }}
                >
                  <label>
                    {tr("正文保留天数（0 为不限）")}
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      step={1}
                      required
                      value={days}
                      onChange={(event) => {
                        setDays(Number(event.target.value));
                        setSaved(false);
                      }}
                    />
                  </label>
                  <p>
                    {tr(
                      "默认保留全部记录。修改后会对整个会话生效，到期正文自动清理，既有备份单独轮换。",
                    )}
                  </p>
                  <button className="button small" disabled={busy}>
                    {tr("保存设置")}
                  </button>
                  {saved && <span role="status">{tr("设置已保存")}</span>}
                </form>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void hidden()}
              >
                {tr("恢复以前移除的消息")}
              </button>
              {removed && (
                <div className="removed-messages">
                  {!removed.length && <p>{tr("没有已移除的消息")}</p>}
                  {removed.map((message) => (
                    <article key={message.id}>
                      <strong>{message.actor_name}</strong>
                      <time>
                        {new Date(message.created_at).toLocaleString(
                          getLocale(),
                        )}
                      </time>
                      <p>
                        {message.redacted_at ? tr("正文已清除") : message.body}
                      </p>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await api(
                              `${root}/messages/${message.id}`,
                              "PATCH",
                              { ...scope, action: "restore" },
                            );
                            if (alive.current)
                              setRemoved((previous) =>
                                previous!.filter(
                                  (row) => row.id !== message.id,
                                ),
                              );
                          } catch (e) {
                            if (alive.current) setError((e as Error).message);
                          } finally {
                            if (alive.current) setBusy(false);
                          }
                        }}
                      >
                        {tr("恢复显示")}
                      </button>
                    </article>
                  ))}
                  {before && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void hidden(true)}
                    >
                      {tr("查看更多")}
                    </button>
                  )}
                </div>
              )}
            </details>
            {error && <p role="alert">{localizeError(error)}</p>}
          </div>
        )}
      </details>
    </div>
  );
}
