import { useState } from "react";
import { Clock, Terminal } from "@phosphor-icons/react";
import CopyBox from "./CopyBox";
import {
  buildSetupPrompt,
  pollIntervals,
  type ReplyScope,
} from "./connector-setup";
import { tr, useLocale } from "./i18n";

export default function ConnectorSetup({
  projectId,
  agentId,
  agentName,
  token: initialToken,
}: {
  projectId?: string;
  agentId?: string;
  agentName?: string;
  token?: string;
}) {
  const locale = useLocale();
  const [pollSeconds, setPollSeconds] = useState(5);
  const [scope, setScope] = useState<ReplyScope>("all");
  const [instructions, setInstructions] = useState("");
  const [token, setToken] = useState(initialToken ?? "");
  const [generated, setGenerated] = useState(false);
  const prompt = buildSetupPrompt(
    {
      origin: location.origin,
      projectId,
      agentId,
      agentName,
      token,
      pollSeconds,
      scope,
      instructions,
    },
    locale,
  );
  return (
    <section className="connector-setup" aria-label={tr("本地自动回复")}>
      <div className="connector-heading">
        <Terminal size={20} aria-hidden="true" />
        <div>
          <h3>{tr("本地自动回复")}</h3>
          <p>{tr("设置检查频率，生成提示词，复制给你使用的 AI 客户端。")}</p>
        </div>
      </div>
      {agentName && (
        <p className="connector-identity">
          {agentName} <span>· {tr("独立配置")}</span>
        </p>
      )}
      <div className="connector-fields">
        <label>
          {tr("检查频率")}
          <select
            value={pollSeconds}
            onChange={(e) => setPollSeconds(Number(e.target.value))}
          >
            {pollIntervals.map((seconds) => (
              <option key={seconds} value={seconds}>
                {tr("每 {seconds} 秒", { seconds })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("自动回复范围")}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ReplyScope)}
          >
            <option value="all">{tr("单独对话和会议点名")}</option>
            <option value="direct">{tr("仅单独对话")}</option>
            <option value="meeting">{tr("仅会议点名")}</option>
          </select>
        </label>
      </div>
      <p className="connector-note">
        <Clock size={14} aria-hidden="true" />
        {tr("没有新问题时只检查队列，不调用模型。")}
      </p>
      {!initialToken && (
        <label>
          {tr("AI 专属凭证")}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="cn_…"
          />
          <small>
            {tr("仅用于生成本次提示词，不在浏览器保存。留空可生成配置模板。")}
          </small>
        </label>
      )}
      <details className="connector-options">
        <summary>{tr("补充回复要求（可选）")}</summary>
        <label>
          {tr("回复要求")}
          <textarea
            rows={3}
            maxLength={2000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={tr("例如：回答简洁；不确定时说明缺少的信息。")}
          />
        </label>
      </details>
      <p className="connector-note">
        {tr(
          "适用于 Codex、Claude Code 和其他本地 AI 客户端。自动回复需要本地进程持续运行。",
        )}
      </p>
      {!generated ? (
        <button
          type="button"
          className="button primary full"
          onClick={() => setGenerated(true)}
        >
          {tr("生成配置提示词")}
        </button>
      ) : (
        <div className="connector-result">
          <p className="connector-result-label">
            {token.trim()
              ? tr(
                  "复制后发送给你的 AI 客户端，完成本地配置。提示词包含此 AI 的凭证。",
                )
              : tr("当前为配置模板，运行前需要补充 AI 凭证。")}
          </p>
          <CopyBox value={prompt} copyLabel={tr("复制配置提示词")} />
        </div>
      )}
    </section>
  );
}
