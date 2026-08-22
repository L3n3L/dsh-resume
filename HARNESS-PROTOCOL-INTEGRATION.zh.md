# Harness 主协议对接复盘

## 结论

这两项不需要插件自行伪造一套“主对话协议”。当前 Harness 客户端运行时已经提供了所需的主协议能力：

1. `Session.loadOlder()` + `snapshot.hasMore/loadingOlder`：按当前窗口最早 `seq` 向前翻页；
2. `ConversationSnapshot.nodes`：按结构化节点表达用户消息、助手消息、推理、工具调用结果、命令和待处理交互。

插件本次改为“主协议优先、旧宿主降级”，因此在支持该运行时的 Harness 中，AI 助手展示的是主对话事件窗口，而不是插件自己拼出来的一份摘要。

## 1. 历史分页游标

### 主协议来源

`Session.loadOlder()` 会使用当前事件窗口的首个 `seq` 作为 `beforeSeq`，向 Harness 请求上一页，并把结果 prepend 到同一个 Session 窗口。`snapshot.hasMore` 是是否还有更早记录的权威状态，`snapshot.loadingOlder` 用于防止重复请求。

### 插件行为

- AI 助手首次打开时仍定位在最新消息；
- 用户点击顶部“加载更早”时，优先调用 `mainConversation.session.loadOlder()`；
- 拉取期间按钮显示“正在加载更早…”并禁止重复点击；
- 历史插入后保留用户原来的滚动锚点，不把用户突然带回底部；
- `hasMore=false` 后不再显示分页按钮；
- 没有 `loadOlder()` 的旧宿主只展开已经拿到的内存窗口，并明确提示“没有更多可加载的历史记录”，不会假装已经完成游标分页。

### 为什么不在插件里自己维护游标

Session 的事件窗口需要和重连、实时事件、事件去重以及主对话切换保持一致。插件自行保存 `beforeSeq` 会产生重复事件、漏事件和切换会话后串历史的问题，所以游标的所有权必须留在 Harness Session。

## 2. 结构化 Think / Tool call / Read / Edit

### 主协议节点映射

| Harness 结构 | 插件任务流 | 展示规则 |
| --- | --- | --- |
| `AssistantMessageNode.blocks[kind=reasoning]` | Think | 按块顺序显示，可折叠 |
| `AssistantMessageNode.blocks[kind=tool-call]` | Tool call / Read / Edit | 读取 `name` 和 `argsRaw`，按工具名细分 |
| `ToolResultNode` | 对应 Tool call 的结果 | 读取 `call.name`、`content`、错误状态，继续放在原事件流位置 |
| `CommandNode` | Shell | 显示命令名、参数和成功/失败结果 |
| `snapshot.partial` | 实时 Assistant / Think / Tool call | 在最终消息落盘前先展示增量状态 |
| `snapshot.runningCalls` | 运行中的 Tool call | 立即展示为进行中，结果到达后变为完成 |
| `snapshot.pending` | Question | 保留交互卡片，用户回答后主对话继续推进 |

插件只在旧宿主没有结构化字段时，才使用文本兼容识别。兼容识别不是主路径，也不会覆盖结构化 `kind`。

### 关键修复

此前插件把一个助手节点的 reasoning、工具调用和最终回答都当成一段文本，导致 Think 和回答拼接、工具都挤在消息顶部。本次适配后，`conversationNodeSegments()` 先拆 `blocks`，`classifyTimelineNode()` 先看显式 `kind`，再把 Read / Edit / Grep / Shell 映射成对应任务行。

## 3. 性能与完整性边界

- 主协议窗口仍由 Harness 控制，插件不会一次读取整段长期历史；
- 插件默认渲染最近 24 个任务流项，向上翻页由 Harness 每页补充最多 50 条；
- 长文本仍支持展开/收起，但不会截断事件的结构与顺序；
- `partial`、`runningCalls` 只作为实时增量展示，不会在最终节点出现后重复保留；
- 主对话切换时清空滚动锚点和分页状态，避免把旧 Session 的位置带到新 Session。

## 4. 验收口径

### 历史分页

1. 打开一个有多轮历史的主对话，AI 助手默认停在最新消息；
2. 点击“加载更早”，出现上一页，并且当前可视位置不跳到底部；
3. 连续加载直到最早记录，按钮消失；
4. 切换主对话后，历史和滚动位置都属于新 Session。

### 结构化任务流

1. Think、Assistant 最终回答不再合并；
2. Read / Edit / Grep / Shell 依次出现在真实调用位置；
3. 工具运行中显示进行中，结果到达后显示完成或错误；
4. Question 默认展开并可完成主协议交互；
5. 没有结构化事件的旧宿主仍能看到可用的降级任务流，但不会宣称具备完整镜像能力。

## 5. 对 Harness 主协议的剩余建议

本插件已经可以消费现有协议，不需要新增临时接口。后续如果要进一步提升镜像一致性，建议由 Harness 主协议继续保证：

- `AssistantBlock.kind` 的枚举长期稳定；
- 工具调用与结果始终通过 `callId` 配对；
- `seq` 在历史分页、重连和实时事件之间保持单调且可去重；
- `loadOlder()` 在没有更多记录时稳定返回，不抛出误导性错误；
- `pending` 的 Question payload 和 `respond()` 生命周期保持兼容。

