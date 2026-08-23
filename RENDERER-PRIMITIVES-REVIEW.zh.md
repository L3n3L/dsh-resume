# Renderer 原语化整改对接复盘

## 1. 背景

当前插件保留了 20 个 renderer ID，用于兼容历史模板和旧预览链接。但其中一批 renderer 的输出骨架高度相似：都是“多个条目 + 编号/圆点/标签 + 内容”，差异主要来自 CSS 皮肤。

如果继续为每种视觉方向新增 renderer，会让模板能力与代码结构绑定，造成重复实现、回归成本上升，也会让 AI 生成模板越来越依赖硬编码 renderer 名称。

本次整改的目标不是删除 renderer，而是：

> 保留旧 renderer 作为兼容入口，内部收敛为可复用的布局原语。

## 2. 结构判断

### 保留为真正布局能力的部分

- `SplitLayout`：主栏与侧栏的空间关系；
- `GridLayout`：多列网格与列间距；
- `HeroHeader`：头像、姓名、身份和联系方式的组合头部；
- `LeadLayout`：杂志/案例类模板的主次内容排序。

### 抽取为共享原语的部分

- `RailEntry`：编号、圆点、竖线和条目内容；
- `CardEntry`：条目容器、标题、元信息和成果内容；
- `EntryMeta`：日期、职位、技术栈等辅助信息；
- `SectionBadge`：模块标题图标和强调线；
- `SkillGroup`：技能分组与标签。

## 3. 本次落地范围

第一阶段只做低风险的 `RailEntry` 抽取：

1. 新增通用 `renderIndexedEntries` 原语；
2. 让技术时间线、学术档案、商务时间线、履历编年、纯字留白、主标题层叠、极客实验室、成果看板和色块分区复用该原语；
3. 保留原有 class 名，例如 `dsh-business-entry`、`dsh-technical-node`，保证旧 CSS 和自定义模板继续生效；
4. 统一补充 `dsh-entry-rail` 和 `data-entry-layout="rail"` 语义钩子；
5. `business-ledger-plus` 只通过原语组合和模板 CSS 表达视觉，不新增专用 renderer。

杂志、案例、头像头部等带有真实排序或组合逻辑的 renderer 暂不强行合并。

## 4. 兼容策略

- 不删除任何旧 renderer ID；
- 不改变 `resolveRendererId` 的结果；
- 不改变旧 class，只增加共享 class；
- 保留旧模板 CSS 选择器命中路径；
- 通过结构测试确认所有内置 renderer 仍能输出各自的根 class；
- 后续迁移 CSS 时，先使用共享 class，再逐步减少 renderer.js 中的默认视觉规则。

## 5. 后续演进

第二阶段补齐 `EntryMeta` 的 `entry-role`、`entry-tech` 语义类，并让 Layout IR 可以显式声明 `hero` 与条目装饰策略。文本启发式只作为旧 Markdown 的兼容兜底，不作为 AI 生成模板的唯一依据。

第三阶段将模板 CSS 中重复的轨道、编号、卡片基础规则迁移到共享基础层，具体颜色、字体、间距和装饰仍由各模板独立 CSS 控制。

## 7. P0 实施结果

本轮已完成 `HeroHeader + EntryMeta`：

- 所有头部统一输出 `dsh-hero-header`、`dsh-hero-name` 和 `dsh-hero-line`；
- 头像所在行输出 `dsh-hero-avatar`；
- 条目元信息可区分 `dsh-entry-role` 与 `dsh-entry-tech`；
- 日期/职位/技术栈可分别被模板 CSS 组合；
- Layout IR 支持可选 `ir.hero` 配置，旧布局没有该字段时保持原输出；
- 不增加 renderer ID，不改变旧模板的兼容路径。

下一步进入 5 套代表性模板的皮肤重做和截图验收，而不是继续增加 renderer。

## 6. 验收标准

- 旧 renderer ID 数量和顺序不变；
- 现有全量测试通过；
- 每个迁移 renderer 同时包含旧 class 与 `dsh-entry-rail`；
- `business-ledger-plus` 的时间线视觉不依赖新增 renderer；
- 模板库和 A4 预览中的旧模板无明显结构回归；
- npm pack 能包含本复盘文档。
