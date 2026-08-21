# dsh-resume

Campus Markdown resume workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DeepSeek edits resumes and CSS templates under `jobhunt/`.
You preview in the sidebar and export yourself.

Primary user guide (Chinese, for students): [README.md](./README.md)

## Install

```sh
dsh plugin --profile web add github:L3n3L/dsh-resume
```

Restart `dsh web` after install.

## Role split

| Role | Can do | Should not do |
| --- | --- | --- |
| Agent | Read/write md/css, optimize layout, render preview | Final PDF export, invent experience |
| User | Preview, confirm, export | — |

## License

MIT
