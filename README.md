# dsh-resume

面向中国大学生的 **DeepSeek Harness 求职简历插件**。

你把岗位 JD 和自己的真实经历交给 DeepSeek；  
它帮你改 Markdown 简历、调模板排版；  
你在侧边栏预览，确认后再自己导出 HTML / PDF。

适合：校招、实习、按不同公司定制多版本简历。

> 需要先安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。这是插件，不是独立网站。

## 它能帮你做什么

- 按 JD 改一版更匹配的投递简历（不编造经历）
- 把经历整理成清晰模块：教育 / 技能 / 项目 / 实习
- 调整 CSS 模板，让排版更适合打印
- 同一份素材，为不同公司生成多份版本
- 侧边栏实时预览，导出由你确认

## 谁做什么

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| DeepSeek | 读写 `jobhunt/` 里的 md/css，优化措辞与排版，生成预览 | 替你最终导出、编造经历、自动投递 |
| 你 | 提供真实材料、检查内容、预览、导出 PDF/HTML | — |

原则很简单：**AI 改稿，你拍板。**

## 安装

要求：

- 已安装 DeepSeek Harness（建议 `dsh >= 0.1.0-rc.6`）
- Node.js 22+
- 使用 `web` 配置档

```sh
dsh plugin --profile web add github:L3n3L/dsh-resume
```

安装后重启：

```sh
dsh web
```

打开网页后，看侧边栏底部是否出现 **求职简历**。

## 5 分钟上手

1. 在对话里对 DeepSeek 说：先初始化求职工作区  
2. 把你的学校、专业、项目、实习、联系方式发给它（越真实越好）  
3. 粘贴目标岗位 JD  
4. 让它生成该公司对应的简历，并刷新预览  
5. 点侧边栏 **求职简历** → 检查内容 → **下载 HTML** 或 **导出 PDF**

### 可直接复制的第一句

```text
请先执行 jobhunt_init，初始化求职工作区。
这是我的真实经历（不要编造）：
- 学校 / 专业 / 毕业时间：
- 意向岗位 / 城市：
- 项目经历：
- 实习经历：
- 联系方式：

下面是岗位 JD：
（粘贴 JD）

请写入 companies/目标公司-岗位/jd.md 和 resume.md，
必要时微调 templates/default.css，
然后执行 jobhunt_render。
不要导出，我自己在侧边栏「求职简历」里预览和导出。
```

## 日常怎么跟它说话

### 按 JD 定制一版

```text
根据这份 JD，改 companies/字节跳动-前端实习/resume.md。
只强化真实匹配点，缺材料写到 notes.md，不要编造。
改完后 jobhunt_render。
```

### 先建素材库，再批量改

```text
先把我的项目和实习整理进 story-bank.md（STAR）。
然后基于素材库，分别生成：
1) companies/腾讯-产品运营/resume.md
2) companies/美团-数据分析/resume.md
每份都要贴合对应 JD，最后分别 render。
```

### 只改排版

```text
预览太疏/太挤了。
请只改 templates/default.css：收紧间距、统一字号、保持单栏打印友好。
然后重新 jobhunt_render。
```

### 检查有没有“注水”

```text
通读我的投递版简历，标出：
1) 可能被面试官追问但证据不足的句子
2) 空泛形容词
3) 与 JD 无关的段落
请改成更可验证的表述；不要新增事实。
```

## 文件都在哪

工作区在当前会话目录下的 `jobhunt/`：

```text
jobhunt/
  profile.md          # 求职意向
  resume.md           # 通用底稿
  story-bank.md       # 素材库（STAR）
  notes.md            # 缺口与复盘
  templates/
    default.md        # 模板约定
    default.css       # 样式（可让 AI 改）
  companies/
    公司-岗位/
      jd.md
      resume.md
      preview.html
```

说明：

- AI 改的是这里的文件，**不会改插件本身**
- 不同公司建议分目录，方便对比和复投
- `preview.html` 是预览结果，导出前以你在侧边栏看到的为准

## 预览和导出

1. 让 AI 执行 `jobhunt_render`
2. 打开侧边栏底部 **求职简历**
3. 点 **刷新** 查看最新预览
4. 导出：
   - **下载 HTML**：拿到网页版
   - **导出 PDF**：走浏览器打印，建议选「另存为 PDF」、去掉页眉页脚

设置页里也有「求职简历」入口，但日常用侧边栏更快。

## 使用建议（校招/实习）

- 先写 `story-bank.md`，再派生多版本，比每次从零改更稳
- 一岗一版本，目录名写清楚：`公司-岗位`
- 数字、职责、技术栈尽量可验证；面试会追问
- 材料不够时让 AI 写进 `notes.md`，别让它帮你“补齐假经历”
- 投递前自己通读一遍：联系方式、在线链接、日期、错别字

## 常见问题

**Q: 没有 DeepSeek Harness 能用吗？**  
不能。这是 Harness 插件，需要先装 `dsh` 并启动 `dsh web`。

**Q: 会不会自动帮我投递？**  
不会。它只帮你改简历和排版，投递和导出都由你完成。

**Q: AI 能直接导出最终 PDF 吗？**  
按设计不能替你做最终确认。预览和导出在侧边栏，由你验收。

**Q: 我的简历内容会被上传到这个 GitHub 仓库吗？**  
不会。简历在你本机工作区的 `jobhunt/` 里；仓库里只有插件代码。

**Q: 装完侧边栏没有「求职简历」？**  
确认安装的是 `web` profile，并已重启 `dsh web`。仍没有就检查插件是否安装成功。

## 给开发者

English README: [README.en.md](./README.en.md)  
设计说明：[DESIGN.zh.md](./DESIGN.zh.md)

```sh
pnpm install
dsh plugin --profile web add .
```

## License

MIT © L3n3L
