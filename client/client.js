window.__ModuleLoader__.load({
  id: 'dsh-resume',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { useCallback, useEffect, useMemo, useState } = React

    const inject = ['slots']
    const CSS_ID = 'dsh-resume/panel.v3.css'

    const css = `
.cj-foot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.cj-footBtn {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 36px;
  width: 100%;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--dsw-alias-label-primary, #111);
  font-size: 14px;
  line-height: 22px;
}
.cj-footBtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
}
.cj-footBtn[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.16));
}
.cj-footBtn[data-wide="false"] {
  width: 36px;
  padding: 0;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.cj-panel {
  position: fixed;
  left: 72px;
  bottom: 20px;
  z-index: 80;
  width: min(780px, calc(100vw - 96px));
  height: min(840px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22));
  background: var(--dsw-alias-bg-module-platform, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.16);
}
.cj-panel[data-wide="true"] { left: 268px; }
.cj-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18));
}
.cj-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: -0.01em;
}
.cj-subtitle {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.cj-textBtn {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 32px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.cj-textBtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary, #111);
}
.cj-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 18px 18px;
}
.cj-settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 520px;
}
.cj-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cj-selectWrap {
  flex: 1;
  min-width: 220px;
}
.cj-select {
  appearance: none;
  width: 100%;
  height: 36px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22));
  background:
    linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-secondary, #6b7280) 50%) calc(100% - 18px) calc(1em + 2px) / 5px 5px no-repeat,
    linear-gradient(135deg, var(--dsw-alias-label-secondary, #6b7280) 50%, transparent 50%) calc(100% - 13px) calc(1em + 2px) / 5px 5px no-repeat,
    transparent;
  color: inherit;
  padding: 0 36px 0 12px;
  font: inherit;
  font-size: 13px;
}
.cj-select:focus {
  outline: 2px solid rgba(59,130,246,.28);
  outline-offset: 1px;
}
.cj-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10));
}
.cj-action {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  line-height: 30px;
  color: var(--dsw-alias-label-primary, #111);
  white-space: nowrap;
}
.cj-action:hover:not(:disabled) {
  background: var(--dsw-alias-bg-module-platform, #fff);
}
.cj-action:disabled {
  opacity: 0.4;
  cursor: default;
}
.cj-actionPrimary {
  background: var(--dsw-alias-label-primary, #111);
  color: var(--dsw-alias-bg-module-platform, #fff);
}
.cj-actionPrimary:hover:not(:disabled) {
  filter: brightness(1.08);
  background: var(--dsw-alias-label-primary, #111);
}
.cj-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.cj-error {
  font-size: 12px;
  line-height: 18px;
  color: #b91c1c;
}
.cj-frame {
  flex: 1;
  min-height: 0;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18));
  background: #f5f6f8;
}
.cj-frame iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.cj-empty {
  height: 100%;
  min-height: 360px;
  display: grid;
  place-items: center;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
}
`

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_ID)}]`)) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-resume'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function useStatus(refreshKey) {
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [loading, setLoading] = useState(true)

      const reload = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const res = await fetch('/dsh-resume/api/status', { cache: 'no-store' })
          if (!res.ok) throw new Error(`status ${res.status}`)
          setStatus(await res.json())
        } catch (err) {
          setError(String(err?.message || err))
          setStatus(null)
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        void reload()
      }, [reload, refreshKey])

      return { status, error, loading, reload }
    }

    function PreviewWorkbench({ compact }) {
      ensureCss()
      const [tick, setTick] = useState(0)
      const { status, error, loading, reload } = useStatus(tick)
      const [selected, setSelected] = useState('')

      useEffect(() => {
        if (!selected && status?.previewRel) setSelected(status.previewRel)
        if (!selected && status?.previews?.length) setSelected(status.previews[0])
      }, [status, selected])

      const previewSrc = useMemo(() => {
        if (!selected) return null
        return `/dsh-resume/preview?path=${encodeURIComponent(selected)}&t=${tick}`
      }, [selected, tick])

      const onRefresh = () => {
        setTick((n) => n + 1)
        void reload()
      }

      const onDownload = async () => {
        if (!previewSrc) return
        const res = await fetch(previewSrc, { cache: 'no-store' })
        const html = await res.text()
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (selected || 'resume-preview').replace(/[\\/]/g, '_')
        a.click()
        URL.revokeObjectURL(url)
      }

      const onPrint = () => {
        if (!previewSrc) return
        const w = window.open(previewSrc, '_blank', 'noopener,noreferrer')
        if (!w) return
        const timer = setInterval(() => {
          try {
            if (w.document && w.document.readyState === 'complete') {
              clearInterval(timer)
              w.focus()
              w.print()
            }
          } catch {
            clearInterval(timer)
          }
        }, 200)
      }

      return React.createElement(
        'div',
        { className: compact ? 'cj-body' : 'cj-settings', style: compact ? { padding: 0 } : undefined },
        !compact &&
          React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'cj-title' }, '求职简历预览'),
            React.createElement('div', { className: 'cj-subtitle' }, 'Agent 负责改稿与排版，导出由你确认。'),
          ),
        React.createElement(
          'div',
          { className: 'cj-toolbar' },
          React.createElement(
            'div',
            { className: 'cj-selectWrap' },
            React.createElement(
              'select',
              {
                className: 'cj-select',
                value: selected,
                onChange: (e) => setSelected(e.target.value),
              },
              ...(status?.previews?.length
                ? status.previews.map((p) => React.createElement('option', { key: p, value: p }, p))
                : [React.createElement('option', { key: 'empty', value: '' }, loading ? '加载中…' : '暂无 preview.html')]),
            ),
          ),
          React.createElement(
            'div',
            { className: 'cj-actions' },
            React.createElement('button', { type: 'button', className: 'cj-action', onClick: onRefresh }, '刷新'),
            React.createElement(
              'button',
              { type: 'button', className: 'cj-action', onClick: onDownload, disabled: !previewSrc },
              '下载 HTML',
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'cj-action cj-actionPrimary',
                onClick: onPrint,
                disabled: !previewSrc,
              },
              '导出 PDF',
            ),
          ),
        ),
        error ? React.createElement('div', { className: 'cj-error' }, error) : null,
        React.createElement(
          'div',
          { className: 'cj-meta' },
          status?.root ? `工作区 ${status.root}` : '还没有预览。先让 Agent 执行 jobhunt_render。',
        ),
        React.createElement(
          'div',
          { className: 'cj-frame', style: { minHeight: compact ? 440 : 480 } },
          previewSrc
            ? React.createElement('iframe', { title: 'resume-preview', src: previewSrc })
            : React.createElement('div', { className: 'cj-empty' }, '等待预览文件'),
        ),
      )
    }

    function CampusJobSettingsSection() {
      return React.createElement(PreviewWorkbench, { compact: false })
    }

    function CampusJobFooterAction({ wide }) {
      ensureCss()
      const [open, setOpen] = useState(false)

      return React.createElement(
        'div',
        { className: 'cj-foot' },
        open
          ? React.createElement(
              'section',
              { className: 'cj-panel', 'data-wide': wide ? 'true' : 'false', 'aria-label': '求职简历预览' },
              React.createElement(
                'header',
                { className: 'cj-header' },
                React.createElement(
                  'div',
                  null,
                  React.createElement('div', { className: 'cj-title' }, '求职简历'),
                  React.createElement('div', { className: 'cj-subtitle' }, '预览投递版，确认后再导出'),
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'cj-textBtn',
                    onClick: () => setOpen(false),
                  },
                  '关闭',
                ),
              ),
              React.createElement(PreviewWorkbench, { compact: true }),
            )
          : null,
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'cj-footBtn',
            'data-wide': wide ? 'true' : 'false',
            'data-active': open ? 'true' : 'false',
            title: '求职简历',
            'aria-label': '求职简历',
            onClick: () => setOpen((v) => !v),
          },
          wide ? '求职简历' : '简历',
        ),
      )
    }

    function apply(ctx) {
      ensureCss()

      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'dsh-resume',
            order: 40,
          },
          CampusJobFooterAction,
        ),
      )

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'dsh-resume',
            order: 85,
            label: '求职简历',
          },
          CampusJobSettingsSection,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})

