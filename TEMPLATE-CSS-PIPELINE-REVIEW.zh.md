# 模板 CSS 独立化对接复盘

## 1. 本次目标

本次不是推翻现有渲染框架，也不是把 CodeCV 的实现搬过来，而是解决 dsh-resume 当前模板视觉表达受限的问题：

> 模板不再只有 Token 参数，而是“安全的结构 JSON + 独立视觉 CSS + 可控的用户微调”。

保留现有的 Layout IR、语义模块、A4 分页、浏览器测量和自动调优；只升级模板视觉层，使 AI 能够表达更丰富的版式、装饰、卡片、轨道、标题和背景关系。

## 2. 问题复盘

现有链路存在三个明显限制：

1. 模板主要依赖 `visual`、`typography`、`spacing` 等 Token，不足以表达完整的视觉系统。
2. `renderer.js` 在运行时追加 tuningStyle，且大量视觉规则使用 `!important`，模板 CSS 即使存在也容易被默认规则覆盖。
3. `customCss` 过去只有 16KB，并且把所有 `url()` 一律拒绝，AI 无法使用安全的内联 SVG 或本地资源服务。

这会导致“AI 生成了视觉意图，但预览看不出来”，最终模板之间只能换颜色、字号和间距。

## 3. 新的模板契约

### 3.1 文件结构

内置模板：

```text
lib/templates/<id>.css
```

用户模板：

```text
jobhunt/templates/<id>.json
jobhunt/templates/<id>.css
```

JSON 继续承载结构、Token、Renderer 和 Layout IR；同名 CSS 承载完整视觉表达。CSS 文件不存在时自动回退到原有行为，旧模板无需迁移即可继续使用。

### 3.2 AI 对接格式

`jobhunt_template_generate` / `jobhunt_template_save` 支持在模板 JSON 中临时携带：

```json
{
  "id": "editorial-card",
  "renderer": "magazine-feature",
  "templateCss": ".resume-document[data-template-id=\"editorial-card\"] .dsh-case-feature { ... }"
}
```

保存时：

- JSON 文件不保存大段 CSS；
- `templateCss` 写入 `templates/editorial-card.css`；
- 模板版本快照同时记录 CSS，恢复版本不会出现 JSON 与 CSS 错位；
- 复制模板会同时复制 CSS。

## 4. 样式注入顺序

最终顺序为：

```text
default.css
→ 框架默认视觉规则
→ 模板独立 CSS
→ AI customCss
→ 用户手动 Token 覆盖
→ A4 / 分页契约
```

其中：

- 框架默认视觉规则不再用 `!important` 压制模板；
- 模板 CSS 可以改变颜色以外的完整视觉关系；
- `customCss` 用于当前模板的微调；
- 用户手动字号、行高、模块间距、页边距和颜色仍然有最高优先级；
- A4 页面尺寸、分页容器、溢出裁切等契约保留 `!important`，防止模板 CSS 破坏测量闭环。

这样既释放模板设计能力，也不会让手动调节或 A4 测量失效。

## 5. CSS 安全边界

不允许：

- `<style>`、`<script>`、`@import`、`@namespace`；
- `javascript:`、`expression()`、`behavior:`；
- 外部 `http(s)`、协议相对路径和未知资源 URL；
- `customCss` 中的 `@font-face`。

允许：

- 普通布局、渐变、阴影、伪元素和 CSS 变量；
- `data:image/*` 内联图片/SVG（会拒绝脚本、事件属性和 `foreignObject`）；
- `/dsh-resume/api/asset?...` 同源本地资源服务；
- `#fragment` 形式的 SVG 内部引用。

CSS 长度上限由 16KB 提升到 64KB，仍然经过校验，不放开外链和脚本能力。

## 6. 兼容策略

| 场景 | 行为 |
| --- | --- |
| 旧模板只有 JSON | 继续使用默认 CSS 和现有 Renderer |
| 新模板有同名 CSS | 自动加载并注入模板 CSS |
| CSS 文件缺失 | 空 CSS 回退，不阻断模板加载 |
| CSS 校验失败 | 模板加载/保存失败，并返回明确错误 |
| 旧版本历史快照 | 仍可恢复，CSS 缺失时回退 |
| 复制自定义模板 | JSON 与同名 CSS 一起复制 |

## 7. 本次实施结果

- 增加独立 `templateCss` 读写和版本快照能力；
- 模板预览加载同名 CSS；
- 拆分默认视觉规则、手动 Token 覆盖和 A4 分页契约；
- 将 `customCss` 上限提升至 64KB；
- 将 `url()` 改为 data image / 同源 asset / SVG fragment 白名单；
- 增加代表性内置模板 CSS 示例；
- 增加“未初始化工作区也能生成模板缩略图”的回归覆盖，避免模板工坊再次出现空白卡片。

## 8. 验收标准

1. 旧 20 个内置模板仍能渲染。
2. 自定义模板保存后同时出现 `.json` 和 `.css`。
3. CSS 修改后预览视觉发生变化，不需要修改 Renderer。
4. 手动 Token 调整仍然即时生效。
5. A4 页面仍固定为 794×1123，分页和 metrics 不被自定义 CSS 破坏。
6. 外链 URL、脚本和危险 CSS 被拒绝，data SVG 与本地 asset 可以使用。
7. 复制、版本、恢复不会丢失 CSS。

## 9. 下一步

本次先完成 CSS 管线和契约解耦。下一阶段再把更多代表性视觉族迁移到独立 CSS 文件，并让 AI 在 DesignBrief 中输出“视觉意图 + CSS 组件选择”，减少直接生成大段 CSS 的不稳定性。

