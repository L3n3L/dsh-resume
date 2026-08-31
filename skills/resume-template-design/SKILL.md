---
name: resume-template-design
description: Design, improve, compare, or visually validate dsh-resume templates when the user cares about resume appearance, hierarchy, A4 density, or a new visual direction.
---

# Resume Template Design

把“模板能渲染”推进到“模板适合投递”。这个 Skill 负责视觉判断和设计方法；插件工具负责 schema、安全、保存、渲染和浏览器测量。

## 适用范围

当用户提出以下意图时使用：生成模板、重做模板、参考某种视觉、模板不精致、模板相似、调整 A4 密度、比较候选模板、验收截图。

不要把它当成普通 Markdown 改写 Skill。模板工作不应擅自改变事实，但可以配合主 Agent 把有依据的经历写得更职业化、更有成果感；不为了塞满页面编造经历。

## 简历内容优先级与篇幅预算

模板为内容服务。遇到“更满”“刚好一页”“更像某类简历”等目标时，按以下顺序决策：

1. 事实有依据且表达可以被用户解释；
2. 目标岗位相关性和证据密度；
3. HR 快速扫描的清晰度；
4. 字体、行距、留白和模块完整性；
5. 页数，一页只是校招偏好；
6. 图标、颜色和其他装饰。

写作可以使用更有力度的动词、明确个人负责范围、合并同义事实，并把动作和结果连接起来。允许基于原始材料做有限度的合理强化，但不能凭空新增数字、规模、职责、技术栈、结果或项目范围；拿不准的强化表达交给用户确认。

起草时使用软预算：最相关的实习/工作通常 3～5 条要点，次要经历 1～3 条；最强项目通常 2～3 条要点，次要项目 1～2 条；每条尽量控制在渲染后的 1～2 行。压缩时先保留背景、个人负责范围、动作、方法/技术、结果/指标、产物/链接等证据原子，再合并重复、删除低信号和低相关内容，最后才调排版。如果仍无法在可读且证据完整的前提下放入一页，应保留多页。

### 校招内容结构硬规则

- 当前学生且有目标岗位相关实习时，默认模块顺序为：个人信息 → 教育经历 → 实习/工作经历 → 项目经历 → 专业技能 → 荣誉奖项。
- 只有项目与目标岗位明显更相关，或没有相关实习时，才把项目放到实习前；调整必须在交付说明中写出理由。
- 技能和荣誉是辅助证据，默认不能排在相关实习和项目之前；模板的 `moduleOrder` 不能覆盖内容决策。
- 用户明确要求保留的项目必须逐个保留为具名条目。页面不足时先压缩次要项目到一条高信号要点，不得静默合并或删除。
- 每个保留项目至少保留名称、角色/负责范围、时间和问题—行动—结果或链接中的关键证据。
- 写入前建立内容地图，记录模块顺序、保留项目数、合并/省略项和原因；交付时同步说明。

## 图标协议

- `[icon:xxx]` 只能使用已注册 token；禁止根据常识猜测不存在的 slug。
- `school`、`code`、`work`、`email`、`phone`、`link` 是内置语义 token；品牌图标先调用 `jobhunt_icon_list` 查询。
- 没有合适图标时不要添加。图标只服务联系方式、技能标签或小标题，不替代事实内容。
- 如果 `jobhunt_write` 返回未注册图标，只修正该 token，不要重写其他简历事实。

## 不可违反的实现边界

- 新模板必须使用 `renderer: "composition"`。
- 用 `composition` 表达结构：旧字段 `page`、`header`、`section`、`entry`、`meta`、`skills` 保持兼容；新单栏模板必须优先使用 `composition.pageSpec` 表达 A4 页面、头部、模块变体、顺序、密度和分页意图。
- 视觉差异放在独立 `templateCss` 文件，不为每个皮肤新增 renderer。
- CSS 必须作用域化，优先使用 `[data-template-id="<id>"]`。
- 不复制其他项目的源码、CSS、图标、专有命名或资源；只借鉴通用设计方法。
- 不让 AI 直接执行任意 HTML、JavaScript、外部字体或远程资源。
- 只有保存成功且模板列表能查到 ID，才可以说模板已创建或已加入模板库。

## 设计流程

### 1. 先定义视觉任务

先明确四件事：

1. 目标岗位和使用场景：校招、工程、产品、设计、运营、学术或社招；
2. 信息密度：紧凑、标准或舒展，以及一页是偏好还是明确硬要求；
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

新单栏模板的页面规格建议：

```json
{
  "page": { "size": "A4", "column": "single", "density": "compact", "margin": { "top": 34, "right": 40, "bottom": 34, "left": 40 } },
  "header": { "variant": "masthead", "alignment": "left", "identity": "stacked", "contact": "inline" },
  "flow": { "order": ["profile", "summary", "experience", "projects", "education", "skills"], "keepEntryTogether": true, "avoidSectionOrphans": true },
  "modules": { "section": "numbered-rail", "experience": "timeline", "projects": "feature-first", "skills": "grouped-chips" },
  "visual": { "family": "editorial", "typeScale": "display", "ruleStyle": "hairline", "accentMode": "marker" }
}
```

这段规格是结构契约，不是 CSS；Renderer 必须消费它，模板 CSS 再负责具体视觉皮肤。

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
- 如果用户明确要求一页，是否恰好一页、没有溢出且没有明显无意义的底部空白；如果没有明确要求，优先检查内容完整性和可读性，不把一页当成硬闸门；
- 双栏/网格是否真的形成信息组织，而不是两列重复单栏；
- 深色模板是否有足够对比度，打印是否能读。

### 5. 工具闭环

用户明确要求创建或应用模板时，按下面顺序执行，不要停在候选 JSON：

`jobhunt_template_family_list` → `jobhunt_template_generate` → `jobhunt_template_validate` → `jobhunt_template_save` → `jobhunt_template_list` → `jobhunt_render` → `jobhunt_layout_metrics`

生成后要关注工具返回的 `qualityAudit`：

- `needs-visual-work`：补齐独立 CSS、正文层或打印规则，不要直接宣称完成；
- `ready-for-browser-review`：只代表 CSS 覆盖完整，仍必须打开真实预览并看截图/A4 指标；
- 指标 pending 时继续等待真实预览，不把 pending 当成最终通过，也不要伪造页数。

## 质量闸门

模板可以保存前，至少满足：

1. 有明确岗位场景和独立视觉语言；
2. 新模板使用 composition，单栏模板必须有可校验的 composition.pageSpec，而不是旧 renderer；
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
