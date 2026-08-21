# dsh-resume

给中国大学生用的 DeepSeek Harness 求职简历插件。

核心就一句话：**DeepSeek 帮你改简历、对 JD、调排版；你负责预览确认和导出。**

## DeepSeek 能干什么

装好插件后，你可以直接在对话里让它做这些事：

### 1. 初始化求职工作区
自动创建 `jobhunt/` 目录，放好底稿、素材库、模板和公司分包结构。

```text
请执行 jobhunt_init，初始化求职工作区。
```

### 2. 根据 JD 定制简历
读取岗位要求，把你的真实经历改成更匹配的投递版：调整模块顺序、强化相关项目、删掉无关表述。

```text
这是我的真实经历（不要编造）：
（粘贴经历）

这是 JD：
（粘贴 JD）

请写入 companies/美团-数据分析实习/jd.md 和 resume.md，
然后执行 jobhunt_render。
```

### 3. 读写并维护整套求职材料
DeepSeek 可以在 `jobhunt/` 里读写这些内容：

- `profile.md`：求职意向、城市、到岗时间
- `resume.md`：通用底稿
- `story-bank.md`：项目/实习素材（STAR）
- `notes.md`：缺口、面试反馈、待补材料
- `companies/<公司-岗位>/jd.md`：岗位描述
- `companies/<公司-岗位>/resume.md`：该公司投递版
- `templates/default.css`：简历样式

```text
先把我的项目和实习整理进 story-bank.md。
再基于素材库生成腾讯和字节两份不同投递版。
```

### 4. 优化措辞，但不编造经历
它擅长把空泛句子改成更可验证的表述，标出证据不足的地方，并把缺口记到 `notes.md`。

```text
通读这份投递版，标出空泛形容和可能被追问但证据不足的句子。
改成更具体的表述；缺材料写 notes.md，不要新增事实。
```

### 5. 调整排版和视觉样式
可以改 CSS 模板：疏密、字号、标题层级、打印友好的单栏布局，改完重新渲染预览。

```text
预览太散了。请只改 templates/default.css，收紧间距、统一字号，保持单栏打印友好，然后 jobhunt_render。
```

### 6. 选择安全的视觉模板

可以先让 DeepSeek 执行 `jobhunt_template_list`，从原创内置模板中选择视觉基线。模板只改变视觉 Token，不覆盖 `resume.md`；如果要生成新模板，应先用 `jobhunt_template_validate` 校验 JSON，再进入预览。

当前内置：

- `campus-standard`：校招标准
- `tech-compact`：技术极简
- `quiet-editorial`：安静编辑
- `mono-terminal`：黑白终端

### 7. 生成预览供你验收
执行 `jobhunt_render` 后，侧边栏「求职简历」能看到最新效果。  
**最终导出 HTML / PDF 由你来做**，DeepSeek 不替你点导出。

```text
渲染预览，然后告诉我去侧边栏「求职简历」检查。不要导出。
```

## DeepSeek 故意不做什么

- 不编造实习、项目、奖项、数据
- 不替你最终导出 PDF
- 不自动投递简历
- 不偷偷改插件本身，只改工作区 `jobhunt/`

## 你怎么用它（最短路径）

1. 安装插件并重启 `dsh web`
2. 对 DeepSeek 说：初始化 + 这是我的经历 + 这是 JD
3. 让它生成公司目录下的简历并 `jobhunt_render`
4. 打开侧边栏 **求职简历** 预览
5. 你自己 **下载 HTML** 或 **导出 PDF**

### 推荐第一句（直接复制）

```text
请先 jobhunt_init。
我的真实材料如下（禁止编造）：
- 学校 / 专业 / 时间：
- 意向岗位：
- 项目：
- 实习：
- 联系方式：

JD 如下：
（粘贴）

请生成 companies/目标公司-岗位/ 下的 jd.md、resume.md，
必要时微调 templates/default.css，
再 jobhunt_render。
我自己去侧边栏「求职简历」预览和导出。
```

## 安装

```sh
dsh plugin --profile web add github:L3n3L/dsh-resume
```

然后重启：

```sh
dsh web
```

要求：DeepSeek Harness（建议 `dsh >= 0.1.0-rc.6`）、Node.js 22+、`web` profile。

## 工作区长什么样

```text
jobhunt/
  profile.md
  resume.md
  story-bank.md
  notes.md
  templates/
    default.md
    default.css
  companies/
    公司-岗位/
      jd.md
      resume.md
      preview.html
```

## 常见问题

**DeepSeek 能直接给我最终 PDF 吗？**  
能帮你改到可导出状态，但最终导出在侧边栏，由你确认后操作。

**它会不会为了好看瞎写经历？**  
按设计不应编造。你应明确说「不要编造」；缺材料让它写进 `notes.md`。

**我的简历会上传到 GitHub 吗？**  
不会。内容在你本机 `jobhunt/`，仓库里只有插件代码。

## 其他

- English: [README.en.md](./README.en.md)
- 设计说明: [DESIGN.zh.md](./DESIGN.zh.md)
- License: MIT © L3n3L
