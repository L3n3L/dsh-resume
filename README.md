# dsh-resume

Campus job resume workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DeepSeek edits Markdown resumes and CSS templates.
You preview in the UI and export yourself.

> Inspired by the general Markdown-resume workflow (Markdown -> modules -> template -> preview/export).
> Implementation, templates, and UI are independent. No third-party resume-app source was copied.

## Features

- Host tools: `jobhunt_init` / `list` / `read` / `write` / `render`
- Local workspace under `jobhunt/`
- Lightweight Markdown -> HTML renderer + editable CSS template
- Sidebar entry for preview
- User-owned export: download HTML / print to PDF
- Settings page kept as a secondary entry

## Requirements

- DeepSeek Harness `web` profile (`dsh` >= `0.1.0-rc.6` recommended)
- Node.js 22+

## Install

```sh
dsh plugin --profile web add github:L3n3L/dsh-resume
```

Or from a local checkout:

```sh
dsh plugin --profile web add .
```

Restart `dsh web` after install.

## Usage

1. Ask the agent to run `jobhunt_init`
2. Provide a JD and ask it to write `companies/<company>/resume.md`
3. Ask it to run `jobhunt_render`
4. Open the sidebar preview panel
5. Preview, then export yourself

### Example prompt

```text
Initialize jobhunt, then tailor my resume for this JD.
Write companies/example-frontend/jd.md and resume.md.
Adjust templates/default.css if needed.
Run jobhunt_render.
Do not export — I will preview in the sidebar.
```

## Workspace layout

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
    <company-role>/
      jd.md
      resume.md
      preview.html
```

## Role split

| Role | Can do | Should not do |
| --- | --- | --- |
| Agent | Read/write md/css, optimize layout, render preview | Final PDF export, invent experience |
| User | Preview, confirm, export | — |

## Development

```sh
pnpm install
```

Design notes (Chinese): [DESIGN.zh.md](./DESIGN.zh.md)

## Discoverability

Add the GitHub topic `dsh-plugin` to the repository.

## License

MIT
