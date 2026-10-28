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
}: {
  projectId?: string;
  agentId?: string;
  agentName?: string;
}) {
  const locale = useLocale();
  const [pollSeconds, setPollSeconds] = useState(5);
  const [scope, setScope] = useState<ReplyScope>("all");
  const [instructions, setInstructions] = useState("");
  const [root, setRoot] = useState("");
  const [officeAccess, setOfficeAccess] = useState<
    "none" | "read" | "read-write"
  >("read");
  const [generated, setGenerated] = useState(false);
  const rootInvalid = !!root.trim() && !root.trim().startsWith("/");
  const prompt = buildSetupPrompt(
    {
      origin: location.origin,
      projectId,
      agentId,
      agentName,
      workspace:
        root.trim() && !rootInvalid ? { root, officeAccess } : undefined,
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
      <p className="connector-note">
        {tr("凭证单独保存在本地文件，配置提示词不包含凭证。")}
      </p>
      <details className="connector-options">
        <summary>{tr("本地工作目录（可选）")}</summary>
        <label>
          {tr("工作目录绝对路径")}
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={root}
            aria-invalid={rootInvalid}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="/Users/you/projects/my-project"
          />
        </label>
        {rootInvalid && (
          <p role="alert">{tr("请输入以 / 开头的本地绝对路径。")}</p>
        )}
        <label>
          {tr("主人的私人会话权限")}
          <select
            value={officeAccess}
            onChange={(e) =>
              setOfficeAccess(e.target.value as typeof officeAccess)
            }
          >
            <option value="read">{tr("只读文件")}</option>
            <option value="read-write">{tr("允许读写文件")}</option>
            <option value="none">{tr("关闭，仅允许单独授权的任务")}</option>
          </select>
        </label>
        <small>
          {tr(
            "这里只生成本地配置，不会扫描或上传目录。需要本地客户端完成绑定。",
          )}
        </small>
        <p className="connector-note">
          {tr(
            "伙伴提问和会议点名不加载本地目录。任务需在本地单独授权子目录；命令执行关闭。",
          )}
        </p>
        <p className="connector-note">
          {tr(
            "目录工具需放在独立私人或任务会话。客户端原生文件和终端权限需另行限制。",
          )}
        </p>
      </details>
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
      {!generated || rootInvalid ? (
        <button
          type="button"
          className="button primary full"
          disabled={rootInvalid}
          onClick={() => setGenerated(true)}
        >
          {tr("生成配置提示词")}
        </button>
      ) : (
        <div className="connector-result">
          <p className="connector-result-label">
            {tr(
              "复制给本地 AI 客户端完成配置。运行前通过本地编辑器单独保存凭证。",
            )}
          </p>
          <CopyBox value={prompt} copyLabel={tr("复制配置提示词")} />
        </div>
      )}
    </section>
  );
}
