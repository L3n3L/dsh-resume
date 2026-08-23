# 模板结构协议脱钩复盘

## 结论

从本阶段开始，新模板不再通过新增 Renderer 表达视觉差异，而是使用：

```text
TemplateSpec
├── composition：结构组合
├── layout / IR：页面区域与顺序
├── visual：安全视觉 Token
└── templateCss：模板独立 CSS
```

旧 Renderer 继续作为兼容层存在，旧模板可以正常加载；AI 生成模板统一走 `composition` + 通用结构 Renderer。

## 通用组合字段

| 字段 | 可选值 | 作用 |
| --- | --- | --- |
| `page` | `stack` / `split` / `grid` | 页面主布局 |
| `header` | `standard` / `hero` | 普通头部或身份 Hero |
| `section` | `line` / `badge` | 模块标题语言 |
| `entry` | `stack` / `timeline` | 条目堆叠或时间线 |
| `meta` | `inline` / `split` | 日期、角色、技术栈的排列方式 |
| `skills` | `list` / `chips` | 技能列表或标签 |

## 兼容策略

1. 旧模板 ID、旧 Renderer 和旧预览链接继续可用。
2. 没有 `composition.page` 的模板维持原渲染路径。
3. 新模板和 AI 候选使用 `composition`，不再新增专属 Renderer。
4. 后续逐套迁移内置模板：先补 CSS 语义钩子，再切换到通用结构 Renderer。

## 验收标准

- AI 生成候选不依赖 `business-timeline`、`portfolio-grid` 等历史 Renderer。
- `page` 能真实控制单栏、双栏和网格结构。
- `entry=timeline` 能生成通用轨道节点，而不是商务模板专属节点。
- 旧模板回归测试保持通过。
- 模板视觉差异由独立 CSS 负责，不靠复制 Renderer 函数。
