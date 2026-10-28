import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DotsThree } from "@phosphor-icons/react";
import { api, type Item } from "./api";
import { tr, localizeError } from "./i18n";
import {
  mergeMessages,
  matchesScope,
  scopeQuery,
  type ChatScope,
} from "./chat-timeline";

export default function ChatTimeline(props: {
  projectId?: string;
  viewerId?: string;
  scope?: ChatScope;
  messages: Item[];
  className: string;
  label: string;
  children: (messages: Item[], update: (message: Item) => void) => ReactNode;
}) {
  return (
    <Timeline
      key={`${props.viewerId}:${props.projectId}:${JSON.stringify(props.scope)}`}
      {...props}
    />
  );
}
function Timeline({
  projectId,
  viewerId,
  scope,
  messages,
  className,
  label,
  children,
}: Parameters<typeof ChatTimeline>[0]) {
  const latest =
    projectId && scope
      ? messages.filter((message) =>
          matchesScope(message, projectId, scope, viewerId),
        )
      : messages;
  const [records, setRecords] = useState<Item[]>(latest);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const fetching = useRef(false);
  const current = useRef(true);
  const atBottom = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const initialized = useRef(false);
  const all = mergeMessages(records, latest);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  useEffect(() => {
    setRecords((previous) => mergeMessages(previous, latest));
  }, [messages]);
  async function older(retry = false) {
    const view = viewport.current;
    if (
      !projectId ||
      !scope ||
      !view ||
      !more ||
      fetching.current ||
      (error && !retry) ||
      !all.length
    )
      return;
    fetching.current = true;
    setError("");
    setLoading(true);
    try {
      const query = scopeQuery(scope);
      query.set("beforeMessage", all[0].id);
      query.set("limit", "50");
      const page = await api<Item>(
        `/projects/${projectId}/chat/history?${query}`,
      );
      if (!current.current) return;
      // Measure immediately before inserting, so scrolling during the request is preserved.
      anchor.current = { height: view.scrollHeight, top: view.scrollTop };
      setRecords((previous) => mergeMessages(page.items, previous));
      setMore(page.hasMore);
    } catch (e) {
      if (current.current) setError((e as Error).message);
    } finally {
      fetching.current = false;
      if (current.current) setLoading(false);
    }
  }
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    if (anchor.current) {
      view.scrollTop =
        anchor.current.top + view.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (atBottom.current || !initialized.current) {
      view.scrollTop = view.scrollHeight;
      initialized.current = all.length > 0;
    }
  }, [all.length, all.at(-1)?.id]);
  useEffect(() => {
    const view = viewport.current;
    if (view && view.scrollHeight <= view.clientHeight + 1) void older();
  }, [all.length, more, loading]);
  return (
    <div
      className={className}
      ref={viewport}
      role="log"
      aria-label={label}
      tabIndex={0}
      onScroll={() => {
        const view = viewport.current!;
        atBottom.current =
          view.scrollHeight - view.scrollTop - view.clientHeight < 64;
        if (view.scrollTop < 64) void older();
      }}
    >
      {loading && (
        <p className="timeline-status" role="status">
          {tr("正在读取更早的消息…")}
        </p>
      )}
      {error && (
        <p className="timeline-status" role="alert">
          {localizeError(error)}{" "}
          <button
            className="text-button"
            onClick={() => {
              void older(true);
            }}
          >
            {tr("重试")}
          </button>
        </p>
      )}
      {children(all, (message) =>
        setRecords((previous) => mergeMessages(previous, [message])),
      )}
    </div>
  );
}
export function MessageActions({
  projectId,
  scope,
  message,
  update,
}: {
  projectId?: string;
  scope?: ChatScope;
  message: Item;
  update: (message: Item) => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const menu = useRef<HTMLDetailsElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirm && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [confirm]);
  if (!projectId || !scope || !message.canWithdraw) return null;
  return (
    <details
      className="message-options"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          menu.current!.open = false;
          setConfirm(false);
        }
      }}
    >
      <summary role="button" aria-label={tr("消息选项")}>
        <DotsThree size={18} aria-hidden="true" />
      </summary>
      <div className="message-options-panel">
        <button
          className="text-button"
          onClick={() => {
            setError("");
            setConfirm(true);
          }}
        >
          {tr("撤回正文")}
        </button>
      </div>
      {confirm && (
        <dialog
          ref={dialog}
          className="message-withdraw-dialog"
          aria-label={tr("撤回正文")}
          onCancel={() => setConfirm(false)}
        >
          <p>{tr("撤回后正文将清除，已被他人读取或导出的内容无法收回。")}</p>
          <button
            className="button small"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {tr("取消")}
          </button>
          <button
            className="button small danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(
                  "/projects/" + projectId + "/chat/messages/" + message.id,
                  "PATCH",
                  { ...scope, action: "withdraw" },
                );
                update({
                  ...message,
                  body: "",
                  redacted_at: new Date().toISOString(),
                  redaction_reason: "withdrawn",
                  canWithdraw: false,
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("确认撤回")}
          </button>
          {error && <p role="alert">{localizeError(error)}</p>}
        </dialog>
      )}
    </details>
  );
}
