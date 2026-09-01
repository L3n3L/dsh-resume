# 设计

## 状态模型

`draft -> rendered -> verification_pending -> accepted`

任何写入会回到 `draft`；测量为 overfull/sparse/review 时进入 `needs_revision`，仍允许继续写入。只有 `resume_finalize` 能产生最终交付状态。

## MCP 边界

- `resume_write`、模板变更、呈现变更：自由写入，清除旧检查、渲染和指标。
- `resume_check`：记录当前 contentHash 的确定性检查。
- `resume_render`：记录当前 contentHash 和 renderId，并注册 DSH HTTP 预览。
- `resume_metrics`：读取匹配预览的真实指标，更新工作流状态和 layout decision。
- `resume_finalize`：只读最终验收闸门；不写文件，返回结构化 blocked/accepted 结果。

## 指标一致性

最终验收必须同时匹配：工作区、简历路径、当前 contentHash、当前 previewPath 和当前 renderId。指标 pending、旧渲染指标或浏览器错误都不能通过。

## 错误反馈

预览端 POST 指标时检查 HTTP 响应；失败向父窗口发送 `dsh-resume-metrics-error`。DSH 面板显示错误状态，并保留后续重试路径。

## 测试策略

- MCP 单元测试覆盖未准备、写入后、渲染后无指标、匹配指标通过、超页阻断、通过后再次写入失效。
- 渲染测试检查指标上报失败不会被静默吞掉。
- HTTP 路由测试保持现有工作区绑定和 MCP 启停行为不变。
