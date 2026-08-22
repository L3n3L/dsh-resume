# 阶段 1：语义模块与图片资源对接复盘

## 1. 本阶段边界

本阶段只解决“AI 无法表达常见简历模块，尤其是头像”的问题，不改 Layout IR，也不改 A4 分页算法。

目标是让现有 `resume.layout.json` 增加少量真实语义，同时保证旧模板和旧工作区继续可用：

```text
Markdown 内容
→ 语义模块识别
→ 模块 Renderer
→ 资源 URL 安全转换
→ 现有 A4 分页与 metrics
```

## 2. 新增语义模块

| 类型 | 作用 | 典型用法 |
| --- | --- | --- |
| `photo` | 头像/照片容器 | `options.source`、`shape`、`size`、`placement` |
| `summary` | 个人简介或求职摘要 | 保留段落语义，使用摘要样式 |
| `contact` | 联系方式与外链 | 统一联系方式布局和可读性 |
| `skill-groups` | 分组技能 | 将技能条目按组展示，而不是普通列表 |

这些类型仍通过现有 `layout.json` 使用，不引入新的 Markdown 标记，也不会破坏旧的 14 种类型。

头像示例：

```json
{
  "id": "photo",
  "type": "photo",
  "source": "个人信息",
  "options": {
    "source": "assets/avatar.png",
    "alt": "林知远头像",
    "shape": "circle",
    "size": 88,
    "placement": "header"
  }
}
```

## 3. 图片资源策略

### 本地资源

- 统一放在 `jobhunt/assets/` 下；
- 预览中的本地图片转换为 `/dsh-resume/api/asset` 路由；
- 路由复用 `resolveUnderJobhunt`，拒绝路径穿越；
- 只提供 png、jpeg、webp、gif；
- 单文件限制 5 MB；
- 缺失或不支持的图片返回可见的 SVG 占位图。

### 远程资源

- 允许 `https://` 图片地址作为兜底；
- `http://`、脚本协议和任意 HTML 不进入图片 src；
- 远程资源不由插件代理，避免插件成为开放代理。

## 4. 兼容性决策

- 旧 `resume.layout.json` 不迁移也能继续渲染；
- 未识别模块仍回退到 `custom-section`；
- 现有 16 个内置模板不改变结构；
- 现有分页脚本继续把语义模块当作分页单元；
- Layout IR、列并行分页和模块拆分留到下一阶段单独设计。

## 5. 验收标准

1. 四种新模块有独立 class 和基础视觉语义。
2. Markdown 图片能显示本地资源或 HTTPS 远程资源。
3. 图片路径不能访问 `jobhunt/` 之外的文件。
4. 缺失图片有占位，不出现破图空白。
5. 旧模板测试和现有 A4 分页行为不回归。
6. 语义模块仍能进入现有 metrics 的模块明细。

## 6. 下一阶段入口

下一阶段再设计组合式 Layout IR，重点先解决：

- 双栏列并行分页；
- grid/card/timeline 的分页边界；
- 超高模块拆分策略；
- 旧 `mode/sidebarRatio` 到新 IR 的迁移。
