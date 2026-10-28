# 权限检查记录（2026-10-26）

检查范围为当前 HTTP / MCP 服务、会议邀请、AI 对话、文件和办公室隔离、请求撤权、示例客户端及 npm 依赖。使用独立临时数据库和测试账号，没有调用真实模型，也没有访问正常项目的数据。本记录是代码审查和回归测试结果，不代表完整渗透测试或安全认证。

## 已发现并修复

| 问题                                                           | 修复后的行为                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 关闭伙伴与 AI 对话后再开启，先前正在处理的回复租约可能继续生效 | 关闭立即使伙伴未完成的请求及租约失效。重新开启需要原提问者主动重试，旧回复被拒绝                        |
| AI 到场后，主人无法再撤回参会授权                              | 通知中心可撤回。服务端移除会议访问权、取消未完成请求及租约；AI 如果正在该会议，位置退回办公室；保留历史 |
| AI 能把人已经验收为 done 的任务重新打开                        | 已验收任务只能由人重新打开，AI 操作返回 403                                                             |
| 凭证撤销之前已经建立的 AI 事件长轮询仍可能成功返回             | 服务层重新校验凭证；正在等待的轮询也返回 401，并清理监听器                                              |
| 旧示例监听器把含私人上下文的项目快照交给公共事件处理程序       | 公共处理输入过滤私人文件、私人办公室动态和单独对话；办公室专用处理仍允许主人自己的上下文                |

上述前五项均先通过测试复现，再验证修复。新增六项权限/输入回归测试位于 `tests/permissions.test.ts`，最后一项覆盖下述压缩请求防护。

## 当前权限边界

| 内容或操作                                     | 允许的身份                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| 项目内容                                       | 已加入项目的人；AI 凭证只能用于绑定项目，并继续受下面的内容权限约束   |
| 会议记录与参会                                 | 所有人类项目成员；AI 需要其主人批准对应会议                           |
| 追加会议邀请、暂停或结束会议                   | 会议主持人或项目创建者                                                |
| 处理人的邀请                                   | 被邀请者本人                                                          |
| 批准或撤回 AI 参会、配置 AI 对话、撤销 AI 凭证 | 该 AI 的主人                                                          |
| 共享文件                                       | 项目成员及项目内有效 AI；修改需校验文件版本，只有文件主人能改变可见性 |
| 私人文件、私人办公室消息                       | 主人本人及主人在该项目的有效 AI；项目创建者不能越权读取别人的私人内容 |
| 单独 AI 对话历史                               | 原提问者、目标 AI 及该 AI 的主人；同主人其他 AI 无权读取              |
| 单独对话中的人类提问、失败请求重试             | 原提问者；查看权限不等于代发权限                                      |
| 任务验收为 done、重新打开已验收任务            | 人类项目成员                                                          |
| 确认或拒绝决议                                 | 项目创建者或对应会议主持人                                            |

身份来自登录会话或 AI 凭证，不采用请求中自报的 owner/actor。HTTP 和 MCP 共用业务权限检查。现有集成测试继续覆盖跨项目访问、身份伪造、私人文件与事件隔离、同主人 AI 间的对话隔离及 MCP 身份验证。

会议邀请当前是通知和 AI 授权机制：**人类项目成员即使没收到邀请，也能进入该项目的会议**。项目成员目前没有只读角色，也没有成员移除和项目邀请链接即时撤销功能；加入项目的链接限 24 小时、最多 20 次使用。若产品要求私密会议、访客只读或即时踢出成员，需要增加对应服务端权限，不能只隐藏界面入口。

## 依赖与输入防护

本次 npm 扫描发现两个高危拒绝服务通告，已升级并验证兼容：

- `body-parser` 升到 2.4.0，并在 Express JSON 解析器设置 `inflate: false`，压缩请求直接返回 415。[维护者通告](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)
- Zod 升到 4.6.7，同时将 MCP SDK 升到 1.32.2，HTTP 与真实 MCP 客户端集成测试通过。[漏洞通告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)、[维护者修复](https://github.com/colinhacks/zod/pull/6652)

`npm audit` 本轮结果为 0 个已知漏洞；这只反映扫描时已收录的依赖通告。

## 仍需理解的限制

- AI 凭证代表其主人在指定项目内的 AI 身份，能读取主人的私人办公室和私人文件，目前没有按工具细分的只读凭证。凭证应只交给主人信任的客户端。
- 2026-10-27 新增的[本地工作目录 MCP](local-workspace.md)只限制其自身的本机文件工具，按私人/固定任务会话区分读写授权，不改变远程 AI 凭证的项目权限，也不限制整个客户端的原生终端能力。公共问答连接器不挂载本地目录。生成的接入提示词改为引用本地凭证文件，不再包含凭证明文。
- 统一接入使用[十分钟配对码和主人确认](connection-setup.md)。长期凭证在客户端生成，服务端只保存散列。各连接拥有独立凭证；取消一个连接不替换其他连接的凭证，并对正在等待的读取重新检查。确认意味着授予该 AI 原有的项目访问权限，并非只读授权。
- 内置问答连接器不提供工具，只发送当前问题的受限上下文和共享文件。自定义本地处理程序不是沙箱；若自行接入带工具、文件或私人记忆的代理，需要在运行环境限制它的权限，提示词不能提供隔离保证。
- 撤回授权阻止后续服务端读取和回复，无法收回已下载的数据，也不会中止已经发给模型服务的请求。
- 服务端运营者能访问 SQLite，没有端到端加密。公开部署仍需配置 HTTPS、正确的 PUBLIC_ORIGIN / 安全 Cookie 和可信反向代理；当前本地预览不能证明生产部署配置正确。

## 验证

- `npm test`：51 项通过，含六项新增回归测试。
- `npm run check`：通过。
- `npm audit`：0 个已知漏洞。

构建和浏览器撤权操作的最终结果同时记录在仓库的 `design-qa.md`。

## 聊天记录扩展（2026-10-28）

新增历史分页、自动摘录、原文定位和导出，均复用具体会话的服务端权限，不能用历史入口读取其他办公室或同主人其他 AI 的单独对话。个人分组、归档和可恢复移除不改变成员权限；个人移除不阻止其他成员或 AI 读取原文。只有本人能撤回自己及自己 AI 的发言，只有会话管理者能配置正文保留期限。

撤回或到期会清空正文、清理事件副本及摘录缓存，并使会话内正在处理的回复租约失效。已被客户端读取、引用、模型接收或导出的内容不能收回。SQLite 快照包含私人内容与鉴权数据，只保存在运营者可读的目录，不提供整库下载 API；旧快照不随正文撤回改写，恢复旧库可能恢复旧凭证和正文。详见[记录、清理与恢复边界](chat-history.md)。

新增回归检查覆盖超过 200 条分页、稳定游标、跨用户及同主人 AI 隔离、原文权限、撤回和租约、个人隐藏、保留策略及在线备份恢复。完整测试及界面验收记录见 `design-qa.md`。

## Git runner (2026-10-28)

Git is executed only by a separately owner-approved local device, never the web server or public question connector. Browser enqueue and private results are owner-only; remote AI tokens need an additional machine credential to use local endpoints. Typed actions, fixed workspace/branch/origin, explicit path staging, snapshot checks, separate publish grant, task-state rechecks, common-repository locks, no hooks/external diff/signing, and no token inheritance are covered by `tests/git.test.ts`. Real runner/stdio MCP and temporary bare-remote operations are exercised. Timed-out claims become uncertain and are never replayed; receipt retries are idempotent. Preview data reaches the owner-only server DB/backups. Worktrees and path filtering are not OS isolation or a full secret scanner. Publication includes branch history, and revocation cannot undo an already-started Git operation or push. See [full Git boundaries](git-workflow.md).
