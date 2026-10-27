import { getLocale, tr, translate, type Locale } from "./i18n";
export type Item = Record<string, any>;
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.code === "VALIDATION_ERROR"
        ? "Validation failed"
        : (value.error ?? "Request failed"),
    );
  return value;
}
export function decodeText(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
export function time(value: string) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function createDemoData(locale: Locale) {
  const tr = (key: string) => translate(locale, key);
  return {
    project: {
      id: "demo",
      name: tr("一起搭建 CoNest"),
      description: tr(
        "让每个人带着自己的 AI，在同一个空间里交流、协作，把想法变成项目。",
      ),
      owner_id: "demo-human",
    },
    members: [
      { id: "demo-human", name: "Alex", username: "alex", role: "owner" },
      { id: "m2", name: "Maya", username: "maya", role: "member" },
      { id: "m3", name: "Noah", username: "noah", role: "member" },
    ],
    agents: [
      {
        id: "a1",
        name: "Atlas",
        model: "Claude",
        owner_id: "demo-human",
        owner_name: "Alex",
        status: "working",
        last_seen: null,
      },
      {
        id: "a4",
        name: "Echo",
        model: "GPT",
        owner_id: "demo-human",
        owner_name: "Alex",
        status: "working",
        last_seen: null,
      },
      {
        id: "a5",
        name: "Sage",
        model: "Gemini",
        owner_id: "demo-human",
        owner_name: "Alex",
        status: "idle",
        last_seen: null,
      },
      {
        id: "a2",
        name: "Pixel",
        model: "GPT",
        owner_id: "m2",
        owner_name: "Maya",
        status: "meeting",
        last_seen: null,
      },
      {
        id: "a3",
        name: "Nova",
        model: "Gemini",
        owner_id: "m3",
        owner_name: "Noah",
        status: "waiting",
        last_seen: null,
      },
    ],
    presence: [
      {
        actor_id: "a2",
        actor_type: "agent",
        room: "meeting",
        meeting_id: "demo-meeting",
        updated_at: new Date().toISOString(),
      },
    ],
    meetings: [
      {
        id: "demo-meeting",
        title: tr("第一版，一起把方向定下来"),
        agenda: tr("讨论 AI 接入、共享文件与会议体验。"),
        status: "active",
        agent_count: 5,
        creator_id: "demo-human",
        max_turns: 12,
        created_at: new Date().toISOString(),
      },
    ],
    tasks: [
      {
        id: "t1",
        title: tr("整理 AI 接入方案"),
        description: tr("定义外部 AI 能调用的工具和消息结构。"),
        status: "in_progress",
        assignee_id: "a1",
      },
      {
        id: "t2",
        title: tr("绘制我们的共享办公空间"),
        description: tr("给每个伙伴留一个位置。"),
        status: "review",
        assignee_id: "a2",
      },
      {
        id: "t3",
        title: tr("完成第一轮项目讨论"),
        description: tr("把讨论里的好想法保存下来。"),
        status: "todo",
        assignee_id: null,
      },
    ],
    decisions: [
      {
        id: "d1",
        body: tr("每个人带着自己的 AI 进入项目，共享经过授权的背景和成果。"),
        status: "confirmed",
        actor_name: "Alex",
        meeting_id: "demo-meeting",
      },
    ],
    files: [
      {
        id: "f-readme",
        path: "README.md",
        visibility: "shared",
        size: 960,
        version: 1,
        updated_at: new Date().toISOString(),
        mime: "text/markdown",
      },
      {
        id: "f1",
        path: "docs/project-brief.md",
        visibility: "shared",
        size: 2460,
        version: 3,
        updated_at: new Date().toISOString(),
        mime: "text/markdown",
      },
      {
        id: "f2",
        path: "design/office-notes.md",
        visibility: "shared",
        size: 1280,
        version: 1,
        updated_at: new Date().toISOString(),
        mime: "text/markdown",
      },
      {
        id: "f-client-setup",
        path: "docs/integrations/client-setup.md",
        visibility: "shared",
        size: 1840,
        version: 2,
        updated_at: new Date().toISOString(),
        mime: "text/markdown",
      },
    ],
    activity: [
      {
        id: 3,
        kind: "meeting.started",
        payload: { title: tr("第一版，一起把方向定下来"), actorName: "Alex" },
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        kind: "file.updated",
        payload: { path: "docs/project-brief.md", actorName: "Atlas" },
        created_at: new Date().toISOString(),
      },
      {
        id: 1,
        kind: "task.created",
        payload: { title: tr("绘制我们的共享办公空间"), actorName: "Maya" },
        created_at: new Date().toISOString(),
      },
    ],
  };
}
