# DSH STORE 对接验收记录

这份记录用于把“源码静态检查”和“真实 DSH 运行验收”分开，避免把 `package.json` 声明误当成兼容性证据。

## 当前声明

- 包：`dsh-resume@0.1.3`
- Node.js：`>=22`
- DSH：`>=0.1.0-rc.6 <0.2.0-0`
- Profile：`web`
- Bundle 入口：`dsh-resume`
- 生命周期脚本：无 `preinstall`、`install`、`postinstall`、`prepare`
- 固定来源：必须使用默认分支的 40 位 Commit；工作树或浮动 `main` 不能作为商城证据

## 权限与依赖结论

插件会写入用户选择的简历工作区，并提供用户显式启动的本地 HTTP/MCP 路由；因此不能声明为无文件、无网络的低风险插件。运行时依赖为 `@modelcontextprotocol/server`、`markdown-it`、`zod`，DSH 官方包改为 peer dependency，由宿主提供。预期商城策略是 `user-reviewed` 或在证据不足时保持 `blocked`，而不是伪装成 `source-verified`。

## 一次性 Profile 验收矩阵

以下命令必须在临时 `DSH_HOME` 下执行。每次发布新固定 Commit 后重新执行，并把实际 Commit、时间、系统、Profile 和结果补到发布记录中；本文件不把未执行的结果写成 passed。

```powershell
$env:DSH_HOME = Join-Path $env:TEMP 'dsh-resume-store-evidence'
dsh plugin --profile dsh-resume-evidence add <fixed-commit-or-local-source>
dsh --profile dsh-resume-evidence --dump-config
dsh --profile dsh-resume-evidence --help
dsh plugin --profile dsh-resume-evidence remove dsh-resume
```

| DSH 版本 | install | start/config | uninstall | rollback | 证据 |
| --- | --- | --- | --- | --- | --- |
| `0.1.0-rc.6` | 待固定 Commit 后复测 | 待复测 | 待复测 | 待复测 | 不把本地工作树当作商城证据 |

### 2026-09-22 本地工作树复测结果

使用临时 `DSH_HOME` 和本地打包产物 `dsh-resume-0.1.3.tgz` 完成了一次实际生命周期复测。该结果只证明当前工作树能被 DSH `0.1.0-rc.6` 管理，不能替代发布后固定 Commit 的复测。

| 阶段 | 结果 | 证据 |
| --- | --- | --- |
| 安装 | 通过 | `dsh plugin --profile web add file:../../../dsh-resume-0.1.3.tgz` 成功；配置中出现 `dsh-resume`，且不再提示缺少 `dsh.bundle` |
| 启动 | 通过 | `dsh --profile web --host 127.0.0.1 --port 37991` 启动；首页返回 HTTP 200，启动页面包含 `dsh-resume` |
| 卸载 | 通过 | `dsh plugin --profile web remove dsh-resume` 成功；临时 `web` 和证据 Profile 下的插件目录均已清除 |

Windows 证据注意事项：`link:E:/...` 会被当前 DSH CLI 解析成错误的链接目标；复测应使用本地 tarball，或使用同一盘符下的正确相对 `file:` 规格。这个问题属于证据命令写法，不是插件运行时问题。

`--dump-config` 只能证明配置合成；它不能替代 Web 冷启动、MCP 健康检查或浏览器工作台 smoke。运行验收至少还要确认：插件入口只出现一次、Web 能启动、模板列表可读、预览路由可访问、MCP 默认关闭且显式启动后健康、卸载后入口消失。

## 当前审计边界

- 商城静态扫描不会执行第三方 `install`、`prepare`、`build`、`test` 或运行时代码。
- 本插件的文件写入、环境路径读取和本地网络能力是预期功能，不是漏洞，但必须进入用户审阅。
- 代码或依赖发生变化后，旧 Commit 的运行证据不能自动继承；必须重新绑定新的固定 Commit。
