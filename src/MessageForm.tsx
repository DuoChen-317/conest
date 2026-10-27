import { useEffect, useRef, useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import ChatTextarea from "./ChatTextarea";
import { tr } from "./i18n";

export default function MessageForm({
  onDraftChange,
  send,
  disabled,
  placeholder,
}: {
  onDraftChange?: (working: boolean) => void;
  send: (body: string) => Promise<any>;
  disabled: boolean;
  placeholder: string;
}) {
  const [body, setBody] = useState(""),
    [sending, setSending] = useState(false);
  const sendingNow = useRef(false);
  const working = Boolean(body.trim());
  useEffect(() => {
    onDraftChange?.(working);
    return () => onDraftChange?.(false);
  }, [working, onDraftChange]);
  return (
    <form
      className="message-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim() || disabled || sendingNow.current) return;
        sendingNow.current = true;
        setSending(true);
        try {
          const sent = await send(body);
          if (sent !== false) setBody("");
        } finally {
          sendingNow.current = false;
          setSending(false);
        }
      }}
    >
      <label className="sr-only" htmlFor="message-body">
        {tr("消息内容")}
      </label>
      <ChatTextarea
        id="message-body"
        rows={2}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={12000}
        disabled={disabled || sending}
      />
      <span className="chat-keyboard-hint">
        {tr("Enter 发送 · Shift + Enter 换行")}
      </span>
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
