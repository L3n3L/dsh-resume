# dsh-resume

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的学生求职简历工作台。

- DeepSeek 负责读写 Markdown 简历与 CSS 模板、优化排版
- 你负责预览验收，并亲手导出

> 产品思路参考了常见的 Markdown 简历路径（Markdown -> 模块 -> 模板 -> 预览/导出）。
> 代码、模板、UI 均为独立实现，未复制第三方简历应用源码。

## 功能

- Host 工具：`jobhunt_init` / `list` / `read` / `write` / `render`
- 本地 `jobhunt/` 工作区
- 自研轻量 Markdown -> HTML 渲染 + 可编辑 CSS 模板
- 侧边栏预览入口
- 用户导出：下载 HTML / 打印为 PDF
- 设置页保留为次入口

## 安装

```sh
dsh plugin --profile web add github:L3n3L/dsh-resume
```

本地目录：

```sh
dsh plugin --profile web add .
```

安装后重启 `dsh web`。

## 使用

1. 让 Agent 执行 `jobhunt_init`
2. 给出 JD，生成 `companies/<公司>/resume.md`
3. 执行 `jobhunt_render`
4. 打开侧边栏预览
5. 预览后自行导出

详细设计见 [DESIGN.zh.md](./DESIGN.zh.md)。

## 发现

请给仓库加上 GitHub topic：`dsh-plugin`。

## License

MIT
