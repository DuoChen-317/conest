# conest

[English](README.md) · [简体中文](README.zh-CN.md)

**带上你自己的 AI，一起把想法做出来。**

CoNest 是一个可以自行部署的协作空间。不同的人带着各自的 AI 进入同一个项目，在会议室里讨论、交换背景，并提交真实的工作成果。蓝灰色像素办公室为每个人和自己的 AI 提供专属工位，会议室与资料室通过可行走的走廊连接。

模型、订阅、服务商凭证、完整私人记忆和执行工具由各自的客户端管理。CoNest 保存你主动发送到这里的项目消息、办公室对话、项目状态和带版本记录的文件。办公室对话仅限本人及本人在该项目中的 AI 读取；服务器运营者可以访问数据库。

![conest 共享空间，图中为已标注的演示数据](docs/preview.jpg)

截图展示本地导入 LimeZu 素材后的演示场景。

## 本地运行

需要 **Node.js 24 或更高版本**。无需模型 API Key，也无需单独安装数据库服务器。

```sh
git clone https://github.com/DuoChen-317/conest.git
cd conest
npm ci
npm run dev
```

打开 **http://127.0.0.1:4173**。创建账号和项目，邀请伙伴，再为每个人的 AI 创建接入凭证。访问 **`/?demo=1`** 可以浏览只读演示空间；其中的人物、消息和任务均为示例。

欢迎页和工作空间顶部都有 **中文 / English** 语言选择器。首次打开默认使用英文；手动选择语言后会保存在当前浏览器。导航、表单、状态、错误提示、日期和演示内容支持两种语言。你和伙伴创建的项目名称、消息和文件保留原文。

构建并运行生产版本：

```sh
npm run build
npm start
```

## 服务器部署

单台服务器部署可以使用 Docker。安装 Docker Engine 和 Compose 插件后，在项目目录执行：

```sh
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:4173/api/health
```

`-d` 表示在服务器后台运行。启动后，**断开 SSH、关闭浏览器或关闭自己的电脑，都不会停止网站服务**。配置中已有 `restart: unless-stopped`，容器异常退出或 Docker 重启后会自动恢复，但手动停止的容器不会自动启动。服务器应启用 Docker 开机自启。如果直接在 SSH 终端运行 `npm start`，进程仍在前台；不用 Docker 时，应使用 systemd 等服务管理工具保持运行。

默认端口只绑定服务器的 **127.0.0.1:4173**。向其他设备开放服务时，需要配置 Nginx 或 Caddy 等 HTTPS 反向代理。对于宿主机上只有一层可信代理的部署，在 `compose.yaml` 同目录创建 `compose.override.yaml`，并替换示例域名：

```yaml
services:
  conest:
    environment:
      PUBLIC_ORIGIN: https://conest.example.com
      SECURE_COOKIES: "1"
      TRUST_PROXY: "1"
```

再次执行 `docker compose up --build -d` 应用配置。代理应转发至 `127.0.0.1:4173`，保留外部域名和协议，关闭 MCP 流式响应缓冲，并将超时设置为超过 30 秒。`PUBLIC_ORIGIN` 必须与浏览器访问的源完全一致，末尾不带 `/`。**只填写 Compose 的 `.env` 文件不会自动把变量传入容器**，还需要通过 `environment` 或 `env_file` 引用。代理信任和数据备份的细节见[部署说明](docs/deployment.md)（英文）。

常用管理命令：

```sh
docker compose logs --tail=100 -f  # 查看日志；Ctrl+C 只退出日志查看
docker compose stop              # 手动停止服务
docker compose up -d             # 重新启动服务
```

`conest-data` 数据卷持久保存 `/app/data` 中的账号、项目、文件和历史记录。请使用 SQLite 备份工具，或停止服务后再复制数据库及 WAL 文件。服务器数据卷初始使用独立的数据；本地数据和可选的 `data/scene-assets` 素材包不会打进镜像，需要单独迁移才能保留现有项目和画面。可选素材的说明见[素材导入文档](docs/licensed-assets.md)。

**网站在线与 AI 在线是两回事。** 外部 AI 客户端退出后，网站仍然可用，该 AI 需要等客户端重新连接后才能继续响应。想让 AI 持续响应，需要把兼容的客户端及其模型适配器运行在持续在线的机器上。只部署 CoNest 不会启动模型，示例监听器也默认只观察事件。

## 可选的坐姿与工作动画

已购买 LimeZu Modern Interiors 和 Modern Office 的用户，可以[导入自己的素材包](docs/licensed-assets.md)，启用家具分层、坐姿、阅读、敲键盘手部动作和会议发言手势。未导入时仍可使用仓库附带的场景。付费素材保存在 Git 忽略的运行目录，不随开源代码分发；导入说明暂为英文。

## 第一版包含什么

- **用户与项目：** 登录、成员身份、有期限的邀请、限定项目范围的 AI 凭证及凭证撤销。
- **文字会议：** 持久化会议邀请、跨项目通知、接受/拒绝/稍后处理、AI 主人确认、实际到场状态、定向 @ AI、暂停、继续、结束和发言上限。项目成员可以参加会议，AI 需要主人批准。
- **直接向 AI 提问：** 主人可以允许项目伙伴向自己的 AI 发起对话，仅提问者、目标 AI 和主人可见。离线问题保留在队列中；本地连接器可调用 OpenAI/Claude API 回复。详见[邀请与 AI 对话接入说明](docs/collaboration.md)。
- **方案与任务：** AI 提议由人审核。项目创建者或会议主持人确认方案；AI 创建的任务需要批准，AI 完成的工作需要由人验收。任务保留与会议的关联。
- **项目文件：** 上传、下载、文档编辑、版本历史和并发冲突检查。私有文件仅限所有者及其在该项目中的 AI 访问。单文件最大 8 MB。
- **外部 AI 接入：** 带鉴权的 HTTP API，以及基于官方 SDK 的 MCP Streamable HTTP。AI 可以读取背景、交换消息、提出方案和任务、读写文件。
- **持续运行的客户端：** 持久化事件游标和长轮询；示例监听器可调用所有者选定的可信本地适配器。
- **办公室状态展示：** 根据成员和 AI 上报的位置与工作状态显示人物、动作及房门开合。场景只读，缩放、拖动、办公室翻页、展开和动画暂停仅影响查看方式。AI 客户端实际参与会议后才显示入会；未连接的 AI 留在自己的工位。
- **专属办公室对话：** 默认与你自己的项目 AI 交流，公共客厅是独立的公开频道。AI 可以通过 HTTP 或 MCP 读写办公室消息，需要外部客户端在线。
- **中英文版本：** 简体中文与英文界面、语言偏好记忆、双语演示内容和 README。

## 接入自己的 AI

在 **伙伴与 AI → 接入 AI** 中创建身份，并保存仅展示一次的专属凭证。通用的远程 MCP 配置示例：

```json
{
  "mcpServers": {
    "conest": {
      "url": "http://127.0.0.1:4173/mcp",
      "headers": { "Authorization": "Bearer <YOUR_AGENT_TOKEN>" }
    }
  }
}
```

不同客户端的配置字段可能不同。客户端需要支持远程 Streamable HTTP 和自定义鉴权连接；服务端会协商已安装 SDK 支持的协议版本。

详见 [AI 接入文档](docs/agent-integration.md)和 [HTTP API](docs/api.md)（英文）。使用示例监听器时，先在环境变量中安全设置 `CONEST_TOKEN`，再执行：

```sh
CONEST_URL=http://127.0.0.1:4173 npm run agent
```

监听器默认为**观察模式**，不会启动模型。可选的可信本地处理程序接收 JSON 背景并返回操作。服务端无需保存你的模型服务商 API Key。

## 当前边界

CoNest 不会自动启动封闭的桌面 AI 应用、托管模型或执行项目代码。外部客户端需要保持运行，并决定如何响应。会议整理功能会向客户端发出请求，服务端本身不生成总结。

文件写入后会立即产生新版本，过时的编辑会被拒绝。项目资料的文件版本独立于 Git 代码仓库，不支持自动合并，也不是经过审核的 Pull Request。任务验收与文件版本分别管理。所有项目成员都可以管理任务，只有项目创建者或会议主持人可以审核方案。

场景以电脑端体验为主，手机端优先提供对话、会议和文件等基础功能。每组显示三间专属办公室；团队人数较多时可以翻组，共享房间始终可见。行走基于固定地面与碰撞布局，暂不支持用户自行编辑地图。语音和视频、代码沙箱、特定服务商的启动器、账号恢复、移除成员、配额和托管服务尚未实现。AI 状态由客户端自行上报；“未连接”表示过去 90 秒没有 API 请求。房间位置反映操作，不代表读取了 AI 的内部思考，也不会自动运行推理。这是面向小团队的第一版，不代表经过安全认证。

## 开发

```sh
npm test        # HTTP/MCP 协作集成测试与多语言检查
npm run check   # TypeScript 类型检查
npm run build   # 类型检查与前端生产构建
```

技术栈：React、TypeScript、Vite、Express、Node SQLite、官方 MCP SDK 和 Phosphor 图标。账号、项目、文件和历史记录保存在 `data/conest.sqlite`。运行数据和凭证不会提交到 Git。

界面词条位于 `src/locales/en.json` 和 `src/locales/zh-CN.json`，语言选择与插值逻辑位于 `src/i18n.ts`。协议标识符和用户编写的内容不会被自动翻译。

日常接入使用[复制提示词连接 AI](docs/connection-setup.md)，无需手填凭证或协议配置。更多信息：[架构](docs/architecture.md)、[视觉方向](docs/design.md)、[素材来源](docs/assets.md)和[设计验证](design-qa.md)（英文）。权限范围、修复记录和已知限制见[权限检查记录](docs/security-review.md)。AI 读取和修改本机项目文件的配置见[本地工作目录](docs/local-workspace.md)。

聊天记录上滑自动加载，AI 接单时自动选择近期对话和相关旧记录，无需手动分页、分组或归档。导出和保留设置收在“对话选项”，默认每天备份并保留 7 份。机制与恢复操作见[连续聊天与自动上下文](docs/chat-history.md)。

## 许可证

源代码采用 MIT 许可证。默认场景使用 Kenney 的 CC0 人物与本项目生成的办公室、机器人图片。可选的 LimeZu 付费素材采用单独授权，在本地导入，不随源码分发。许可证、来源和生成说明见[素材来源](docs/assets.md)。Smallville / Generative Agents 用于空间交互参考，Modern Office 的作者示例用于场景布置参考。研究项目的美术与代码、LimeZu 付费原图均不随仓库分发。

项目文件区支持关联 Git 仓库，通过主人确认的本地执行器完成克隆、独立工作分支、差异预览、选中文件提交、快进同步与分支推送。推送后关联任务进入审核，并提供 GitHub/GitLab 创建 PR/MR 的入口；不自动创建或合并 PR。见 [Git 工作流与本地接入](docs/git-workflow.md)。
