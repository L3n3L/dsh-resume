# AI 聊天与 Markdown 编辑对接复盘

## 结论

简历内容的主入口采用 Markdown，预览页本身就是主工作区。插件打开后直接进入全屏工作区：左侧改 Markdown，右侧看 A4 结果，不再增加“编辑 Markdown”的第三个页面。

AI 面板不是另一个独立模型，而是把用户意图、当前简历路径、模板和浏览器测量结果桥接给 Harness 主对话。AI 返回建议后先进入草稿，用户确认后才保存到 `resume.md`。

## 本轮复盘

### 已确认的问题

1. 预览页只有结果，没有直接修改内容的入口。
2. 如果把编辑、模板、排版控制和 AI 永久放在右侧，信息会过载。
3. “聊天框”如果没有 Harness 主对话通道，很容易变成一个只能收集文字的假功能。
4. AI 直接覆盖简历文件会破坏用户的撤销和事实确认流程。

### 交互决策

- 预览页常驻 Markdown 编辑器，不再增加编辑入口或第三个页面。
- 插件工作区和编辑工作台都使用整个浏览器视口，不再出现“小浮窗 → 全屏编辑 → 小浮窗”的双层退出路径。
- 左侧是 Markdown，右侧是实时 A4 预览；AI 默认收起。
- 模板通过预览页顶部的快速换模板弹层选择，选择后自动收起并留在当前预览。
- 手动调整通过一个独立按钮打开滑块弹层，默认不挤占工作区；排版状态只显示“留白百分比 · 页数”的轻量文字。
- AI 只在用户主动打开后出现，默认只带当前简历、模板和排版指标。
- AI 的候选内容先放入草稿，点击“应用到编辑器”后再由用户决定是否保存。
- 没有主对话桥接监听时，不显示“已完成”，而是明确提示并提供“复制任务到主对话”。

## 数据流

```text
Markdown 编辑器
  ├─ POST /dsh-resume/api/editor/preview
  │    └─ 内存草稿 → editor-preview → A4 iframe
  ├─ POST /dsh-resume/api/editor/save
  │    └─ 用户确认后写回 resume.md，并重新渲染
  └─ dsh-resume:assistant-request
       └─ Harness 主对话桥接
            └─ 读取、改写、渲染、测量
                 └─ dsh-resume:assistant-response
```

## 主对话桥接协议

请求事件名称：`dsh-resume:assistant-request`

```json
{
  "source": "dsh-resume",
  "type": "dsh-resume:assistant-request",
  "payload": {
    "requestId": "resume-...",
    "message": "把项目经历压缩两行，保留技术成果",
    "context": {
      "resumePath": "resume.md",
      "previewPath": "preview.html",
      "templateId": "campus-standard",
      "selectedText": "当前 Markdown 草稿",
      "metrics": {
        "pageCount": 1,
        "overflow": false,
        "blankRatio": 0.08
      }
    }
  }
}
```

主对话完成后，可以通过 `postMessage` 或同名自定义事件返回：

```json
{
  "source": "dsh-harness",
  "type": "dsh-resume:assistant-response",
  "requestId": "resume-...",
  "text": "我压缩了项目描述，保留了技术成果。",
  "summary": "项目经历减少 2 行",
  "content": "可选：完整的候选 Markdown"
}
```

`content` 是可选的。没有候选内容时，面板只展示 AI 的说明，不会擅自修改文件。

## 责任边界

- `resume.md` 是内容源文件。
- 模板和排版参数不写入用户正文。
- AI 默认只改内容，不改模板；用户明确提出视觉要求时才调整模板。
- 保存是用户动作，不由聊天消息自动触发。
- 页面是否“刚好一页”必须以浏览器测量结果为准，不以文本长度推测。

## 验收标准

### Markdown 编辑

- 进入预览页后直接看到 Markdown 编辑器，不需要再点击编辑。
- 左侧修改 Markdown 后，右侧预览在短暂防抖后更新。
- 未保存草稿不会覆盖磁盘上的 `resume.md`。
- 点击保存后能重新生成预览。
- 返回预览不会丢失当前草稿，除非用户主动关闭工作台。

### AI 面板

- AI 面板默认收起，页面不出现固定聊天框。
- 打开后能看到当前简历上下文提示。
- 发送消息会带上简历路径、模板和最新排版指标。
- 收到候选 Markdown 后只能“应用到编辑器”，不能直接写文件。
- 没有桥接监听时，必须明确显示“未接入监听”，并能复制完整任务。

### 视觉控制

- 预览工作区使用整个浏览器视口的全部可用空间。
- 手动调整弹层包含字号、行高、模块间距、页边距，并支持撤销和恢复默认。
- 桌面端显示 Markdown + A4 并排。
- 窄屏自动变为纵向堆叠，不出现横向溢出。
- AI 面板展开后不会覆盖编辑区和预览区。

## 下一步

当前代码已经完成编辑工作台、内存草稿预览、确认式保存和桥接协议。下一步需要在 Harness Web 主会话侧接入 `dsh-resume:assistant-request`，让请求真正进入当前会话的 Agent，而不是仅复制到主对话。

接入完成后，再增加 CodeMirror 6 的 Markdown 语法体验、选区级 AI 修改和修改前后 diff；这些属于编辑器增强，不应阻塞第一版用户流程。

## 本地调试验收

固定使用仓库脚本启动本地服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\4-工具\scripts\start-web.ps1 -Port 3100
```

浏览器使用新标签打开 `http://127.0.0.1:3100/`。如果标签已经显示“无法访问此站点”，不要继续复用该错误标签；关闭后新开标签。`0.0.0.0` 不作为调试参数，因为 Harness 会主动禁止对外暴露本地服务。
