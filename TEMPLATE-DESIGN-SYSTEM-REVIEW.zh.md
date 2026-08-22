# 模板设计系统对接复盘：让 AI 稳定生成大量成熟模板

## 1. 这次要解决的问题

当前插件已经可以生成模板候选，但如果每个模板都靠 AI 自由拼 CSS，会出现三个问题：

- 同一个视觉方向每次生成结果不稳定；
- A4 分页、打印和模块断裂容易失控；
- 模板越来越多以后，修改一处需要重复维护很多份 CSS。

因此本轮不把“组件”理解成某个 UI 框架，而是建立一套简历专用的主题系统：

```text
内容 Markdown
    ↓
主题家族 Theme Family
    ↓
页面结构 LayoutSpec
    ↓
语义模块 Block Renderer
    ↓
视觉 Token
    ↓
A4 测量、调优和模板版本
```

目标不是复制某个参考项目的模板，而是让我们能够用自己的 Schema、Renderer、CSS 和视觉参数持续生产原创模板。

## 2. 调研结论

### JSON Resume：内容和主题分离

JSON Resume 把简历数据定义成独立 Schema，再由主题 Renderer 输出视觉结果。主题本身是纯渲染逻辑，不应该依赖文件或网络副作用。[官方主题开发说明](https://www.jsonresume.org/theme-development)

对 dsh-resume 的启发：Markdown 内容、模板结构、视觉样式和输出 Renderer 必须分开，换模板不应该改正文。

### RenderCV：主题默认值 + 局部覆盖

RenderCV 使用主题默认值，用户只覆盖需要修改的 design 字段；当 design 参数不够时，才允许创建自定义主题和底层模板。[design 字段](https://docs.rendercv.com/user_guide/yaml_input_structure/design/)、[自定义主题](https://docs.rendercv.com/developer_guide/how_to/add_theme/)、[模板覆盖](https://docs.rendercv.com/user_guide/how_to/override_default_templates/)

对 dsh-resume 的启发：AI 默认只生成 DesignBrief、TemplateSpec、LayoutSpec 和 Token；任意 CSS 只能作为开发者逃生舱，不能作为默认生成路径。

### 业内共同模式

成熟系统通常都有：

- 一份稳定的内容模型；
- 一组主题家族；
- 可复用的条目/模块 Renderer；
- 可局部覆盖的颜色、字体、间距和布局参数；
- 生成后的预览、验证和导出闭环。

### CodeCV 的可借鉴特征

本地参考项目中可以观察到两类值得学习的产品信息：模板库按“校招、社招、英文、Geek、运营、商务、设计、简约、暗黑、通用”等场景组织；模板卡片用缩略图让用户先判断版式，再进入编辑器。我们把它抽象成自己的主题家族，而不是搬运具体模板：

| 可观察的方向 | 我们的独立抽象 | 当前家族 |
| --- | --- | --- |
| 校招 / 通用 | 信息层级明确、单栏、低装饰 | `campus-clear` |
| Geek / 技术 | 更高密度、技术结果优先、时间线 | `engineering-dense`、`mono-terminal` |
| 设计 / 作品集 | 项目优先、双栏、卡片化模块 | `portfolio-grid` |
| 简约 / 阅读友好 | 留白更舒展、弱分割、正文可读性优先 | `editorial-quiet` |
| 多场景模板库 | 分类、缩略图、候选对比、应用前预览 | 模板工坊 P1 |

这里借鉴的是“用户如何挑选视觉方向”和“模板如何按场景扩展”的方法，不复制 CodeCV 的模板内容、资源、结构或样式参数。我们的差异点是：模板候选必须经过 DesignBrief、LayoutSpec 和真实 A4 指标验证，且用户确认前不写入模板库。

## 3. 我们的独立实现边界

- 不复制 CodeCV 的源码、模板文件、CSS、DOM、图标、图片、文案或具体视觉参数。
- 不使用参考项目的内部字段名、类名或模板名称作为实现基础。
- 自己设计 Theme Family、Block Preset、TemplateSpec、LayoutSpec 和 A4 测量协议。
- 参考的是通用产品能力和公开的工程模式，不是某个项目的具体实现。

## 4. 主题系统设计

### 4.1 Theme Family

主题家族不是最终模板，而是一组稳定默认值和适用场景：

| 家族 | 适合场景 | 默认结构 |
| --- | --- | --- |
| `campus-clear` | 通用校招 | 清晰单栏 |
| `engineering-dense` | 前端、后端、算法 | 技术高密度 |
| `split-focus` | 技能和项目较多 | 双栏侧重点 |
| `editorial-quiet` | 产品、运营、综合岗位 | 舒展阅读 |
| `mono-terminal` | 开发、测试、工程岗位 | 黑白终端感 |
| `portfolio-grid` | 项目作品集 | 双栏卡片 |

每个家族提供：

- 默认布局模式；
- 默认密度和字体；
- 默认颜色与分隔线；
- 推荐的模块类型；
- 适合的岗位标签。

### 4.2 Block Renderer

模块 Renderer 负责把同一份 Markdown 以不同方式呈现：

- `skill-tags`：把技能列表渲染为可换行标签；
- `timeline`：把经历呈现为时间线；
- `project-list`：强调项目结果列表；
- `portfolio-card`：将项目包裹为卡片；
- `metric-row`：把指标压缩为横向信息行；
- `sidebar`：把指定模块放入侧栏。

模块不负责修改内容，只负责结构和视觉语义。

### 4.3 Visual Token

Token 是模板的局部可调参数：

- 强调色、背景色、正文色、辅助色；
- 字体、字号、行高；
- 页面边距、章节间距、段落间距；
- 圆角、分隔线、卡片和标签样式。

Token 只允许在安全范围内变化，并且必须通过浏览器 A4 测量验证。

## 5. AI 生成协议

AI 不再直接从零写 CSS，而是走以下协议：

```text
用户目标
  ↓
jobhunt_template_family_list
  ↓
DesignBrief
  ↓
jobhunt_template_generate
  ↓
TemplateSpec + LayoutSpec
  ↓
template_validate + layout_validate
  ↓
jobhunt_render + jobhunt_layout_metrics
  ↓
最多 2～3 轮有界调优
  ↓
用户确认后保存
```

生成结果必须能够解释：

- 为什么选择这个主题家族；
- 为什么使用单栏或双栏；
- 哪些模块被突出；
- 当前 A4 是否通过；
- 还可以怎么调整。

## 6. 开发计划

### P0：本轮开始实现

- 主题家族注册表；
- 模块样式预设；
- DesignBrief 支持指定家族；
- AI 查询可用主题家族；
- 生成结果返回带模块预设的 LayoutSpec。

### P1：模板数量和质量

- 六个家族各提供 2～3 个原创变体；
- 模板缩略图使用实际 Token；
- 模板候选对比；
- A4 页面密度评分；
- 主题家族和岗位场景筛选。

### P2：高级主题扩展

- 本地头像、二维码和图标资源管理；
- 模块级 keep-together 和分页策略；
- 自定义主题开发模式；
- 多格式导出和打印一致性检查。

## 7. 验收标准

- AI 只给出 DesignBrief，也能生成合法的 TemplateSpec 和 LayoutSpec；
- 同一份 Markdown 可在六个主题家族之间切换；
- 主题家族能改变结构和模块表现，而不只是换颜色；
- 模板新增不需要复制整套 Renderer；
- 每个模板都经过 A4、溢出、留白和模块断裂检查；
- 用户确认之前不会自动污染模板库；
- 新实现不依赖参考项目的代码和视觉资产。

## 8. 本轮实现记录

- 新增 `lib/theme-system.js` 主题家族与模块预设注册表；
- `DesignBrief` 支持主题家族和模块预设映射；
- 新增 `jobhunt_template_family_list` 工具；
- Renderer 为模块挂载独立 preset 语义；
- 补充主题家族生成和模块预设测试。
