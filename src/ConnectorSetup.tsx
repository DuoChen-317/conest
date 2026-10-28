import { lazy, Suspense, useEffect, useState } from "react";
import { CheckCircle, Copy, PlugsConnected } from "@phosphor-icons/react";
import CopyBox from "./CopyBox";
import { api } from "./api";
import { copyText } from "./clipboard";
import { localizeError, tr, useLocale } from "./i18n";
import { buildPairingPrompt } from "./pairing-prompt";

const AdvancedSetup = lazy(() => import("./AdvancedConnectorSetup"));
type Ticket = {
  id: string;
  code: string;
  expiresAt: string;
  bootstrapSha256: string;
  status: string;
  clientName?: string;
  fingerprint?: string;
  mcpSeen?: string | null;
};
export default function ConnectorSetup({
  projectId,
  agentId,
  agentName,
  agents = [],
}: {
  projectId?: string;
  agentId?: string;
  agentName?: string;
  agents?: { id: string; name: string }[];
}) {
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState(agentId ?? agents[0]?.id ?? "");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [error, setError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const name =
    agentName ?? agents.find((agent) => agent.id === selectedId)?.name;
  const prompt = ticket?.code
    ? buildPairingPrompt(
        {
          origin: location.origin,
          projectId: projectId!,
          agentId: selectedId,
          code: ticket.code,
          bootstrapSha256: ticket.bootstrapSha256,
        },
        locale,
      )
    : "";

  useEffect(() => {
    let active = true;
    setRecovering(true);
    setTicket(null);
    if (!projectId || !selectedId || projectId === "demo") {
      setRecovering(false);
      return;
    }
    void api(`/projects/${projectId}/agents/${selectedId}/pairings/latest`)
      .then(async (result) => {
        if (!active) return;
        if (result.request)
          setTicket({ code: "", bootstrapSha256: "", ...result.request });
        else {
          // Prepare before the copy gesture so Clipboard API calls need no network await.
          const created = await api(
            `/projects/${projectId}/agents/${selectedId}/pairings`,
            "POST",
            {},
          );
          if (active) setTicket({ ...created, status: "waiting" });
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            localizeError(
              reason instanceof Error ? reason.message : "Request failed",
            ),
          );
      })
      .finally(() => {
        if (active) setRecovering(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, selectedId]);

  useEffect(() => {
    if (!ticket?.id) return;
    const id = ticket.id;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      let terminal = false;
      try {
        const result = await api(`/connect/requests/${id}`);
        if (!active) return;
        setTicket((previous) =>
          previous?.id === id ? { ...previous, ...result } : previous,
        );
        setError("");
        terminal = ["cancelled"].includes(result.status) || !!result.mcpSeen;
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "";
        setError(localizeError(message));
        if (message === "Connection request expired") {
          setTicket((previous) =>
            previous?.id === id ? { ...previous, status: "expired" } : previous,
          );
          terminal = true;
        }
      }
      if (active && !terminal) timer = setTimeout(() => void sync(), 2000);
    };
    void sync();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ticket?.id]);

  async function copyPrompt(refresh = false) {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      let current = ticket;
      if (
        refresh ||
        !current ||
        !current.code ||
        ["cancelled", "expired"].includes(current.status) ||
        Date.parse(current.expiresAt) <= Date.now()
      ) {
        const created = await api(
          `/projects/${projectId}/agents/${selectedId}/pairings`,
          "POST",
          {},
        );
        current = { ...created, status: "waiting" };
        setTicket(current);
      }
      const value = buildPairingPrompt(
        {
          origin: location.origin,
          projectId: projectId!,
          agentId: selectedId,
          code: current!.code,
          bootstrapSha256: current!.bootstrapSha256,
        },
        locale,
      );
      try {
        await copyText(value);
        setCopied(true);
      } catch {
        setManualCopy(true);
      }
    } catch (reason) {
      setError(
        localizeError(
          reason instanceof Error ? reason.message : "Request failed",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function respond(action: "approve" | "cancel") {
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/connect/requests/${ticket.id}`, "PATCH", {
        action,
      });
      setTicket((previous) =>
        previous ? { ...previous, ...result } : previous,
      );
    } catch (reason) {
      setError(
        localizeError(
          reason instanceof Error ? reason.message : "Request failed",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="connector-setup connection-simple"
      aria-label={tr("连接 AI")}
    >
      <div className="connector-heading">
        <PlugsConnected size={22} aria-hidden="true" />
        <div>
          <h3>{tr("复制提示词，连接你的 AI")}</h3>
          <p>
            {name
              ? tr("将 {name} 连接到这个项目。", { name })
              : tr("使用你正在用的本地 AI 客户端。")}
          </p>
        </div>
      </div>
      {!agentId && agents.length > 0 && (
        <label>
          {tr("选择要连接的 AI")}
          <select
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setTicket(null);
              setCopied(false);
              setError("");
            }}
          >
            {agents.map((agent) => (
              <option value={agent.id} key={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ol className="connection-steps">
        <li>{tr("复制提示词，发送给你正在用的 AI 客户端。")}</li>
        <li>{tr("客户端发起申请后，回到这里确认连接。")}</li>
        <li>{tr("收到真实客户端连接后，页面显示验证结果。")}</li>
      </ol>
      <button
        type="button"
        className="button primary full"
        disabled={
          busy ||
          recovering ||
          !selectedId ||
          !projectId ||
          projectId === "demo"
        }
        onClick={() => void copyPrompt()}
      >
        <Copy size={18} />
        {busy
          ? tr("正在处理…")
          : copied
            ? tr("已复制，再复制一次")
            : tr("复制接入提示词")}
      </button>
      {!selectedId && (
        <p className="connector-note">
          {tr("先创建自己的 AI 身份，再复制接入提示词。")}
        </p>
      )}
      <p className="connection-hint">
        {tr(
          "无需手填凭证或配置文件。提示词内的配对码十分钟有效，连接前需你确认。",
        )}
      </p>
      {ticket && (ticket.status !== "waiting" || copied || manualCopy) && (
        <div className="connection-state" role="status" aria-live="polite">
          {ticket.mcpSeen ? (
            <>
              <strong>
                <CheckCircle size={18} />
                {tr("已收到 MCP 客户端连接")}
              </strong>
              <p>
                {tr(
                  "工具连接已验证；后台自动回复是否运行，需要客户端单独验证。",
                )}
              </p>
            </>
          ) : ticket.status === "claimed" ? (
            <>
              <strong>{tr("客户端正在申请连接")}</strong>
              <p>
                {tr("客户端自报名称：{name}", {
                  name: ticket.clientName ?? "",
                })}
              </p>
              <p>
                {tr("核对客户端显示的指纹：{fingerprint}", {
                  fingerprint: ticket.fingerprint ?? "",
                })}
              </p>
              <p>{tr("确认后，此客户端将获得该 AI 的项目访问权限。")}</p>
              <div className="connection-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void respond("approve")}
                >
                  {tr("确认连接")}
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => void respond("cancel")}
                >
                  {tr("拒绝连接")}
                </button>
              </div>
            </>
          ) : ticket.status === "approved" ? (
            <>
              <strong>{tr("已授权，等待客户端验证")}</strong>
              <p>{tr("客户端会自动保存本地配置并检查 MCP 连接。")}</p>
            </>
          ) : ["expired", "cancelled"].includes(ticket.status) ? (
            <strong>{tr("本次接入已失效，请重新生成。")}</strong>
          ) : (
            <>
              <strong>
                {copied
                  ? tr("已复制，等待客户端申请")
                  : tr("接入提示词已准备好")}
              </strong>
              <p>{tr("把提示词发给本地客户端，然后回到这里。")}</p>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
      {ticket && (ticket.status !== "waiting" || copied || manualCopy) && (
        <div className="connection-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void copyPrompt(true)}
          >
            {tr("重新生成接入提示词")}
          </button>
          {!["cancelled", "expired"].includes(ticket.status) && (
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={() => void respond("cancel")}
            >
              {tr("取消本次连接")}
            </button>
          )}
        </div>
      )}
      {ticket && prompt && (
        <details open={manualCopy}>
          <summary>{tr("查看接入提示词")}</summary>
          <CopyBox value={prompt} copyLabel={tr("复制接入提示词")} />
        </details>
      )}
      <details
        className="connection-advanced"
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>{tr("高级设置与本地目录（可选）")}</summary>
        {advanced && (
          <Suspense fallback={<p>{tr("正在读取…")}</p>}>
            <AdvancedSetup
              key={selectedId}
              projectId={projectId}
              agentId={selectedId || undefined}
              agentName={name}
            />
          </Suspense>
        )}
      </details>
    </section>
  );
}
