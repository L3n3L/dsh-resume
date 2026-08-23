---
name: resume-template-design
description: Design, improve, compare, or visually validate dsh-resume templates when the user cares about resume appearance, hierarchy, A4 density, or a new visual direction.
---

# Resume Template Design

把“模板能渲染”推进到“模板适合投递”。这个 Skill 负责视觉判断和设计方法；插件工具负责 schema、安全、保存、渲染和浏览器测量。

## 适用范围

当用户提出以下意图时使用：生成模板、重做模板、参考某种视觉、模板不精致、模板相似、调整 A4 密度、比较候选模板、验收截图。

不要把它当成普通 Markdown 改写 Skill。除非用户明确要求，否则不要改变简历事实，不要为了塞满页面编造经历。

## 不可违反的实现边界

- 新模板必须使用 `renderer: "composition"`。
- 用 `composition` 表达结构：`page`、`header`、`section`、`entry`、`meta`、`skills`。
- 视觉差异放在独立 `templateCss` 文件，不为每个皮肤新增 renderer。
- CSS 必须作用域化，优先使用 `[data-template-id="<id>"]`。
- 不复制其他项目的源码、CSS、图标、专有命名或资源；只借鉴通用设计方法。
- 不让 AI 直接执行任意 HTML、JavaScript、外部字体或远程资源。
- 只有保存成功且模板列表能查到 ID，才可以说模板已创建或已加入模板库。

## 设计流程

### 1. 先定义视觉任务

先明确四件事：

1. 目标岗位和使用场景：校招、工程、产品、设计、运营、学术或社招；
2. 信息密度：紧凑、标准或舒展，以及是否必须一页；
3. 内容主角：教育、项目成果、时间线、个人品牌、技能或案例；
4. 一个可复述的视觉语言：例如“深色信息头 + 金色时间线”，而不是“换成蓝色”。

如果只是换颜色、圆角或字号，不要把它命名成全新模板；优先作为当前模板的 Token 变体。

### 2. 选择组合结构

优先组合现有结构：

- `stack`：通用单栏，最稳妥；
- `split`：主栏项目/经历，侧栏技能/链接；
- `grid`：作品集或成果卡片；
- `hero`：有明确身份锚点的头部；
- `timeline`：只用于项目/经历条目，不要把教育和技能强行画成时间线；
- `split` meta：标题、职位、日期或技术栈需要两侧对齐时使用。

只有现有组合无法表达真实结构时，才提出新增原语；单纯皮肤差异不新增 renderer。

### 3. 生成完整正文皮肤

独立 CSS 至少要有以下覆盖意图，而不是只设计头部：

- header：姓名、身份、联系方式、链接和头像（如有）；
- section：模块标题、编号/徽标/分割线和模块间距；
- entry：项目名/公司/职位的层级、日期位置、技术栈和条目分组；
- body：要点、加粗结果、链接、嵌套列表和长文本换行；
- skills：标签或分组的间距、边框、换行和密度；
- rich content：表格、引用、代码块在该模板中的合理表现；
- print：打印到 PDF 时的背景、文字、强调色和分页行为。

装饰必须服务内容层级。一个漂亮的头部不能抵消正文条目仍然是默认样式。

### 4. 用真实饱满内容验收

不能用只有姓名和一条项目的空白简历判断模板质量。至少使用包含教育、技能、2～3 个项目、实习/经历、量化结果和链接的真实或脱敏 fixture。

检查：

- 首屏是否知道“这个人是谁、投什么岗位”；
- 项目标题、角色、日期、技术栈和结果是否一眼可扫；
- 模块是否有节奏，正文是否过松或挤成墙；
- 是否恰好一页，不能溢出，也不能留下明显无意义的底部空白；
- 双栏/网格是否真的形成信息组织，而不是两列重复单栏；
- 深色模板是否有足够对比度，打印是否能读。

### 5. 工具闭环

用户明确要求创建或应用模板时，按下面顺序执行，不要停在候选 JSON：

`jobhunt_template_family_list` → `jobhunt_template_generate` → `jobhunt_template_validate` → `jobhunt_template_save` → `jobhunt_template_list` → `jobhunt_render` → `jobhunt_layout_metrics`

如果发现旧模板使用旧 renderer：

`jobhunt_template_migrate` → `jobhunt_template_list` → `jobhunt_render`

生成后要关注工具返回的 `qualityAudit`：

- `needs-visual-work`：补齐独立 CSS、正文层或打印规则，不要直接宣称完成；
- `ready-for-browser-review`：只代表 CSS 覆盖完整，仍必须打开真实预览并看截图/A4 指标；
- 指标 pending 时继续等待真实预览，不把 pending 当成最终通过，也不要伪造页数。

## 质量闸门

模板可以保存前，至少满足：

1. 有明确岗位场景和独立视觉语言；
2. 使用 composition，而不是旧 renderer；
3. CSS 有模板作用域；
4. 覆盖 header、section、entry title、entry meta、result bullets、skills 和 `@media print`；
5. 通过模板 schema、CSS 安全和对比度校验；
6. 用饱满简历完成浏览器截图验收；
7. A4 页数、溢出、留白和模块断裂得到明确结论；
8. 模板列表能查到 ID，且渲染 URL 使用同一个模板 ID。

## 复盘表达

向用户汇报时区分三种状态：

- “候选已生成”：只有生成工具返回了 JSON；
- “模板已入库”：保存成功且模板列表查得到；
- “视觉已验收”：真实浏览器截图和 A4 指标通过。

不要用 CSS 字节数、选择器数量或“看起来高级”替代视觉验收结论。
