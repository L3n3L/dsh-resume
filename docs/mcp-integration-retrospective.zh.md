# dsh-resume MCP 对接复盘与实施方案

> 状态：工作区绑定方案已实现，进入运行态验收
> 日期：2026-08-28
> 基线：`353f576 fix: persist resume presentation overrides`
> 仓库：`E:\vsws\deepseek-harness-plugins\1-插件源码\dsh-campus-job`

## 1. 本次复盘结论

MCP 可以作为 dsh-resume 的常驻能力，但不应替换现有 DSH 工作台，也不应把 MCP 服务直接耦合进 `index.js` 的插件初始化流程。

这里的“通用”只指通信协议：服务使用标准 MCP，便于不同宿主桥接；业务能力仍然是 dsh-resume 专用的简历、模板、A4 渲染、排版和图标工具，不建设通用文件管理或通用代码执行平台。

最终采用“双通道、共享核心”的结构：

```text
左侧栏 / 设置页
    ├─ 简历预览、模板、手动微调（现有 DSH UI）
    └─ MCP 状态、启动、停止、诊断（新增控制入口）
                    ↓
              MCP 常驻服务
                    ↓
              共享 lib/ 核心
```

左侧栏是用户入口和控制面板；第一版由 DSH 的本地 Web Server 挂载 MCP HTTP 端点，按钮只负责显式启停端点，不会随插件加载自动启动。独立 `npm run mcp` 仍保留为 stdio 宿主的手动入口。MCP 不可用时，DSH 工作台必须继续独立运行。

## 2. 调研依据

OpenAI 的插件能力模型支持由插件组合 Skill、MCP Server 和可选 UI；这与“左侧栏控制 + MCP 常驻 + Skill 编排”的方案一致：

- [OpenAI Developers](https://developers.openai.com/)：插件可扩展 Skills、MCP servers 和可选 UI。
- [Responses API tools](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)：工具体系支持 MCP、函数工具和 CLI 工具。
- [Latest model guidance](https://developers.openai.com/api/docs/guides/latest-model)：减少重复上下文、简化工具描述和控制返回结果，有助于降低 token 消耗。

官方资料确认了能力组合，但没有替当前 Codex Desktop 固定一个本地 MCP 服务配置格式。因此第一阶段必须包含真实宿主 smoke test，不能只凭静态配置假设“常驻”已经可用。

## 3. 当前仓库审计

### 已具备的能力

- [index.js](../index.js) 通过 `apply(ctx)` 注册 DSH 工具、系统提示词、Web Server 路由和内置 Skill。
- [client/client.js](../client/client.js) 已注册 `sidebar.footer.action` 和 `settings.section`，并且已有预览、模板、手动调整、字体/行距/图标微调界面。
- [lib/renderer.js](../lib/renderer.js) 负责 Markdown、模板、A4 预览和排版指标，适合作为 MCP 复用的渲染核心。
- [lib/workspace.js](../lib/workspace.js)、[lib/quality.js](../lib/quality.js)、[lib/layout-schema.js](../lib/layout-schema.js) 已提供工作区、质量检查和布局校验能力。
- 当前 DSH 回归、MCP 握手和跨进程锁测试通过；本次对接改动尚未提交。

### 需要保持的边界

- DSH 启动时不启动 MCP；MCP HTTP 处理器只在用户点击“启动 MCP”后创建。
- MCP 是插件内的领域专用旁路能力，不承诺向未安装该插件的所有 Agent 自动注入工具。
- MCP 不能修改 `apply(ctx)` 的注入列表和现有工具命名。
- `lib/` 中被 MCP 复用的函数必须保持无 UI 副作用、路径受控、结果可序列化。
- DSH UI 和 MCP 不允许对同一个简历文件进行无锁并发写入。
- 工作区必须由用户在插件页显式选择并绑定为全局当前工作区；HTTP MCP 只能跟随当前选择，不能通过 `rootDir` 静默换目录。
- 工作区身份写入 `.dsh-workspace/workspace.json`，全局当前工作区和最近列表写入 DSH_HOME 下的 `dsh-resume/workspace-bindings.json`，换会话和重启后恢复。
- `mcp-server` 进入发布包，既可作为独立 stdio 入口，也被 HTTP 控制层复用；DSH 不启用 MCP 时不会创建 MCP Server 实例。

## 4. 左侧栏设计

左侧栏新增“工作区”和“MCP 服务”入口。工作区入口负责目录选择与绑定，MCP 入口只做服务状态和生命周期控制，不把所有 MCP 工具堆成按钮。

### 工作区状态

| 状态 | 用户看到的内容 | 可用操作 |
| --- | --- | --- |
| 可用 | 当前名称、绝对路径、稳定 ID | 打开、恢复默认 |
| 未初始化 | 目录存在但还没有简历骨架 | 新建并绑定 |
| 不存在 | 绑定目录已被移动或删除 | 选择新文件夹、恢复默认 |
| 已有其他文件但没有简历 | 文件数量提示和确认条 | 确认登记（只写工作区清单）、取消 |

切换工作区是用户侧动作。切换后 DSH 预览、模板、文件监听和 HTTP MCP 使用同一目录；不会删除原工作区文件。用户不需要输入绝对路径，普通流程复用 DSH 自己的工作区选择器和最近工作区列表。

工作区选择的保护规则：空文件夹会自动准备基础文件；已有 `resume.md` 的目录直接绑定；已有其他文件但没有 `resume.md` 的目录不会被静默初始化，先让用户确认，确认后只登记工作区身份，不覆盖或补写原文件；DSH 文件夹选择器取消时保持原工作区不变。正在编辑且有未保存 Markdown 草稿时，切换前会再次确认，避免草稿被误丢弃。插件服务端不再自行启动 PowerShell 或其他 OS 选择器，只接受 DSH 已选中的绝对路径。

版本管理与工作区绑定：`resume.md` 是主简历内容源，投递版本保存在 `companies/<岗位>/resume.md`；每次「保存版本」同时记录内容路径、模板 ID、字体/字号/行距/页边距、视觉 Token 和图标微调。旧工作区只有预览文件时会显示为“尚未保存版本记录”，首次保存才写入版本登记；改名不改路径，归档不删除原文件。

排版草稿与共享模板解耦：手动调整、AI 试调和模板 CSS 编辑默认只更新当前页面的临时草稿。普通排版参数在版本保存时写入简历版本；模板结构/CSS 只有在用户确认保存时才复制成新模板。打印可直接按已保存模板输出，也可先提交草稿为新模板，不能静默改变其他简历的模板。

### 状态展示

| 状态 | 用户看到的内容 | 可用操作 |
| --- | --- | --- |
| 未启动 | MCP 未启动 | 启动 |
| 启动中 | 正在创建本地端点 | 等待 |
| 运行中 | 端点已启用、版本可见 | 重启、停止、刷新状态 |
| 异常 | 最近一次错误和时间 | 重试、复制诊断 |
| 停止 | 服务已停止 | 启动 |

默认策略：插件加载后 MCP 保持停止，只有用户在左侧栏明确点击“启动 MCP”才拉起；用户主动停止后不自动重启。可以持久化用户的界面偏好，但不把“上次运行中”当作下次自动启动授权，也不把密钥或完整简历内容写入设置。

### 入口职责

- 显示 MCP 是否健康；
- 启动、停止、重启服务；
- 刷新一次服务状态；
- 展示最近错误和版本信息；
- 通过 MCP 工具契约区分只读和明确写入操作。

手动调整仍然保留在“预览 → 手动调整”中。字号、行距、字体、页边距、图标大小和上下位移属于视觉设置，不写回 Markdown。

## 5. MCP 第一阶段工具契约

第一阶段先提供少量粗粒度、可验证的工具：

| 工具 | 默认权限 | 作用 |
| --- | --- | --- |
| `resume_init` | 创建缺失文件 | 初始化工作区骨架，不覆盖已有文件 |
| `resume_guide` | 只读 | 返回简历制作工作流、权限、内容质量、图标和排版规则 |
| `resume_read` | 只读 | 读取工作区内允许的文本文件 |
| `resume_write` | 明确写入 | 写入 md/css/txt/json，并校验简历图标 token |
| `resume_check` | 只读 | 检查简历结构、联系方式、过长要点和证据缺口 |
| `resume_render` | 生成预览 | 使用指定模板渲染 A4 预览，不代表导出 PDF |
| `resume_metrics` | 只读 | 读取页数、溢出、留白、模块和视觉审计结果 |
| `layout_validate` | 只读 | 校验 `resume.layout.json` |
| `template_list` | 只读 | 列出内置模板和已保存模板 |
| `template_validate` | 只读 | 校验模板结构和 CSS 边界 |
| `icon_list` | 只读 | 查询可用图标 slug，避免模型编造图标名 |
| `workspace_info` | 只读 | 返回当前 HTTP MCP 绑定的工作区身份和路径 |

写入能力后置。进入第二阶段后，写入工具必须要求明确目标路径和操作意图，并继续复用现有工作区锁；不提供泛化的 `write_file` 工具。

## 6. 生命周期与并发原则

```text
插件加载
  → 左侧栏显示“未启动”
  → 用户点击“启动 MCP”
  → 宿主启动/连接 MCP
  → 健康检查
  → 左侧栏显示状态
  → MCP 调用共享核心
  → 退出或用户停止
```

必须满足：

1. 同一工作区最多一个受控 MCP 实例。
2. 健康检查超时不阻塞 DSH 预览和主对话。
3. MCP 重启期间，现有预览和手动调整仍可用。
4. 所有写入继续经过 `withWorkspaceLock`；该锁同时提供进程内排队和跨 Node 进程的工作区目录锁。
5. 服务异常时返回结构化错误，不把 Node 堆栈直接展示给用户。
6. MCP 返回摘要、指标和路径，不默认返回完整 Markdown、完整 HTML 或整段历史对话。

## 7. 对 token 和质量的实际判断

MCP 本身不会自动省 token。节省来自：

- 用 `resume_metrics` 直接取结构化指标，而不是让模型反复读取整份 HTML；
- 用 `template_list` 和 `icon_list` 查询有限结果，而不是把整个目录注入上下文；
- 用短 `initialize` 规则引导首次调用 `resume_guide`，把完整攻略按需放入上下文；
- 工具描述短、参数稳定、结果可预测；
- Skill 只负责调用顺序和决策规则，不重复复制所有项目说明。

如果 MCP 暴露过多细粒度工具、返回完整文件或每次都携带全量状态，token 消耗可能反而上升。因此工具数量和返回体大小属于验收指标，不只是实现细节。

## 8. 分阶段实施

### 阶段 0：边界和宿主验证（当前）

- [x] 检查插件 Git 仓库干净；
- [x] 确认左侧栏和设置页已有挂载点；
- [x] 确认共享核心与 DSH 入口边界；
- [x] 完成本文档；
- [ ] 验证当前 Codex Desktop 是否能读取左侧栏显示的本地 MCP 端点并完成真实连接；
- [x] 确认第一版采用“标准 MCP 协议 + 简历领域专用工具”，不做通用 MCP 平台；
- [x] 新增独立 stdio MCP 入口和基础工具 smoke test；
- [x] 确认 MCP 入口进入 npm 发布包，但不进入 DSH 运行时 import 图；

### 阶段 1：最小 MCP 常驻服务

- [x] 新增独立 `mcp-server/` 入口；
- [x] 实现健康检查、`resume_check`、`resume_render`、`resume_metrics`、`layout_validate`、`template_list`、`icon_list`；
- [x] 增加 `initialize` 核心规则和 `resume_guide` 按需工作流指南；
- [x] 补齐 `resume_init`、`resume_read`、`resume_write`，形成 MCP 最小简历制作闭环；
- [x] 使用标准 MCP 基础工具能力，不自动接入 DSH 主初始化链路；
- [x] 左侧栏显示状态并提供手动启动/停止/重启；
- [x] 增加 DSH 回归测试和 MCP 握手/工具发现 smoke test；
- [x] MCP 写入复用工作区跨进程锁，避免与 DSH 并发覆盖；
- [x] 跨 Node 进程锁测试通过，模拟 DSH 与 MCP 同时访问同一工作区；
- [x] 增加工作区清单、全局绑定、原生文件夹选择入口和 HTTP MCP rootDir 边界；
- 不修改现有 DSH 工具语义。

### 阶段 2：Codex Skill 编排

- 增加 MCP 调用顺序和错误处理规则；
- 让 Codex 先检查、再渲染、再读取指标；
- 保持“建议/预览/应用”三种操作模式；
- 所有写入继续要求明确意图。

### 阶段 3：常驻体验完善

- 自动重启和退避；
- 工作区切换与实例隔离；
- 只读/可写模式；
- 诊断日志和版本信息；
- 再评估是否需要将 MCP、Skill 和 UI 一起打包为 Codex Plugin。

## 9. 阶段 1 验收标准

### 不破坏 DSH

- DSH 插件正常加载；
- 现有预览、模板、手动调整和 AI 助手不受影响；
- `npm test` 全部通过；
- MCP 不启动时，DSH 仍可独立使用。

### MCP 可用

- 能从左侧栏查看服务状态；
- 启用后能启动并完成健康检查；
- 重启后不会产生重复实例；
- 能对当前工作区执行检查、渲染和指标读取；
- 首次使用时能通过 `resume_guide` 获得完整制作攻略；
- MCP 故障不会卡住预览页面；
- 返回结果不包含不必要的整份文件和会话上下文。

### 用户体验

- 手动微调入口仍然最快可达；
- 图标大小和上下位移仍能实时预览；
- MCP 状态异常有明确提示和恢复动作；
- 用户能明确知道哪些操作只读、哪些操作会写文件。

## 10. 当前不做的事情

- 不在 DSH `apply(ctx)` 中自动启动 MCP；路由注册是惰性的，实例创建由左侧栏控制；
- 不让 MCP 取代左侧栏已有的手动微调；
- 不增加泛化文件写入工具；
- 不在尚未验证宿主生命周期前承诺“关闭 Codex 后服务永远常驻”；
- 不为节省 token 把完整简历内容拆成大量细粒度工具调用。

## 11. 本地验证方式

在插件目录执行：

```sh
npm test
npm run mcp
```

左侧栏控制的是 DSH 本地 Web Server 上的 Streamable HTTP 端点 `/dsh-resume/mcp`。端点默认返回 503，直到用户点击“启动 MCP”；停止后不会自动重启。连接后，支持该字段的宿主会收到短版 `initialize` 规则；所有兼容基础 tools 的宿主都可以通过 `tools/list` 发现并调用 `resume_guide`，因此不依赖客户端是否展示 `initialize.instructions`。`npm run mcp` 使用 stdio 承载同一套工具，适合明确配置为 stdio 的宿主，标准输出只保留 JSON-RPC 消息，日志写入标准错误。浏览器代码不直接执行 Node 进程。

当前 smoke test 已覆盖 `initialize`、`notifications/initialized`、`tools/list`、`mcp_health`，以及初始化工作区、写入/读取简历、检查和渲染的最小闭环。浏览器 A4 指标仍由 DSH 预览运行时产生，独立 MCP 进程目前只返回明确的 pending 状态，不伪造页数或溢出结论。

## 12. 下一步

下一步是完成当前宿主的真实连接验证，并补充连接配置的用户指引。若当前 Codex Desktop 无法直接读取本地 HTTP 端点，则保留同一套共享核心和工具契约，改用用户明确启动的 stdio 服务管理器连接；不会回退或破坏现有 DSH 工作台。

第一版的兼容目标是“任何支持基础 MCP tools 的宿主都能连接这个简历专用 Server”，而不是让所有 Agent 在未安装或未启用插件时自动获得能力。
