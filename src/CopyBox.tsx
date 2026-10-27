import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { copyText } from "./clipboard";
import { tr } from "./i18n";

export default function CopyBox({
  value,
  copyLabel,
}: {
  value: string;
  copyLabel?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setStatus("idle");
    return () => {
      attempt.current++;
      clearTimeout(timer.current);
    };
  }, [value]);

  async function copy() {
    const current = ++attempt.current;
    clearTimeout(timer.current);
    setStatus("idle");
    try {
      await copyText(value);
      if (attempt.current !== current) return;
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      if (attempt.current === current) setStatus("error");
    }
  }

  return (
    <div className={`copy-box${copyLabel ? " copy-box-labelled" : ""}`}>
      <pre tabIndex={0}>{value}</pre>
      <button
        type="button"
        className={copyLabel ? "button copy-action" : "icon-button"}
        aria-label={
          status === "copied" ? tr("已复制") : (copyLabel ?? tr("复制"))
        }
        title={status === "copied" ? tr("已复制") : (copyLabel ?? tr("复制"))}
        onClick={copy}
      >
        {status === "copied" ? <Check size={18} /> : <Copy size={18} />}
        {copyLabel && (status === "copied" ? tr("已复制") : copyLabel)}
      </button>
      <small
        role="status"
        className={status === "copied" ? "copy-success" : undefined}
      >
        {status === "copied"
          ? tr("已复制")
          : status === "error"
            ? tr("无法自动复制，请选中文本手动复制。")
            : ""}
      </small>
    </div>
  );
}
