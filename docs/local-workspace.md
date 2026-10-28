# 项目本地工作目录

CoNest 提供一个独立的本地 stdio MCP 服务，把 AI 的文件读写限制在主人选择的工作目录内。它运行在文件所在的机器上，不在 CoNest 网页服务器上；网页只能生成配置，不能扫描磁盘或替用户完成绑定。当前支持 Node.js 24+ 的 macOS / Linux 环境。

它提供真实的文件工具，但不自动执行任务，也不会把网页办公室消息自动接到这些工具上。主人需要在本地 AI 客户端的独立私人或任务会话中启用该服务。默认自动问答连接器继续只使用 CoNest 提供的有限上下文，不加载本地目录或此 MCP。

## 本地绑定

在“连接 AI → 高级设置与本地目录 → 本地工作目录（可选）”填写绝对路径、选择私人会话的权限，再生成高级配置提示词。路径只存在于本次界面和生成内容里，不提交给服务端或保存在浏览器存储中；关闭面板后需要重新填写。生成内容只引用凭证文件路径，不包含凭证明文。日常工具接入使用[统一接入提示词](connection-setup.md)，不需要先配置本地目录。

在本机准备独立配置目录，例如 `~/.config/conest/my-project/`。使用本地编辑器把已有 AI 凭证写入 `credential` 文件，不要把凭证粘贴到聊天中。把下面配置保存为 `workspace.json`，替换 URL、ID 和绝对路径：

```json
{
  "version": 1,
  "url": "https://conest.example.com",
  "projectId": "YOUR_PROJECT_ID",
  "agentId": "YOUR_AGENT_ID",
  "root": "/Users/you/projects/my-project",
  "tokenFile": "/Users/you/.config/conest/my-project/credential",
  "officeAccess": "read",
  "tasks": []
}
```

配置和凭证必须由当前用户拥有、权限为 `0600` 或更严格，并放在工作目录之外。服务会验证这些条件，拒绝凭证文件的符号链接或硬链接。`officeAccess` 可选 `read`、`read-write`、`none`；默认只读。

```sh
chmod 700 ~/.config/conest/my-project
chmod 600 ~/.config/conest/my-project/workspace.json ~/.config/conest/my-project/credential
```

在客户端的**独立私人会话**配置本地 MCP。以下是通用配置示例，替换为本机 CoNest 仓库和配置文件的绝对路径；具体字段以客户端为准：

```json
{
  "mcpServers": {
    "conest-private-workspace": {
      "command": "/absolute/path/to/conest/node_modules/.bin/tsx",
      "args": [
        "/absolute/path/to/conest/examples/workspace.ts",
        "--config",
        "/Users/you/.config/conest/my-project/workspace.json",
        "--scope",
        "office"
      ]
    }
  }
}
```

也可以从仓库目录用 `npm run --silent workspace -- --config /absolute/path/workspace.json --scope office` 启动。它等待客户端通过 stdin/stdout 发送 MCP 请求，不是后台轮询程序；客户端结束连接后应终止对应进程。启动和每次工具调用都会验证凭证对应的项目和 AI，无法访问 CoNest 时拒绝文件操作。

## 已批准任务

任务访问需要同时满足两份授权：

1. CoNest 上的人将任务批准为 `todo` / `in_progress`，并明确分配给这个 AI。
2. 主人在本地 `workspace.json` 中授予该任务指定子目录的读写权限。

例如添加：

```json
{
  "id": "TASK_ID",
  "paths": ["src", "tests"],
  "access": "read-write"
}
```

将该对象加入 `tasks` 数组。`paths` 为相对工作目录的路径；明确填写 `.` 才表示整个工作目录。`access` 可选 `read` 或 `read-write`。

为任务单独启动会话：把 MCP 的 `--scope office` 两个参数替换为 `--task TASK_ID`，不能同时指定两种模式。进程绑定的任务无法由模型在工具参数中切换。该会话只有获准路径的文件工具，不能读取其他任务的目录。先调用 `get_local_workspace` 获得授权路径，再在这些目录中列文件。

每次操作重新读取本地授权并校验服务端任务状态。删除本地任务授权、取消分配、提交审核或标记完成，都会拒绝之后的读写。修改私人会话权限同样立即生效；改变绑定目录、项目、AI 或凭证文件路径，需要重启服务。已经返回给客户端的内容无法收回。

## 可用工具

| 工具                  | 行为                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `get_local_workspace` | 查看当前会话的授权路径和模式，不返回凭证明文或磁盘绝对路径                            |
| `list_local_files`    | 列出指定目录最多 200 个条目，不递归扫描整个项目                                       |
| `read_local_file`     | 读取 UTF-8 文本，单文件最多 64,000 字节，返回内容版本散列                             |
| `write_local_file`    | 需本地读写授权；修改时携带先前读取的 `baseVersion`，新文件用 `null`，父目录必须已存在 |

不提供终端、运行命令、删除文件或创建目录的工具。普通文件更新通过同目录临时文件替换，版本不匹配时拒绝覆盖。符号链接、硬链接、目录越界、隐藏路径、`node_modules`、常见密钥和数据库文件均被拒绝。不要在 AI 正在写入时并发修改同一个文件；版本检查不等于对任意外部编辑器的事务锁。

本地读写不会自动上传文件，也不会向留言板发内容。但是工具返回的文件正文会进入当前 AI 会话，可能发送给该会话使用的模型供应商；这和“磁盘文件不自动上传到 CoNest”是两件事。

## 会话隔离边界

| 场景                   | 本地目录能力                                        |
| ---------------------- | --------------------------------------------------- |
| 主人的独立私人会话     | 使用 `--scope office`，按本地 `officeAccess` 限制   |
| 明确批准的独立任务会话 | 使用固定的 `--task`，按本地子目录和实时任务状态限制 |
| 伙伴单独提问、会议点名 | 保持不挂载本地 MCP 的有限上下文问答连接器           |

远程 CoNest MCP 不提供这些 `local` 文件工具；本地服务只通过 stdio 连接，不监听网络端口，也不提供公共发言工具。配置中的 `office` 是启动者选择的私人客户端模式，不是根据网页角色位置推断的授权；共享问答请求不能被送进这个私人会话。

**它限制的是本地 MCP 文件工具，不是整个客户端的操作系统权限。**如果同一个 AI 客户端还具备原生文件、终端、其他 MCP 或私人记忆，仍可能绕过这个工具的边界。不要将私人 MCP 全局挂载到处理外部消息的客户端，也不要让外部请求使用带原生文件工具的自定义处理程序。需要对不可信代理提供完整隔离时，应另行使用受限账号或容器；此版本不声称提供那种沙箱。拥有相同用户权限的本地恶意进程也不在这个文件服务的隔离保证内。

## 凭证文件用于原有连接器

`npm run connector` 和 `npm run agent` 也支持 `CONEST_TOKEN_FILE=/absolute/path/credential`。同时设置旧的 `CONEST_TOKEN` 时优先读取文件；文件不可读或权限不安全时失败，不会退回环境变量。模型供应商凭证仍只在本机配置，业务处理子进程不继承 CoNest 凭证或凭证路径。

## Git 仓库

Git 另有独立设备接入、出站执行器和私人 MCP，见 [Git 工作流](git-workflow.md)。Git 授权覆盖整个仓库，不能把本文件服务的子目录权限当作 Git 的隔离边界。自动创建的 worktree 是新的实际工作目录，文件编辑工具需要针对该目录单独授权；不会自动迁移已有文件授权或未提交改动。
