# dsh-resume 提测验收与问题定位

> 验收日期：2026-08-22  
> 验收版本：3b50387 fix(resume): refresh previews without task timeouts  
> 验收环境：Windows、DeepSeek Harness Web、http://localhost:3100/、Node.js 22、当前工作区 E:\deepseek-harness\jobhunt

> 本轮修复状态：工作树已补回普通入口的 HTML/PDF 操作、previewRel/renderId 指标关联、重启后的默认预览恢复、A4 白底和三栏空间调整，并已接入 Harness 的真实历史分页与结构化任务节点；以下问题单保留首轮证据，并在对应条目中标记当前状态。尚未提交。

## 1. 结论先行

结论：当前工作树仍不建议作为稳定版直接对外发布，但首轮的导出入口、指标串页、历史分页和结构化任务流问题已经进入修复状态；剩余阻断集中在首屏密度、metrics ready 等待协议和最终导出黑盒验证。

基础工作台可以打开，模板库、模板工坊、Markdown 编辑、A4 预览、手动调节和 AI 助手入口都能看到；但是用户完成“打开插件 → 看效果 → 调整 → 导出”的主任务仍然有明显断点：

1. 首轮验收时普通插件入口看不到“下载 HTML / 确认并导出”；本轮已补回两个动作，但 PDF 弹窗策略仍需在真实浏览器确认。
2. 首次看到的五个内置模板全部是“一页但留白过多”，实测留白约 54%～70%，与产品承诺的“刚好一页”相反。
3. jobhunt_render 完成后，浏览器 iframe 加载和指标回传仍是异步流程，Agent 仍可能在指标尚未到达时拿到 pending；本轮增加了 renderId 和 previewPath 关联，但还没有真正的 ready 等待协议。
4. 指标回传闭包和旧页面串联问题已修复为按 iframe 回传的 previewPath 校验；仍需多投递版本黑盒复验。
5. AI 助手已优先调用 Harness `Session.loadOlder()`，依据 `snapshot.hasMore/loadingOlder` 做真实分页；仍需在有多轮历史的真实会话中做浏览器黑盒复验。
6. 首轮安装包不包含 README 引用的三张效果图且没有自动化测试命令；本轮已补包体 docs 和最小 node:test 冒烟，但仍需要持续增加浏览器回归。

这不是“换皮肤还不够好看”的问题，而是“投递闭环和状态可信度”尚未达到可发布标准。

## 2. 已执行的验收范围

| 场景 | 结果 | 备注 |
| --- | --- | --- |
| 从 Harness 打开“求职简历” | 通过 | 可以进入全屏插件面板 |
| 首次使用/开始页 | 通过 | 能看到“已有简历 / 从零开始 / 示例”三种入口 |
| 预览页与固定 A4 | 通过但效果不达标 | 页面尺寸固定为 794×1123；示例内容过稀 |
| 模板库 | 通过 | 5 个模板可见，可选择，不会立即跳离当前页 |
| 模板切换 | 通过但结果不达标 | 切换后仍是一页，但留白严重 |
| 手动调整入口 | 通过 | 可见字号、行高、间距、边距、撤销、默认值 |
| Markdown 编辑与草稿预览 | 通过 | 能编辑并出现草稿实时渲染提示 |
| AI 助手入口 | 通过但历史为空 | 可以打开，当前新会话没有任务流内容 |
| 模板工坊 | 通过 | TemplateSpec JSON、保存、复制、版本入口可见 |
| 投递版本 | 通过 | 能列出 preview.html |
| 排版检查 | 通过但静态感较强 | 可显示规则评分与提醒 |
| 主对话历史镜像 | 未完成验收 | 当前浏览器会话没有成功切换到已有历史会话 |
| 真实 AI 长任务 / Question | 未执行 | 避免在用户工作区无授权触发模型任务；以代码审查补充风险 |
| HTML 下载 / PDF 导出 | 部分通过 | 普通入口按钮已补回；HTML 文件和浏览器打印结果仍需真实文件级验收 |
| 重启后恢复 | 部分通过 | API 可恢复文件列表，但内存中的预览指针/指标会丢失 |
| JS 语法检查 | 通过 | index.js、client/client.js、lib/preview-api.js、lib/renderer.js 均通过 node --check |
| 包体检查 | 通过 | npm.cmd pack --dry-run --json 已包含 docs/screenshots |
| 自动化测试 | 通过最小集 | npm.cmd test 当前 3/3 通过 |

## 3. P1：提测前必须处理

### QA-001：普通插件入口没有导出动作

> 当前状态：已补回入口按钮，待真实下载文件和 PDF 打印结果复验。

- 严重级别：P1，主流程阻断
- 用户影响：用户可以编辑和预览，但到最后无法在当前入口下载 HTML 或导出 PDF；“预览投递版，确认后再导出”的承诺无法兑现。
- 复现步骤：
  1. 启动 Harness Web。
  2. 点击底部“求职简历”。
  3. 进入“预览”，观察工作台顶部操作区。
  4. 只能看到模板、文件选择、手动调整、AI 助手、刷新、保存和状态；看不到“下载 HTML / 确认并导出”。
- 首轮实际结果：插件入口渲染的是 PreviewWorkbench({ compact: true })，导出动作被 !compact 条件隐藏。
- 本轮修复：在 compact 预览工具栏补回“下载 HTML”和“导出 PDF”；浏览器快照已能看到两个按钮。
- 预期结果：全屏插件入口至少保留下载 HTML 和导出 PDF；如果导出只允许 Settings 入口完成，也必须在当前页面明确给出可达路径。
- 代码定位：client/client.js:2119 只在 !compact 时渲染导出区；client/client.js:2163 的常用入口传入 compact: true。
- 对接建议：产品确认唯一入口后，把导出动作放进全屏工作台；同时补成功、失败、弹窗被拦截和导出文件名提示。

### QA-002：首屏模板没有实现“刚好一页”

> 当前状态：新建工作区的种子简历已补足示例内容；已有工作区不会被静默覆盖，仍需提供迁移/重新生成示例入口，并用新工作区重新测量。

- 严重级别：P1，核心价值不达标
- 用户影响：新用户不填任何内容就会看到大量灰白空区，且换模板不能改善。用户会认为模板库和“刚好一页”是假的，尤其与产品定位“视觉复核和排版调优”冲突。
- 复现步骤：
  1. 使用默认示例工作区打开预览。
  2. 依次选择：校招标准、技术极简、安静编辑、黑白终端、侧栏聚焦。
  3. 记录顶部状态。
- 实测结果：

| 模板 | 状态 |
| --- | --- |
| 校招标准 | 留白 60% · 1 页 |
| 技术极简 | 留白 68% · 1 页 |
| 安静编辑 | 留白 54% · 1 页 |
| 黑白终端 | 留白 67% · 1 页 |
| 侧栏聚焦 | 留白 70% · 1 页 |

- 预期结果：示例内容至少应接近目标密度；如果内容本身刻意是占位数据，应在首屏明确“这是稀疏示例”，并提供一键填充足量演示内容或直接进入调优引导。
- 代码定位：lib/renderer.js:304-308 将目标空白定义为 4%～10%，但 lib/workspace.js:14 的种子简历内容远低于这个密度；模板切换只改变视觉参数，不补足示例内容。
- 对接建议：不要把“1 页”单独视为通过条件；验收应同时要求 fit === true、sparse === false，并为首次使用准备一份达到目标密度的演示简历。

### QA-003：渲染完成到 A4 指标可用存在竞态

> 当前状态：部分修复。已加入 renderId、previewPath 和 pending 结构，但尚未实现可等待的 metrics ready 协议。

- 严重级别：P1，AI 调优链路不稳定
- 用户影响：Agent 调用 jobhunt_render 后立即调用 jobhunt_layout_metrics，可能拿到“指标待回传”；如果 Agent 没有继续等待或重试，就会停止在没有真实指标的状态。
- 复现条件：调用 jobhunt_render 后，在预览 iframe 尚未完成加载和 postMessage 之前调用 jobhunt_layout_metrics。
- 实际行为：getLatestMetrics() 返回 status: pending。这比旧版提示更诚实，但仍没有把“等待浏览器测量完成”封装成工具层面的可等待结果。
- 预期结果：jobhunt_render 返回一个可关联的 render 任务/预览版本；jobhunt_layout_metrics 能按该版本等待有限次数或明确返回 ready/pending 和下一次建议调用，Agent 不需要猜。
- 代码定位：lib/preview-api.js:25-32；index.js:276-284；lib/renderer.js:268-321。当前链路是内存状态 → iframe 加载 → postMessage → /api/metrics，中间没有版本号和就绪确认。
- 对接建议：为每次 render 生成 renderId/previewVersion，并让 metrics 按版本关联；pending 应包含 retryAfter 或可等待接口。

### QA-004：切换投递版本后指标可能关联错误页面

> 当前状态：代码已修复，待用两个真实投递版本做黑盒复验。

- 严重级别：P1，数据可信度问题
- 用户影响：用户切换到 companies/frontend/preview.html 后，状态栏可能显示当前页面的数字，但服务端保存的指标路径为空、旧路径或默认路径。AI 后续调优可能基于错误页面作决定。
- 代码定位：client/client.js:1574-1599 的 useEffect 依赖数组是 []，其中 POST 使用的 selected 来自首次渲染闭包；lib/preview-api.js:306-312 又会在没有路径时回退到内存中的 previewState.previewRel。
- 预期结果：每次 iframe 回传都携带明确的 preview path/version，或 effect 使用最新 selected；服务端保存的 previewRel 必须与页面指标一一对应。
- 对接建议：不要依赖 React 闭包中的选择状态兜底；从 iframe URL 或 message payload 取路径，并在 API 返回中同时返回 metrics.previewRel 与顶层 previewRel 做一致性校验。

### QA-005：AI 助手历史分页需要真实会话复验

- 严重级别：P1，当前状态已修复，待真实多轮会话复验
- 当前实现：client/client.js 通过 `mainConversation.session.loadOlder()` 请求上一页，使用 `snapshot.hasMore/loadingOlder` 控制按钮和并发状态；加载后保留滚动锚点，旧宿主无接口时明确降级提示。
- 验收重点：打开有多轮历史的主对话，确认默认定位最新消息，向上加载后出现更早节点且不跳到底部，直到 `hasMore=false` 后按钮消失。
- 对接文档：详见 `HARNESS-PROTOCOL-INTEGRATION.zh.md`。

### QA-006：主对话镜像需要结构化节点回放复验

- 严重级别：P1，当前状态已修复，待真实工具调用复验
- 当前实现：优先消费 `AssistantMessageNode.blocks` 的 `reasoning`、`tool-call`，以及 `ToolResultNode`、`CommandNode`、`partial`、`runningCalls`；Read/Edit/Grep/Shell 只做展示映射，旧宿主保留文本兼容层。
- 验收重点：确认 Think 不再拼进最终 Assistant，Tool call 与结果按 seq 向下排列，运行中事件即时出现，未知节点不影响其他消息。
- 对接文档：详见 `HARNESS-PROTOCOL-INTEGRATION.zh.md`。

### QA-007：工作台 A4 与 AI 助手同屏时仍浪费可用空间

> 当前状态：部分修复。AI 打开时 A4 最小宽度从 500px 调整为 560px，画布底色改白；仍需在窄屏和真实长简历上做视觉验收。

- 严重级别：P1，核心视觉体验问题
- 用户影响：A4 预览两侧灰色画布和缩放后的纸张占据了可用空间；打开 AI 助手后，中间 A4 变窄，右侧助手在无历史时只剩大块空白，用户同时觉得“纸不够大”和“助手没有内容”。
- 实测证据：1280×720 视口下，三栏实际约为 Markdown 291.8px、A4 500px、AI 助手 316.2px；当前模板渲染的 794px A4 被缩放到中间窄栏，旁边仍保留灰色画布。
- 代码定位：client/client.js:708-709 固定三栏最小宽度；client/client.js:741-742 预览框保留白色 iframe 背景；lib/renderer.js:268-276 在窄视口缩放 794px 页面。
- 预期结果：A4 预览应优先保证纸张完整可读，灰色画布只做必要的边界提示；AI 助手无内容时应显示紧凑空状态或占用可折叠空间。
- 对接建议：先定义三栏的最小可读宽度和优先级，再做响应式：AI 打开时允许 A4 占更大比例，助手可折叠；不要仅通过继续压缩 A4 解决布局。

## 4. P2：建议在本轮一并处理

### QA-008：重启后文件存在，但预览指针和指标丢失

> 当前状态：部分修复。重启后 API 已能从 preview.html 恢复 previewRel；指标仍是当前浏览器重新回传后才可用。

- 严重级别：P2，恢复体验不一致
- 实测结果：GET /dsh-resume/api/status 返回 previewRel: null，但 previews 包含 preview.html；GET /dsh-resume/api/metrics 能看到旧浏览器指标，但顶层 previewRel 仍为 null。
- 原因：previewState 是进程内存对象，重启后 root/previewRel/updatedAt/metrics 不持久化；文件扫描和浏览器 iframe 又各自有一份状态。
- 代码定位：lib/preview-api.js:16-23、lib/preview-api.js:35-40、lib/preview-api.js:342-362。
- 建议：服务启动后从文件列表恢复默认 preview，指标按 preview path/version 持久化或明确标为当前浏览器会话指标；UI 不要同时显示“有预览文件”和“没有当前预览”两种互相矛盾的状态。

### QA-009：PDF/打印导出存在跨窗口失败路径，且缺少用户提示

- 严重级别：P2，导出可靠性风险
- 代码定位：client/client.js:1796-1811 使用 window.open(previewSrc, '_blank', 'noopener,noreferrer') 后访问 w.document；访问被浏览器隔离或弹窗拦截时直接停止，没有 toast、错误状态或替代下载方案。
- 建议：导出前显示“正在准备 PDF”，失败时保留可点击的预览页链接；优先使用同源隐藏 iframe 或明确的用户点击打印流程，并覆盖弹窗拦截场景。

### QA-010：README 效果图不在发布包中

> 当前状态：已修复。package.json 已把 docs 纳入 files，最新 dry-run 包体已包含 3 张截图。

- 严重级别：P2，安装后文档断图
- 实测结果：README 引用 docs/screenshots/workbench.png、ai-assistant.png、template-library.png；npm.cmd pack --dry-run --json 的 29 个文件清单没有 docs/。
- 代码定位：README.md:11、README.md:127、README.md:167；package.json:13-33 的 files 白名单未包含 docs。
- 建议：把 docs 加入包体，或把 README 中的图片改成仓库网页绝对链接；发布前增加“README 引用资源存在于 tarball”的检查。

### QA-011：没有自动化回归入口

> 当前状态：已补最小回归入口。npm.cmd test 当前 3/3 通过；浏览器、真实指标竞态和导出仍需继续扩展覆盖。

- 严重级别：P2，持续迭代风险
- 首轮实测结果：执行 npm.cmd test 直接失败：Missing script: "test"。本轮已加入 node:test，当前可以执行 3 个核心冒烟测试。
- 建议：至少加入三层测试：
  1. renderer/schema 的单元测试：模板字段消费、A4 分页、空白率、非法参数。
  2. API 测试：render → pending → metrics ready、模板版本、重启恢复。
  3. 浏览器冒烟：打开插件、切模板、编辑、刷新、AI 面板、下载/导出入口可见。

### QA-012：助手 Markdown 渲染仍是有限子集

- 严重级别：P2，内容展示一致性问题
- 代码定位：client/client.js:1067-1111 仅处理标题、列表、行内代码、粗体和围栏代码；表格、链接、引用、嵌套列表等主对话常见内容会降级为普通文本。
- 建议：使用已经存在于宿主的 Markdown 渲染能力，或明确标注支持范围并对不支持语法做降级提示；不要让用户误以为助手展示的是原始主对话。

## 5. 当前通过项与可保留设计

- 全屏面板已经落实：.cj-panel 使用 inset: 0、100vw、100vh，用户不需要先退出小弹窗再退出全屏。
- 模板库与模板工坊拆分合理，模板选择不会强制离开当前预览；五个模板的视觉方向有差异，且双栏模板入口存在。
- Markdown 草稿与磁盘文件有区分，主对话落盘时不会静默覆盖未保存草稿，并提供“读取最新文件”。这是正确的安全策略。
- 固定 A4 尺寸和页级分页已经进入 renderer，backgroundColor 已写入 CSS 变量并作用到页面背景，之前的 schema/render 字段断裂已修复。
- AI 任务流已按 Think、Read、Edit、Grep、Shell、Tool call、Question、Assistant、User 做分类；长内容有折叠，运行中事件默认展开，Question 卡片默认可操作。
- 本轮提交移除了固定秒数超时，长思考不再被插件错误判定为失败；保留“停止等待”作为用户主动操作，方向正确。

## 6. 提测阻断与复验顺序

建议按下面顺序对接，不要先继续加模板数量：

1. 先修 QA-001：在实际普通入口完成下载 HTML/PDF，补错误反馈。
2. 再修 QA-003、QA-004：建立 render/metrics 的 previewVersion 关联，确保 Agent 拿到的指标属于当前页面。
3. 修 QA-002、QA-007：让首屏示例达到目标密度，并重新分配 A4 与 AI 助手空间。
4. 复验 QA-005、QA-006：用有历史且会触发工具调用的真实 Session 验证分页和结构化事件顺序。
5. 补 QA-008～QA-011：重启恢复、导出失败、包体资源和自动化回归。

### 复验通过标准

- 从用户唯一常用入口打开后，能完成：编辑 Markdown → 切换模板 → 看到真实 A4 指标 → 手动或 AI 调整 → 下载 HTML/PDF。
- pageCount === 1 不能单独算通过；必须同时满足 overflow === false、sparse === false、fit === true。
- 新预览产生后，插件在不重新打开 Settings 的情况下，能加载正确的 Markdown、模板、A4 页面和对应指标。
- 切换多个投递版本后，指标的 previewRel 与当前 iframe 路径一致。
- AI 助手中主对话的 User、Think、Read、Edit、Tool call、Question、Assistant 按 seq 顺序混排；向上加载会真实请求更早历史，不能只扩大本地数组窗口。
- 长任务持续 5 分钟也不会被插件自行判定超时；用户能看到运行状态、工具步骤和停止等待入口。
- 发布 tarball 能打开 README 引用的全部资源；npm test 或等价 CI 命令可以执行并失败可见。

## 7. 对接分工建议

| 领域 | 主要负责人 | 需要提供的对接物 |
| --- | --- | --- |
| 导出与浏览器行为 | 插件前端 | 全屏入口中的导出动作、失败态、弹窗策略 |
| A4 指标链路 | 插件前端 + renderer | renderId/previewVersion、metrics ready 协议 |
| 主对话镜像 | Harness/宿主 + 插件前端 | 结构化事件、历史分页、稳定 event id |
| 模板与首屏示例 | 产品/模板 | 达到 4%～10%目标空白率的示例内容与模板基线 |
| 发布安装 | 插件维护者 | tarball 资源完整性、安装后 profile 验证、CI 冒烟 |

本报告同时记录本轮协议接线后的状态；仍需按 QA-005/006 的真实 Session 场景逐项回归，避免“代码已接上”但没有验证主流程真的闭环。
