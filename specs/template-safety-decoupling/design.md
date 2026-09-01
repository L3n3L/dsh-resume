# 模板改造与简历版本解耦设计

## 1. 产品边界

把对象分成四层：

```text
内置模板（不可变）
       ↓ 复制
模板谱系 / 模板修订（模板库中的可复用资源）
       ↓ 应用
简历版本引用（templateId + revision + presentation 快照）
       ↓ 编辑
当前会话草稿（可丢弃，不进入模板库）
```

用户选中的模板始终是当前任务的视觉基线。Agent 可以在这个基线上重构布局、组件变体、信息密度和 CSS，但结构改造先进入草稿，接受后才落成派生模板。

## 2. 持久化模型

### 模板

保留现有 `templates/<id>.json` 和可选 `.css` 文件，并在 TemplateSpec 的 `metadata` 中增加可选字段：

```json
{
  "lineageId": "campus-standard",
  "sourceTemplateId": "campus-standard",
  "revision": 3,
  "createdAt": "2026-09-02T00:00:00.000Z",
  "updatedAt": "2026-09-02T00:00:00.000Z"
}
```

现有 `.dsh-resume/history/templates/<id>/` 继续保存历史快照。历史修订不可删除；恢复操作读取快照后写成新的当前修订，避免时间倒流和引用悬空。

### 简历版本

版本登记新增可选的模板引用快照：

```json
{
  "templateRef": {
    "templateId": "campus-standard-custom",
    "revision": 3,
    "lineageId": "campus-standard"
  },
  "presentation": {
    "fontSize": 13.5,
    "lineHeight": 1.5,
    "sectionGap": 16,
    "pageMargin": 38,
    "iconTuning": {}
  }
}
```

旧版本没有 `templateRef` 时，按现有 `presentation.templateId` 兼容读取；新保存优先写入引用快照和简历路径作用域。

## 3. 工具契约

- `template_copy`：从内置或自定义模板创建独立派生模板，复制 CSS 和来源信息；创建后不自动覆盖来源。
- `template_save`：默认只允许创建不存在的新模板 ID。更新已有自定义模板必须显式传入 `replaceExisting: true` 和 `confirmImpact: true`，返回受影响引用摘要。
- `template_restore`：默认恢复为新修订；不直接把历史快照覆盖成无来源的旧状态。
- `presentation_save`：增加 `resumePath` / `previewPath` 作用域；新数据绑定当前简历版本，旧调用无路径时保留兼容行为并返回迁移提示。
- `resume_render`：优先使用当前简历版本的 `templateRef`，显式 `templateId` 只在用户明确选择模板时覆盖当前草稿。

所有写工具继续经过 `resume_prepare` 和工作区锁。工具返回 `createdAsCopy`、`sourceTemplateId`、`templateRevision`、`impact` 和 `nextTools` 等机器可读字段，方便不读取长指南的 Agent 恢复正确工序。

## 4. 模板库交互

- 卡片显示：模板名、内置/自定义、当前修订、来源、适用标签和被引用数量。
- 应用操作：只把该模板修订作为当前简历草稿的基线，并刷新预览。
- 改造操作：复制到模板草稿编辑器，保留来源风格；结构/CSS 预览通过后再“另存为新模板”。
- 版本操作：查看修订列表、比较摘要、基于某修订创建新副本、恢复为新修订。
- 高风险操作：修改模板本体或覆盖同 ID 模板单独标红，显示影响范围并要求显式确认。

## 5. Agent 决策顺序

1. 读取当前简历版本和用户选定模板。
2. 若只是排版参数，修改当前简历 presentation 草稿。
3. 若需要重构模板风格/结构，以选定模板为基线复制，修改副本草稿并验证。
4. 验证通过后保存副本，绑定当前简历版本，再渲染并读取 A4 指标。
5. 只有用户明确要求共享模板本体变更时，才走覆盖流程。

禁止为了快速得到一页结果而静默换用其他模板；禁止用内容压缩替代模板承载改造。

## 6. 兼容与验证

- 旧 `presentation.json`、旧 TemplateSpec、旧模板历史均可读取。
- 现有 DSH 工具名和 MCP 基础 `tools/list` / `tools/call` 形态不变，只增加可选参数和返回字段。
- 验证包括：内置模板不可变、自定义模板默认冲突保护、复制保留 CSS/谱系、历史恢复不删除历史、同工作区两份简历的 presentation 隔离、旧数据读取、现有预览和手动调整回归。
