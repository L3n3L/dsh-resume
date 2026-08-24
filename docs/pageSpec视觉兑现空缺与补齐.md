# pageSpec 视觉兑现空缺与补齐

对照基线：`E:\vsws\codecv-master`（单栏 markdown 简历，视觉杠杆逐条兑现到像素）。
本文档只讲**单栏简历**视角下 pageSpec 协议已发到 DOM、但 `lib/templates/default.css` 没有对应规则的空缺，以及补齐方案。

## 一、DOM 契约现状（renderer 已发，CSS 待兑现）

pageSpec 五段 + renderer 投影，目前已发到 DOM 的属性/类：

| pageSpec 段 | DOM 属性 / 类 | 来源 |
| --- | --- | --- |
| page.size/column/density/margin | `data-page-size/column/density`, 根容器 | registry.pageSpecAttributes |
| header.variant/alignment/identity/contact | `data-page-header/-header-align/identity/contact` + `dsh-header-composition-{variant}` | renderer + registry |
| flow.order | 模块顺序重排（非视觉） | registry.pageSpecItems |
| modules.section | `data-page-section` + `dsh-section-composition-{variant}` | renderer + registry |
| modules.{experience,projects,…} | `data-module-variant` + `dsh-module-composition-{variant}` + `dsh-single-column-module-{variant}` + `dsh-entry-row-{variant}` | renderer + registry |
| modules.skills | `dsh-skills-composition-{variant}` | renderer |
| visual.family | `data-page-family` | registry |
| visual.typeScale | `data-page-type-scale` | registry |
| visual.ruleStyle | `data-page-rule` | registry |
| visual.accentMode | `data-page-accent-mode` | registry |

## 二、已兑现（grep 坐实，default.css 现有规则）

仅 5 条：

1. `data-page-density` → compact/standard/airy 模块间距 6/10/16px
2. `data-page-section="numbered-rail"` → 章节计数器 `N /`
3. `data-page-type-scale="display"` → 字距 −0.02em
4. `data-page-accent-mode="surface"` → feature-first/cards 模块 6% 背景色
5. `dsh-entry-rail-timeline` → 时间线竖轴 + 圆点 marker

## 三、空缺清单（发到 DOM 但 CSS 无规则）

按对单栏可见度排序：

### A1 主题色 accentMode 三档悬空 ★最伤
- 缺：`text` / `marker` / `rule` 三档
- 对照 codecv：主色贯穿链接、标题底线、blockquote 底色、code chip、章节标记
- 现 `--accent` 变量只在 timeline 竖轴 / badge 章节标记 / header 底线 / 链接色里用，**accentMode 切换不改变任何视觉**
- 补：text → 标题/正文强调字用 accent；marker → 章节前缀/列表 marker 用 accent；rule → 分隔线/底线用 accent

### A2 字体族 family 是空名字
- 缺：`data-page-family` 无任何字体族/风格切换规则
- 对照 codecv：Noto Serif SC / Noto Sans SC / Nunito 三套真切换
- 补：按 family 切 `--resume-font-stack`（campus-clear 现代无衬线 / 另设 editorial 衬线 / terminal 等宽）

### A3 header 变体矩阵全悬空
- 缺：`dsh-header-composition-{masthead,split,centered,compact,command}` 五档 + `data-page-identity/contact` 三档均无规则
- 现 header 只有 `.header-block` 一套（accent 底线 + h1 28px）
- 补：masthead = 大号姓名 + 副标 + 底线；split = 姓名/联系左右分；centered = 居中；compact = 紧凑单行；command = 等宽前缀

### A4 section 变体四档悬空
- 已兑现 numbered-rail；缺 `plain/badge/rule/marker`
- badge 在旧 `[data-composition-section="badge"]` 里有 ✦ 标记，但 pageSpec 路径 `dsh-section-composition-badge` 没接
- 补：plain = 无装饰；badge = 章节标号胶囊；rule = 纯色条标题；marker = 方块 marker

### A5 entry/project 变体悬空
- 已兑现 timeline（竖轴）；缺 `feature-first/role-stack/compact/cards/standard`
- `dsh-entry-row-feature-first/role-stack` 类已发但无规则
- `dsh-single-column-module-cards` 仅在 surface accent 下有背景，本身无卡片网格规则
- 补：feature-first = 首条放大；role-stack = 角色/技术栈堆叠；compact = 紧凑行；cards = 网格卡片

### A6 skills 变体悬空
- `dsh-skills-composition-{list,grouped-chips,rows,inline}` 全无 pageSpec 路径规则
- 旧 `[data-composition-skills="list"]` 有规则但 pageSpec 走 `dsh-skills-composition-*` 类，没接通
- 补：list = 纵列；grouped-chips = 分组胶囊；rows = 表格行；inline = 行内逗号

### A7 富文本原语缺失（对照 codecv 最显眼）
- 缺：blockquote（色条 + 底色）、inline code chip（胶囊底色）、table（表头底色 + 边框）
- codecv 靠这些撑起 summary 块和技能呈现
- 补：blockquote = 左色条 + accent 8% 底色；code = accent 胶囊；table thead = 浅灰底 + 边框

### A8 图标系统半成品
- `renderIconTokens` 发 `.dsh-icon dsh-icon-{name}`，glyph 是文字（GH/in/⚛/TS/Py/@/☎/↗）
- 缺：图标尺寸/对齐/颜色的统一规则
- 补：固定 1em 方形 + 居中 + accent 色，联系信息行内对齐

### A9 ruleStyle 四档悬空
- `data-page-rule` = none/hairline/solid/dashed，发到 DOM 无规则
- 补：控制章节底线 / 分隔线粗细样式

### A10 typeScale 两档悬空
- 已兑现 display；缺 `balanced/compact`
- 补：balanced = 默认字距；compact = 标题略缩

### A11 page.margin 未兑现到 padding
- pageSpec.page.margin（24-72 钳制）发了 `data-page-*` 但无规则把它变成 `--page-padding-x/y`
- 补：根容器按 margin 设 padding 变量

## 四、补齐优先级

| 批次 | 项 | 理由 |
| --- | --- | --- |
| P0 | A1 accentMode / A7 富文本原语 / A3 header | 单栏视觉主线，用户第一眼 |
| P1 | A4 section / A5 entry-project / A6 skills | 变体矩阵兑现，pageSpec 才真有用 |
| P2 | A2 family / A8 icon / A9 ruleStyle / A10 typeScale / A11 margin | 完整度 |

## 五、验收方式

每补一档，用最小 HTML 片段（带对应 `data-page-*` / `dsh-*-composition-*`）渲染，确认视觉有可见差异；最后跑 `pnpm test` 保证 47/47 不回退。
