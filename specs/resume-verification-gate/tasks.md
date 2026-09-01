# 实施任务

- [x] 1. 扩展 MCP 工作流状态与 layout decision
  - 记录当前检查、渲染、指标及最终验收关联信息
  - 让任何变更清除旧验收
  - 需求：1、2、5、6

- [x] 2. 增加 `resume_finalize` 最终验收工具
  - 统一检查 contentHash/renderId/metrics 一致性
  - pending、超页、稀疏返回 blocked；合格返回 accepted
  - 需求：3、4、5

- [x] 3. 显式反馈预览指标传输错误
  - 移除指标上报路径的静默失败
  - 让 DSH 面板展示可诊断状态
  - 需求：7

- [x] 4. 补充回归测试并运行完整测试集
  - 覆盖状态转换和 DSH 兼容性
  - 需求：全部

- [x] 5. 更新 MCP 指南与接口说明
  - 强制 Agent 把 `resume_finalize` 作为完成前最后一步
  - 需求：2、3、5
