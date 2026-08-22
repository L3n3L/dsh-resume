# Layout IR 与分页协同：对接复盘

## 结论

本阶段解决的不是“再增加几个 CSS 参数”，而是把简历的版式表达从旧的 `mode + regions` 升级为可组合的 Layout IR，并让浏览器分页器理解这些布局容器。这样 AI 才能稳定表达单栏、双栏和网格，而不会出现 DOM 看起来是双栏、分页却仍按单流错切的问题。

## 为什么要做

旧协议把布局拆成 `mode`、`regions` 和 `blocks`：

- 能表达单栏或传统左右栏，但不能明确描述列、顺序和网格。
- 分页器只会按根节点顺序搬运模块，遇到双栏时无法知道两个列应该如何共同占用一张 A4。
- 旧模板继续可用，但新模板如果直接改结构，容易造成页数、溢出和留白指标与视觉结果不一致。

本阶段的目标是让“结构、分页、指标”使用同一份布局事实：布局 IR 决定容器，分页器按容器分页，指标从真实模块边界计算。

## Layout IR 协议

`resume.layout.json` 继续接受旧字段，同时新增可选的 `ir`：

```json
{
  "mode": "two-column",
  "regions": { "main": ["projects"], "side": ["skills"] },
  "blocks": [
    { "id": "skills", "type": "skill-groups", "source": "专业技能" },
    { "id": "projects", "type": "project-list", "source": "项目经历" }
  ],
  "ir": {
    "type": "split",
    "gap": 22,
    "columns": [
      { "id": "main", "width": "1fr", "items": ["projects"] },
      { "id": "side", "width": "0.32fr", "items": ["skills"] }
    ]
  }
}
```

当前安全 IR 节点只有三种：

- `stack`：按 `items` 顺序垂直排列。
- `split`：按列排列；每列拥有自己的模块流和宽度，适合双栏简历。
- `grid`：按 `columns` 列网格排列，适合作品集或卡片型项目经历。

IR 只描述结构意图，不允许 AI 直接注入 CSS。宽度、间距、列数均有边界校验，最终样式仍由受控 Renderer 和视觉 Token 编译。

## 向后兼容与迁移

旧工作区无需改文件：

- 没有 `ir` 时，校验器根据旧的 `mode/regions` 自动生成等价 IR。
- `mode: two-column` 或存在 `regions.side` 会迁移为 `split`。
- 其他布局会迁移为 `stack`。
- 模板库的旧 `sidebarRatio`、`columnGap` 仍作为视觉层兜底；新 IR 的列结构优先。
- AI 新生成的候选会直接落出 IR：作品集 Renderer 使用 `grid`，双栏 Renderer 使用 `split`，其余使用 `stack`。

## 分页协同规则

分页脚本不再把双栏布局当成一条普通流：

1. A4 第 1 页先放 header，再计算两个列的可用高度。
2. `split` 的每一列独立按模块分页，但共享同一组 A4 页索引；主列到第 2 页时，侧列也可以继续使用第 1 页剩余空间。
3. `stack` 和 `grid` 按各自布局容器分页，模块是最小搬运单位。
4. 单个模块本身高于一页时不强行缩小或静默吞掉内容，而是保留溢出标记，让 AI 或用户精简内容。
5. 空页面和孤立模块会进入视觉审计，避免“页数对了但排版不能投递”的假通过。

## 指标校准

旧逻辑取页面最后一个 DOM 子节点的底部作为使用高度；双栏列被固定为整页高度后，这会把列容器本身误算成“内容已经铺满”。现在指标优先测量 `.header-block`、`.dsh-resume-section` 和业务时间线条目等真实内容边界，再计算：

- `pageCount`
- `overflow`
- `occupancyRatio`
- `blankRatio`
- `topWhitespace / bottomWhitespace`
- 每个模块的 `top / height`

这保证右侧 AI 看到的“刚好一页、留白偏多、模块溢出”与浏览器实际画面来自同一套几何结果。

## 验收标准

- 旧版 `resume.layout.json` 无需迁移即可通过校验并正常预览。
- 新建 stack/split/grid 三种 IR 均能生成对应容器。
- AI 生成作品集候选时能产出 grid；双栏候选能产出 split。
- 双栏内容跨页时，列内模块不被截断，单模块超高会显式报告 overflow。
- 真实浏览器中的页数、溢出、留白与 metrics 一致。
- `npm test`、打包演练和浏览器截图验收全部通过后再提交。

## 当前边界

本阶段仍以“模块级分页”为稳定边界，不做列表项级拆页；超高的单个教育/实习/项目模块仍需要内容精简或后续增加细粒度分页。IR 已为未来的 `flow`、`masonry` 等受控节点预留演进空间，但本阶段不开放任意 HTML/CSS，避免模板不可维护和注入风险。
