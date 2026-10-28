# 会议邀请与 AI 对话

## 邀请、接受和到场

创建会议时，可分别选择需要通知的项目成员和 AI；主持人或项目创建者也能在会议中追加邀请。未勾选的人仍可从项目会议列表进入，邀请承担通知和回应的作用，不会把会议变成私密会议。

邀请会写入数据库。右上角的通知入口汇总所有项目，显示未读数量；未处理邀请还会出现在页面提醒中。通知当前每四秒同步一次，不是浏览器系统推送或邮件。离线后重新登录仍能看到邀请。“稍后处理”会收起提醒，邀请继续保存在通知中心。

人的邀请状态为“待回应 / 已接受 / 已拒绝”。接受后点击“加入会议”，才记录实际到场。也可以直接从会议列表进入，这会同时接受自己的邀请。会议的“邀请与到场”列表结合持久化的入会记录和当前房间位置，显示已加入、已离开或曾参与。会议结束后保留通知和记录，但禁止继续接受、追加邀请或加入。

AI 的会议授权由主人控制：

- 邀请自己的 AI，视为本人明确授权。
- 其他成员邀请 AI，默认需要主人在通知中心确认。
- 主人可以在“成员与 AI → 协作设置”中允许自动接受本项目未来的会议邀请。
- 未获批准的 AI 不能读取会议消息、接收会议事件或自行入会。
- 批准仅授予参会权限，不代表模型已启动。客户端主动加入、读取或发送会议消息后，才记录 AI 到场。
- 主人可在通知中心撤回 AI 的参会授权，包括 AI 已经到场之后。撤回会取消后续读取和发言权限、使尚未完成的请求及回复租约失效；历史发言和到场记录保留。已经交给外部客户端的数据无法收回，也不会因此自动中止外部模型调用。

升级数据库时，旧版已经拥有会议访问权的 AI 参与者会保留权限；新邀请采用上面的确认流程。无需删除旧数据库。

## 向对方的 AI 提问

主人在 AI 的“协作设置”中开启“允许项目伙伴向这个 AI 发起对话”后，伙伴可以点击该 AI 的“发起对话”。右上角“AI 对话”可重新打开历史对话，主人也能查看别人和自己 AI 的对话。

单独对话仅限提问者、目标 AI 和其主人读取；同一主人名下的其他 AI 没有访问权。主人查看对话不会冒充原提问者或 AI 发言。关闭对话授权后，历史仍可读，伙伴的新提问被拒绝，伙伴尚未完成的请求及回复租约立即失效。重新开启后，原提问者需要主动重试，旧回复不会恢复有效。主人与自己的 AI 对话不受这个伙伴开关限制。撤销 AI 凭证同样阻止继续回复。

会议中的“定向提问（@ AI）”选择器会按真实 AI 身份投递，只有获准参会的 AI 可被选择。直接在正文里输入名字不会创建定向请求。回复留在会议中，所有会议参与者都能阅读。“请 AI 整理会议”也会向已获准的 AI 创建请求。

问题会显示“等待客户端处理 → AI 正在处理 → 已回复”，失败时显示重试入口。离线时问题保留在服务器队列中，不会伪造回复。只有原提问者能重试失败请求。

## 运行自动回复连接器

主要接入入口已统一为 AI 卡片的“连接 AI → 复制接入提示词”。客户端在本机生成凭证，主人回网页核对指纹并确认，客户端再配置本地 MCP 桥接并验证项目。无需手填凭证或选择协议，详见[统一接入流程](connection-setup.md)。这个流程验证身份和工具连接，不能把它当作后台自动回复已启动。

需要持续自动问答时，在“连接 AI → 高级设置与本地目录”中选择检查频率、回复范围和补充回复要求，生成高级配置提示词。它不包含凭证明文，只引用本地 `CONEST_TOKEN_FILE`；可以复用接入助手已保存的凭证文件，无须再复制凭证。手动接入仍可通过本地编辑器单独保存凭证，服务端无法恢复其明文。可同时生成[本地工作目录](local-workspace.md)的独立 MCP 配置。

提示词同时提供 HTTP 请求协议和 MCP 工具调用顺序，适用于支持本地运行的 AI 客户端，不依赖某个模型供应商。生成提示词只生成配置内容；必须由本地客户端建立持续运行的进程，才能开始检查队列。网页关闭不会停止该进程，电脑休眠或进程退出会暂停处理。每个 AI 使用独立配置，不共用身份凭证。本地目录只生成配置，不会扫描磁盘，也不会把路径保存到浏览器存储或提交给服务器。

连接器运行在 AI 主人的机器或指定服务器上，专门接收单独对话和会议定向问题。它不会替主人审批会议、执行任务或修改项目文件。普通会议消息仍由客户端主动读取，避免所有 AI 自动互相触发。

先用现有界面的“接入 AI”创建身份，单独保存其凭证文件。然后在本地环境设置模型凭证，二选一：

```sh
# OpenAI API：自行选择账号可用的模型 ID
export CONEST_URL=http://127.0.0.1:4173
export CONEST_PROVIDER=openai
export CONEST_MODEL='<MODEL_ID>'
export CONEST_TOKEN_FILE='/absolute/path/to/owner-only-credential'
export OPENAI_API_KEY='<LOCAL_API_KEY>'
npm run connector
```

```sh
# Claude API：第三方产品采用 API 凭证，不复用 claude.ai 订阅登录
export CONEST_URL=http://127.0.0.1:4173
export CONEST_PROVIDER=claude
export CONEST_MODEL='<MODEL_ID>'
export CONEST_TOKEN_FILE='/absolute/path/to/owner-only-credential'
export ANTHROPIC_API_KEY='<LOCAL_API_KEY>'
npm run connector
```

模型凭证只保留在本地连接器，不会发送给 CoNest。内置 API 适配器把当前对话最近最多 30 条消息、合计最多 16,000 字符的近期正文、同一会话最多 7 条相关旧记录引用（每条最多 800 字符）、项目说明、会议议题和受限共享文本文件发送给模型；不提供工具，也不加载办公室记录、私人文件、其他对话或桌面聊天历史。摘录附消息 ID，不代表已确认的会议决议。文件限十个、单个 16 KB、合计 64 KB。请求本身的内部 ID 和回复租约也不会发送给模型。历史分页、摘录、移除、撤回、保留期限和备份见[聊天记录维护](chat-history.md)。

每次接单有三分钟租约，模型调用限时 90 秒。多个连接器抢同一个请求时只有一个能接收；进程断开后，过期租约可重新领取。回复用租约校验，重传同一次成功回复不会重复插入消息。模型失败后等待提问者重试，不会持续重复消耗模型额度。

这些 API 适配器调用的是模型服务，**不会接管已经打开的 Codex 或 Claude 桌面聊天窗口**。现有测试用模拟模型验证网络请求格式和整个收发流程，没有使用真实模型凭证或产生模型调用费用。

参考：[OpenAI 文本生成](https://developers.openai.com/api/docs/guides/text)、[Claude Messages API](https://platform.claude.com/docs/en/api/messages/create)、[Claude 第三方接入授权说明](https://code.claude.com/docs/en/agent-sdk/overview)。

## Codex、Claude Code 与自定义客户端

Codex 或 Claude Code 连接项目 MCP 后，可调用以下工具接收和回复问题：

1. `list_ai_requests`：列出投递给当前 AI 的请求。
2. `claim_ai_request({requestId})`：接单，获得有限背景和 `leaseId`。
3. `reply_to_ai_request({requestId, leaseId, body})`：回复；失败可用 `failed: true`。
4. `join_meeting({meetingId})`：明确确认到场，前提是主人已批准。

配置 MCP 本身不会自动启动模型或后台轮询。需要持续运行的客户端驱动这些工具。

`npm run connector` 支持以下本地环境设置，与网页生成的 JSON 配置字段对应（不要把 JSON 直接当作 shell 命令执行）：

| 设置                                    | 默认值         | 作用                                                                                    |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `CONEST_TOKEN_FILE`                     | 无             | 本地凭证文件的绝对路径，权限 0600；优先于兼容的 `CONEST_TOKEN`                          |
| `CONEST_POLL_SECONDS`                   | `5`            | 队列检查间隔，允许 2–3600 秒；网页提供 2、5、10、30、60 秒                              |
| `CONEST_REPLY_SCOPE`                    | `all`          | `all`：单独对话与会议点名；`direct`：仅单独对话；`meeting`：仅会议点名，领取前过滤      |
| `CONEST_REPLY_INSTRUCTIONS`             | 空             | 主人设置的回复要求；内置模型适配器接收该要求，自定义处理程序从 `replyInstructions` 读取 |
| `CONEST_PROJECT_ID` / `CONEST_AGENT_ID` | 从身份接口读取 | 填写后会验证凭证对应身份，防止多个 AI 的配置混用                                        |

空队列不会调用模型。身份验证失败或权限被拒绝时停止连接器并报告错误，避免无效凭证持续请求。更改本地配置后需要重启进程。

也可以设置 `CONEST_HANDLER='["node","/absolute/path/to/trusted-handler.mjs"]'`，再运行 `npm run connector`。处理程序通过 stdin 接收 `QuestionContext` JSON（含可选的 `replyInstructions`），向 stdout 返回 `{"body":"回答"}`。它可以封装官方 Codex SDK、app-server 或自己的代理运行环境；当前仓库没有内置桌面会话控制器。[Codex 的官方非交互文档](https://learn.chatgpt.com/docs/non-interactive-mode)说明了脚本调用、stdin 输入与结构化输出的方式；其他客户端应使用各自的官方运行方式。处理程序不会继承 CoNest 和模型凭证环境变量，但它是主人明确选择的本地代码，并非沙箱。接入有本地工具和私人记忆的代理时，应在独立运行环境限制其实际读取范围，不能只依赖提示词保证隐私。

旧的 `npm run agent` 监听器继续保留办公室与公共事件适配功能。公共事件处理程序只收到共享文件、公共动态，且不包含单独对话列表；私人办公室事件才提供主人的私人上下文。会议可处理事件改用主人批准后的 `meeting.ready`；显式 @ 请求交给请求队列处理，避免双重回复和 AI 互相触发。

## HTTP 接口

所有项目接口都校验项目成员身份；AI 凭证只作用于绑定项目。

| 接口                                              | 用途                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/notifications`                          | 当前用户跨项目的人和 AI 会议邀请                                 |
| `PATCH /api/notifications/:id`                    | `{action: "accept" / "decline" / "later" / "seen"}`              |
| `POST /api/projects/:p/meetings`                  | 原有字段加 `memberIds`；`agentIds` 创建 AI 授权请求              |
| `POST /api/projects/:p/meetings/:m/invitations`   | 主持人或项目创建者追加 `{memberIds, agentIds}`                   |
| `POST /api/projects/:p/meetings/:m/join`          | 当前身份确认到场                                                 |
| `PATCH /api/projects/:p/agents/:a/preferences`    | 主人设置 `{meetingPolicy: "ask" / "auto", allowDirect: boolean}` |
| `POST /api/projects/:p/conversations`             | 人创建或获取自己与 `{agentId}` 的对话                            |
| `GET /api/projects/:p/conversations/:c/messages`  | 对话授权范围内的历史和处理状态                                   |
| `POST /api/projects/:p/conversations/:c/messages` | 原提问者发送 `{body}`                                            |
| `POST /api/projects/:p/messages`                  | 原有字段加 `recipientAgentIds` 创建会议定向问题                  |
| `GET /api/projects/:p/agent-requests`             | 当前 AI 的可领取请求                                             |
| `POST /api/projects/:p/agent-requests/:r/claim`   | 当前 AI 领取请求及有限背景                                       |
| `POST /api/projects/:p/agent-requests/:r/reply`   | 当前 AI 发送 `{leaseId, body}` 或 `{leaseId, failed: true}`      |
| `POST /api/projects/:p/agent-requests/:r/retry`   | 原提问者重试失败请求                                             |

项目快照增加 `meetingInvitations`、授权范围内的 `conversations`，以及 AI 的协作设置。单独对话事件的正文不会写入项目动态；事件元数据也按提问者、AI 主人和目标 AI 过滤。
