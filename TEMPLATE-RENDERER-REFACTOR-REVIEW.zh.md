# 模板 Renderer 架构对接复盘

## 1. 本轮只解决什么

本轮只解决一个问题：模板数量增加后，不能继续停留在“同一个页面 Renderer 换颜色、字号和间距”的换皮模式。

`dsh-resume` 需要让模板拥有真正不同的页面结构，同时保持内容、模板配置和 A4 测量之间的边界清晰。

目标不是复制 CodeCV 的源码、模板或视觉资产，而是独立实现相同层级的产品能力：

```text
同一份真实简历内容
        ↓
不同布局族 Renderer
        ↓
不同模板配方和视觉 Token
        ↓
真实 A4 预览与测量
```

## 2. 调研结论

成熟的简历和文档产品通常把以下几层分开：

1. 内容 Schema：描述教育、技能、项目和经历等事实；
2. 语义模块：把事实渲染成项目卡片、技能标签、时间线等模块；
3. 页面 Renderer：决定单栏、双栏、时间线、作品集等页面骨架；
4. Theme / Token：决定颜色、字体、间距和密度；
5. 分页与测量：在真实页面中处理 A4、断页、留白和溢出。

因此，共享基础模块是合理的，但所有模板共享同一个页面骨架会限制视觉差异和维护质量。

## 3. DSH 插件边界

本能力仍然是 DSH 插件内部能力：

- Harness 主对话负责理解用户目标和岗位场景；
- Agent 生成或选择经过校验的 `TemplateSpec`；
- 插件 Renderer 只消费安全配置，不执行模型生成的任意 CSS 或脚本；
- 浏览器预览负责渲染 A4 并回传真实指标；
- 用户确认后再保存模板或投递版本。

数据流：

```text
用户目标 / JD / 真实经历
        ↓
Harness + dsh-resume tools
        ↓
TemplateSpec
        ↓
Renderer Registry 选择布局族
        ↓
语义模块组合成 A4 页面
        ↓
浏览器测量、视觉审计和用户确认
```

## 4. TemplateSpec 设计

现有 `visual.variant` 只能表达有限的皮肤差异。本轮在保持 Schema 版本兼容的前提下增加明确的 `renderer` 和 `family` 字段，并保持旧模板可以通过默认值继续工作。

```json
{
  "schemaVersion": 1,
  "id": "engineering-timeline",
  "family": "engineering-dense",
  "renderer": "technical-timeline",
  "layout": {
    "mode": "single-column",
    "moduleOrder": ["profile", "skills", "projects", "experience"]
  },
  "visual": {
    "accentColor": "#155e75",
    "divider": "solid"
  }
}
```

字段职责：

- `renderer`：决定页面骨架和模块排列方式；
- `family`：描述适用人群和视觉方向；
- `layout`：描述栏位、模块顺序和密度；
- `visual`：描述可控的视觉 Token；
- Markdown：只保存用户内容，不承载模板专用语法。

AI 只能生成这个受约束的配置，不能直接写入任意 CSS。校验失败时必须拒绝保存，而不是出现“保存成功但页面无变化”。

## 5. Renderer Registry

第一阶段建立六个基础布局族，并增加三个明确的视觉特化 Renderer。模板数量通过配方扩展，不通过复制整套页面实现扩展：

| Renderer | 结构重点 | 适用方向 |
| --- | --- | --- |
| `clean-single` | 稳定单栏、ATS 友好 | 通用校招 |
| `split-sidebar` | 主栏项目 + 侧栏技能链接 | 校招、工程 |
| `technical-timeline` | 技术经历时间线、结果优先 | 前端、后端、测试 |
| `portfolio-grid` | 项目卡片和成果指标 | 项目型前端、产品、设计 |
| `editorial` | 舒展层级、标题块和阅读节奏 | 产品、运营、综合岗位 |
| `academic` | 文献式层级、教育和研究优先 | 科研、复试、学术申请 |
| `swiss-grid` | 大标题、网格线和强对齐 | 极简技术、设计和通用岗位 |
| `midnight-terminal` | 深色页面、等宽字体、终端信号色 | 工程、开发和基础设施岗位 |
| `sidebar-signal` | 深色侧栏、浅色主栏、信息重心 | 需要快速扫描的双栏简历 |

这三个特化 Renderer 不是简单换色：它们分别改变标题网格、页面底色与字体系统、以及侧栏的视觉层级。这样模板库可以提供明显不同的候选，而内容模块仍然复用同一套安全语义组件。

Renderer 的实现原则：

- Renderer 之间可以共享语义模块；
- Renderer 不复制整份模板 CSS；
- 每个 Renderer 必须产生可识别的结构 class；
- 结构 class 必须被实际 CSS 消费；
- 模板缩略图必须使用真实预览，而不是只画静态卡片；
- 新增 Renderer 必须有完整简历 fixture 和 A4 测量测试。

## 6. 分页与视觉质量

模板结构差异不能破坏“一页简历”的核心目标。每个模块继续作为可测量的页面单元，并遵循以下顺序：

1. 优先保持项目、教育和经历模块完整；
2. 其次调整模块顺序、段落间距和页面边距；
3. 再考虑字号和行高；
4. 最后才允许进入多页布局；
5. 每次变化都必须重新渲染并读取 `jobhunt_layout_metrics`。

Renderer 需要为模块保留 `keepTogether` 和断页优先级的扩展空间，避免标题孤立、项目被硬拆和侧栏断裂。

## 7. AI 对接方式

AI 的任务不是“写一份 CSS”，而是选择或生成设计意图：

```text
“做一个适合前端校招、项目突出、黑白高密度模板”
        ↓
DesignBrief
        ↓
TemplateSpec
        ↓
校验 renderer / layout / visual
        ↓
真实 A4 预览
        ↓
jobhunt_layout_metrics
```

如果候选模板只改变颜色和间距，插件应识别为结构差异不足，而不是把它当成全新模板。

## 8. 本轮验收标准

- 旧模板不需要修改即可继续渲染；
- 新模板显式声明 `renderer`，且由 Registry 选择实现；
- 至少单栏、双栏、时间线、作品集、编辑风、学术风产生不同 DOM 结构；
- Renderer 的结构 class 都有对应 CSS 消费；
- AI 生成的模板仍然经过 Schema 校验；
- 模板库缩略图能显示真实页面差异；
- A4 分页、留白和模块测量继续有效；
- 所有现有测试通过；
- 不复制 CodeCV 源码、模板文件、图片、命名或 CSS 资产。

## 9. 后续边界

本轮不做：

- CodeMirror 编辑器替换；
- AI 聊天流重构；
- 新增模板市场；
- PDF 导出链路重写；
- 复制 CodeCV 的具体模板。

这些能力只有在 Renderer Registry 稳定后，才有可靠的承载基础。
