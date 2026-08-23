# 模板组合框架对接复盘

## 目标

以“商务履历”作为验收基准，把模板从“一个 renderer 配一套 CSS”升级为：

> 结构组合协议 + 稳定语义 DOM + 独立模板 CSS + A4 分页与测量闭环

目标是让后续模板可以在现有插件内表达接近 CodeCV 的完整视觉细节，同时保持独立实现，不复制其代码、资源或专有标识。

## 本轮结论

当前框架不需要推翻重做。真正需要收敛的是“结构”和“皮肤”的边界：

- 结构由 `composition` 描述：`header / section / entry / meta / skills`。
- 内部 renderer 保留旧 ID 作为历史兼容能力，但活动模板不再依赖旧 preset；新模板统一使用 `composition`，不再为每个新模板复制一套函数。
- 模板差异主要落在独立 CSS 文件；CSS 可以围绕组合协议做头部、模块标题、条目、日期、技能和打印细节。
- 分页脚本会把组合属性挂到最终保留的 `.resume-document`，避免原始 root 在分页后被移除导致 CSS 选择器失效。

## 组合协议

```json
{
  "composition": {
    "header": "hero",
    "section": "badge",
    "entry": "timeline",
    "meta": "split",
    "skills": "chips"
  }
}
```

目前的安全选项是：

| 维度 | 选项 | 作用 |
| --- | --- | --- |
| header | `standard` / `hero` | 普通头部或视觉锚点头部 |
| section | `line` / `badge` | 线性标题或圆章标题 |
| entry | `stack` / `timeline` | 普通堆叠或项目/经历轨道条目 |
| meta | `inline` / `split` | 元信息同行或标题/日期分栏 |
| skills | `list` / `chips` | 普通技能列表或标签组 |

协议是白名单，不允许 AI 直接注入任意 HTML/CSS 结构。AI 可以表达设计意图，插件负责把意图编译成可测量、可分页的 DOM。

## 商务履历基准实现

`business-ledger-plus` 使用：

- `hero + badge + timeline + split + chips`；
- `dsh-hero-name`、`dsh-entry-title`、`dsh-entry-meta`、`dsh-entry-row` 等稳定语义类；
- 独立 `business-ledger-plus.css` 处理深色头部、金色强调、模块圆章、日期分栏、轨道线、技能标签和打印规则；
- 只对项目/经历类条目启用时间线，教育和技能不被错误包成经历条目。

这套模板是通用协议的第一套验收样板。后续模板应复用协议，而不是复制 `business-timeline` renderer。

## AI 生成链路

`DesignBrief → compositionForBrief → TemplateSpec → Renderer → 独立 CSS → A4 分页/测量`

商务、工程、设计、极简等 brief 会得到不同的默认组合；用户或 AI 显式传入的合法组合会覆盖默认推断。生成结果会进入现有模板校验、保存和预览链路。已删除的旧内置模板不再进入 preset；用户工作区中的旧文件仅保留在磁盘上，不会被物理删除，并会被运行时从 composition 模板库过滤。AI 新模板不受内置六套数量限制。

## 验收标准

1. 六套活动内置模板全部使用 composition；历史 renderer ID 仅作为代码级兼容能力保留。
2. AI 生成商务 brief 会产出明确组合，而不是只改变颜色。
3. 最终预览 DOM 中存在 `dsh-entry-row`、头部/模块语义类，且 A4 分页后组合属性仍保留在 `.resume-document`。
4. 时间线只作用于项目/经历，不污染教育、技能和链接模块。
5. `node --test` 全绿；浏览器用真实饱满简历截图验收头部、模块标题、日期对齐、技能标签、分页和留白。

## 非目标与边界

- 不复制 CodeCV 的源码、CSS、图标字体、模板命名或资源。
- 不让 AI 直接生成并执行任意 HTML/JS。
- 不为了视觉差异继续无限增加 renderer；新增结构只有在现有组合无法表达时才进入协议评审。
- “像素级对齐”必须以截图对比和真实 A4 指标为准，不能仅凭 CSS 文件大小或选择器数量宣称完成。

## 后续工作

- 用同一套饱满简历继续打磨商务模板的像素细节。
- 继续对六套活动模板逐套截图验收；只有形成明确新视觉系统的新模板才进入内置库。
- 为模板工坊展示组合预设，减少普通用户理解 JSON 的成本。
