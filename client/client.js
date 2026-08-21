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
  width: min(960px, calc(100vw - 96px));
  height: min(900px, calc(100vh - 40px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22));
  background: var(--dsw-alias-bg-module-platform, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.22);
}
.cj-panel[data-wide="true"] { left: 268px; }
.cj-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18));
}
.cj-title {
  font-size: 17px;
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
  gap: 12px;
  padding: 14px 22px 22px;
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
  gap: 8px;
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
  border-radius: 11px;
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
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08));
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
.cj-fitBadge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  background: rgba(22, 163, 74, .10);
  color: #15803d;
  font-size: 12px;
  white-space: nowrap;
}
.cj-fitBadge[data-state="overflow"] { background: rgba(185, 28, 28, .10); color: #b91c1c; }
.cj-fitBadge[data-state="multi"] { background: rgba(37, 99, 235, .10); color: #1d4ed8; }
.cj-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  background: #eef1f5;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, .05);
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
.cj-workbench {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fb;
}
.cj-workbenchTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 22px;
  border-bottom: 1px solid rgba(15, 23, 42, .08);
  background: rgba(255,255,255,.86);
}
.cj-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.cj-brandIcon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #14213d;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}
.cj-brandTitle { font-size: 15px; font-weight: 700; line-height: 20px; }
.cj-brandDesc { margin-top: 1px; font-size: 11px; color: #7b8496; line-height: 16px; }
.cj-topActions { display: flex; align-items: center; gap: 8px; }
.cj-ghostAction, .cj-solidAction {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  height: 32px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 32px;
  white-space: nowrap;
}
.cj-ghostAction { color: #536078; }
.cj-ghostAction:hover { background: #edf0f5; color: #14213d; }
.cj-solidAction { background: #14213d; color: #fff; }
.cj-solidAction:hover { background: #23375f; }
.cj-workbenchBody { min-height: 0; flex: 1; display: grid; grid-template-columns: 120px minmax(0, 1fr) 218px; overflow: hidden; }
.cj-nav {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 10px;
  border-right: 1px solid rgba(15,23,42,.08);
  background: #f1f3f7;
}
.cj-navLabel { padding: 0 10px 8px; color: #98a1b2; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.cj-navItem {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 9px;
  color: #657087;
  font-size: 12px;
}
.cj-navItem:hover { background: #e7eaf0; color: #14213d; }
.cj-navItem[data-active="true"] { background: #fff; color: #14213d; font-weight: 700; box-shadow: 0 2px 7px rgba(15,23,42,.07); }
.cj-navIcon { width: 18px; text-align: center; font-size: 14px; }
.cj-navFoot { margin-top: 18px; padding: 12px 10px 0; border-top: 1px solid rgba(15,23,42,.07); color: #99a2b3; font-size: 11px; line-height: 17px; }
.cj-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: auto; padding: 16px; gap: 11px; }
.cj-mainBar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; }
.cj-mainHeading { font-size: 13px; font-weight: 700; color: #26334d; }
.cj-mainHint { margin-top: 2px; color: #8b95a7; font-size: 11px; }
.cj-fileSelect { min-width: 0; max-width: 270px; height: 30px; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #536078; padding: 0 9px; font-size: 11px; }
.cj-templateGallery { display: flex; gap: 8px; min-height: 104px; overflow-x: auto; padding: 1px 1px 4px; }
.cj-templateGallery[data-library="true"] { flex-wrap: wrap; align-content: flex-start; min-height: 0; overflow: visible; }
.cj-templateCard { all: unset; box-sizing: border-box; flex: 0 0 116px; cursor: pointer; padding: 5px; border: 1px solid #e1e6ee; border-radius: 10px; background: #fff; }
.cj-templateCard:hover { border-color: #9db5e8; box-shadow: 0 3px 12px rgba(45,80,150,.08); }
.cj-templateCard[data-active="true"] { border-color: #3559a8; box-shadow: 0 0 0 2px rgba(53,89,168,.12); }
.cj-templatePaper { position: relative; height: 63px; overflow: hidden; padding: 8px 9px; border: 1px solid #e7eaf0; border-radius: 3px; background: #fff; color: #26334d; }
.cj-thumbTop { display: flex; align-items: flex-end; gap: 5px; height: 12px; }
.cj-thumbTop:before { content: ''; display: block; width: 26px; height: 5px; border-radius: 1px; background: currentColor; }
.cj-thumbTop:after { content: ''; display: block; width: 42px; height: 3px; border-radius: 1px; background: #cbd3df; }
.cj-thumbRule { height: 2px; margin-top: 5px; background: #3559a8; }
.cj-thumbSection { width: 42px; height: 4px; margin-top: 8px; background: currentColor; box-shadow: 0 10px 0 #d7dde7, 28px 10px 0 #d7dde7, 0 20px 0 #d7dde7, 34px 20px 0 #d7dde7; }
.cj-thumbLines { position: absolute; left: 56px; right: 9px; top: 29px; height: 3px; background: #cbd3df; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templatePaper-technical { color: #1f3a5f; border-left: 5px solid #1f3a5f; }
.cj-templatePaper-technical .cj-thumbRule { background: #1f3a5f; }
.cj-templatePaper-editorial { color: #0f766e; background: linear-gradient(135deg, #effcf9, #fff 60%); }
.cj-templatePaper-editorial .cj-thumbRule { height: 7px; background: #0f766e22; }
.cj-templatePaper-editorial .cj-thumbSection { border-radius: 8px; }
.cj-templatePaper-terminal { color: #c2410c; background: linear-gradient(90deg, #fff 0, #fff 88%, #f1f5f9 88%); }
.cj-templatePaper-terminal .cj-thumbRule { background: #c2410c; }
.cj-templatePaper-two-column .cj-thumbLines { left: 64px; right: 28px; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templatePaper-two-column:after { content: ''; position: absolute; top: 29px; right: 9px; width: 18px; height: 3px; background: currentColor; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templateName { margin-top: 5px; overflow: hidden; color: #26334d; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.cj-templateTags { margin-top: 2px; overflow: hidden; color: #8a94a6; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.cj-workshop { padding: 14px; border: 1px solid #e3e7ee; border-radius: 12px; background: #fbfcfe; }
.cj-workshopTitle { color: #26334d; font-size: 13px; font-weight: 700; }
.cj-workshopHint { margin-top: 5px; color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-workshopPrompt { margin-top: 9px; padding: 9px 10px; border-radius: 8px; background: #f0f3f8; color: #59667d; font-size: 11px; line-height: 17px; }
.cj-templateJson { display: block; width: 100%; min-height: 150px; margin-top: 10px; resize: vertical; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #26334d; padding: 9px; font: 11px/16px ui-monospace, SFMono-Regular, Consolas, monospace; }
.cj-workshopActions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.cj-workshopActions .cj-ghostAction, .cj-workshopActions .cj-solidAction { height: 30px; line-height: 30px; font-size: 11px; }
.cj-workshopMessage { margin-top: 8px; color: #26734d; font-size: 11px; line-height: 16px; }
.cj-versionList { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.cj-versionTag { padding: 3px 6px; border-radius: 6px; background: #edf1f6; color: #6d7890; font-size: 10px; }
.cj-canvas { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.cj-canvas .cj-frame { min-height: 0 !important; flex: 1; border-radius: 12px; }
.cj-frame iframe { background: #eef1f5; }
.cj-inspector { min-width: 0; min-height: 0; overflow-y: auto; padding: 16px 13px; border-left: 1px solid rgba(15,23,42,.08); background: #fff; }
.cj-inspectorTitle { color: #9aa3b3; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.cj-inspectorCard { margin-top: 10px; padding: 12px; border: 1px solid #e4e8ef; border-radius: 11px; background: #fafbfc; }
.cj-inspectorCard + .cj-inspectorCard { margin-top: 9px; }
.cj-cardTitle { color: #26334d; font-size: 12px; font-weight: 700; }
.cj-cardCopy { margin-top: 5px; color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-controlCard { margin-top: 10px; padding: 12px; border: 1px solid #e4e8ef; border-radius: 11px; background: #fff; }
.cj-controlCard .cj-cardCopy { margin-bottom: 10px; }
.cj-controlRow { margin-top: 10px; }
.cj-controlRow:first-of-type { margin-top: 0; }
.cj-controlMeta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #59667d; font-size: 11px; }
.cj-controlValue { color: #26334d; font-variant-numeric: tabular-nums; }
.cj-range { display: block; width: 100%; height: 16px; margin: 4px 0 0; accent-color: #3559a8; }
.cj-controlActions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
.cj-controlActions .cj-ghostAction { width: 100%; text-align: center; }
.cj-fitLarge { margin-top: 8px; color: #15803d; font-size: 18px; font-weight: 800; }
.cj-fitLarge[data-state="overflow"] { color: #b91c1c; }
.cj-fitLarge[data-state="multi"] { color: #1d4ed8; }
.cj-fitLarge[data-state="sparse"] { color: #a16207; }
.cj-check { display: flex; align-items: center; gap: 7px; margin-top: 8px; color: #66738a; font-size: 11px; }
.cj-checkDot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #22a06b; }
.cj-fileList { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.cj-fileItem { all: unset; box-sizing: border-box; cursor: pointer; display: block; padding: 12px; border: 1px solid #e3e7ee; border-radius: 10px; background: #fff; }
.cj-fileItem:hover, .cj-fileItem[data-active="true"] { border-color: #9db5e8; box-shadow: 0 3px 12px rgba(45,80,150,.08); }
.cj-fileItemName { color: #26334d; font-size: 12px; font-weight: 700; }
.cj-fileItemMeta { margin-top: 4px; color: #8a94a6; font-size: 11px; }
.cj-guide { flex: 1; padding: 20px; overflow: auto; border: 1px solid #e3e7ee; border-radius: 12px; background: #fff; }
.cj-guide h3 { margin: 0; color: #26334d; font-size: 16px; }
.cj-guide p { margin: 7px 0 16px; color: #7b8496; font-size: 12px; line-height: 19px; }
.cj-guideRow { display: flex; gap: 10px; padding: 11px 0; border-top: 1px solid #edf0f4; color: #59667d; font-size: 12px; line-height: 18px; }
.cj-guideNo { color: #9aabc9; font-weight: 800; }
.cj-qualityStatus { display: inline-grid; place-items: center; width: 19px; height: 19px; flex: 0 0 auto; border-radius: 50%; background: #eef1f5; color: #7b8496; font-size: 11px; font-weight: 800; }
.cj-quality-pass { background: #e4f5ed; color: #15803d; }
.cj-quality-warn { background: #fff2d8; color: #a16207; }
.cj-quality-error { background: #fde8e8; color: #b91c1c; }
.cj-qualityStatus + span { display: flex; flex-direction: column; gap: 3px; }
.cj-qualityStatus + span small { color: #8b95a7; font-size: 11px; }
@media (max-width: 720px) {
  .cj-panel, .cj-panel[data-wide="true"] { left: 12px; bottom: 12px; width: calc(100vw - 24px); height: calc(100vh - 24px); }
  .cj-header, .cj-body { padding-left: 14px; padding-right: 14px; }
  .cj-selectWrap { min-width: 100%; }
  .cj-actions { width: 100%; justify-content: space-between; }
  .cj-action { flex: 1; padding-left: 8px; padding-right: 8px; }
  .cj-workbenchBody { display: block; overflow: auto; }
  .cj-nav { display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid rgba(15,23,42,.08); padding: 8px; }
  .cj-navLabel, .cj-navFoot { display: none; }
  .cj-navItem { width: auto; padding: 0 12px; white-space: nowrap; }
  .cj-main { min-height: 560px; }
  .cj-inspector { border-left: 0; border-top: 1px solid rgba(15,23,42,.08); }
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

    function useQuality(previewPath, refreshKey) {
      const [quality, setQuality] = useState(null)
      const [qualityLoading, setQualityLoading] = useState(false)
      const reload = useCallback(async () => {
        if (!previewPath) {
          setQuality(null)
          return
        }
        setQualityLoading(true)
        try {
          const res = await fetch(`/dsh-resume/api/check?preview=${encodeURIComponent(previewPath)}&t=${refreshKey}`, { cache: 'no-store' })
          if (!res.ok) throw new Error(`check ${res.status}`)
          setQuality(await res.json())
        } catch {
          setQuality(null)
        } finally {
          setQualityLoading(false)
        }
      }, [previewPath, refreshKey])

      useEffect(() => {
        void reload()
      }, [reload])

      return { quality, qualityLoading }
    }

    function PreviewWorkbench({ compact }) {
      ensureCss()
      const [tick, setTick] = useState(0)
      const { status, error, loading, reload } = useStatus(tick)
      const [selected, setSelected] = useState('')
      const [fitState, setFitState] = useState({ text: '等待排版信息', state: 'pending' })
      const [view, setView] = useState('preview')
      const [layout, setLayout] = useState(null)
      const [layoutSettings, setLayoutSettings] = useState({ fontSize: 14, lineHeight: 1.55, sectionGap: 20, pageMargin: 48 })
      const [layoutHistory, setLayoutHistory] = useState([])
      const [templates, setTemplates] = useState([])
      const [templateId, setTemplateId] = useState('campus-standard')
      const [templateHistory, setTemplateHistory] = useState([])
      const [templateDraft, setTemplateDraft] = useState('')
      const [templateMessage, setTemplateMessage] = useState('')
      const [templateVersions, setTemplateVersions] = useState([])
      const templateOptions = templates.length ? templates : [{ id: 'campus-standard', name: '校招标准', description: '清晰稳重的单栏校园求职模板' }]
      const selectedTemplate = templateOptions.find((template) => template.id === templateId) || templateOptions[0]
      const { quality, qualityLoading } = useQuality(selected, tick)

      const reloadTemplates = useCallback(async () => {
        try {
          const res = await fetch('/dsh-resume/api/templates', { cache: 'no-store' })
          if (!res.ok) throw new Error(`templates ${res.status}`)
          const data = await res.json()
          if (Array.isArray(data.templates)) setTemplates(data.templates)
        } catch {
          // Keep the last known template list when the preview server is restarting.
        }
      }, [selected])

      useEffect(() => {
        void reloadTemplates()
      }, [reloadTemplates])

      useEffect(() => {
        const onLayoutMessage = (event) => {
          if (event.data?.source !== 'dsh-resume-preview') return
          const metrics = event.data.metrics || null
          setLayout(metrics)
          if (metrics) {
            setFitState({
              text: metrics.overflow
                ? `内容超出页面：${metrics.pageCount} 页`
                : metrics.sparse
                  ? `一页但留白偏多：约 ${Math.round((metrics.pages?.[0]?.blankRatio || 0) * 100)}% 空白`
                  : metrics.pageCount === 1
                    ? '一页通过：版面密度合适'
                    : `排版完成：${metrics.pageCount} 页`,
              state: metrics.overflow ? 'overflow' : metrics.sparse ? 'sparse' : metrics.pageCount === 1 ? 'fit' : 'multi',
            })
            void fetch('/dsh-resume/api/metrics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ preview: selected, metrics }),
            }).catch(() => {})
          }
        }
        window.addEventListener('message', onLayoutMessage)
        return () => window.removeEventListener('message', onLayoutMessage)
      }, [])

      useEffect(() => {
        if (!selected && status?.previewRel) setSelected(status.previewRel)
        if (!selected && status?.previews?.length) setSelected(status.previews[0])
      }, [status, selected])

      const previewSrc = useMemo(() => {
        if (!selected) return null
        const params = new URLSearchParams({ path: selected, t: String(tick), template: templateId })
        for (const [key, value] of Object.entries(layoutSettings)) params.set(key, String(value))
        return `/dsh-resume/preview?${params.toString()}`
      }, [selected, tick, layoutSettings, templateId])

      const onRefresh = () => {
        setFitState({ text: '正在重新检查', state: 'pending' })
        setLayout(null)
        setTick((n) => n + 1)
        void reload()
      }

      const onTemplateChange = (value) => {
        if (value !== templateId) setTemplateHistory((history) => [...history, templateId].slice(-20))
        setTemplateId(value)
        setFitState({ text: '正在应用模板', state: 'pending' })
        setLayout(null)
        setTemplateMessage('')
      }

      const undoTemplateChoice = () => {
        if (!templateHistory.length) return
        const previous = templateHistory[templateHistory.length - 1]
        setTemplateHistory((history) => history.slice(0, -1))
        setTemplateId(previous)
        setTemplateMessage('已撤销模板切换')
        setLayout(null)
      }

      const saveTemplateDraft = async () => {
        setTemplateMessage('正在校验并保存模板…')
        try {
          const res = await fetch('/dsh-resume/api/templates/actions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'save', templateJson: templateDraft }),
          })
          const result = await res.json()
          if (!res.ok || !result.saved) throw new Error(result.error || result.errors?.join('；') || '模板保存失败')
          await reloadTemplates()
          setTemplateId(result.template.id)
          setTemplateMessage(`已保存「${result.template.name}」，现在可以回到预览查看。`)
        } catch (err) {
          setTemplateMessage(`保存失败：${err?.message || err}`)
        }
      }

      const copySelectedTemplate = async () => {
        const newId = window.prompt('请输入新模板 ID（小写英文和短横线）', `${selectedTemplate.id}-copy`)
        if (!newId) return
        try {
          const res = await fetch('/dsh-resume/api/templates/actions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'copy', sourceId: selectedTemplate.id, newId }),
          })
          const result = await res.json()
          if (!res.ok || !result.saved) throw new Error(result.error || '模板复制失败')
          await reloadTemplates()
          setTemplateId(result.template.id)
          setTemplateMessage(`已复制为「${result.template.name}」`)
        } catch (err) {
          setTemplateMessage(`复制失败：${err?.message || err}`)
        }
      }

      const restoreLatestTemplate = async () => {
        if (!templateVersions.length) return
        try {
          const res = await fetch('/dsh-resume/api/templates/actions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'restore-latest', id: templateId }),
          })
          const result = await res.json()
          if (!res.ok || !result.restored) throw new Error(result.error || '恢复失败')
          await reloadTemplates()
          setTemplateMessage('已恢复上一个模板版本')
        } catch (err) {
          setTemplateMessage(`恢复失败：${err?.message || err}`)
        }
      }

      useEffect(() => {
        if (selectedTemplate) setTemplateDraft(JSON.stringify(selectedTemplate, null, 2))
      }, [templateId, templates.length])

      useEffect(() => {
        let active = true
        fetch(`/dsh-resume/api/templates/versions?id=${encodeURIComponent(templateId)}`, { cache: 'no-store' })
          .then((res) => res.ok ? res.json() : Promise.reject(new Error(`versions ${res.status}`)))
          .then((data) => { if (active) setTemplateVersions(Array.isArray(data.versions) ? data.versions : []) })
          .catch(() => { if (active) setTemplateVersions([]) })
        return () => { active = false }
      }, [templateId, templates.length])

      const updateLayoutSetting = (key, value) => {
        setFitState({ text: '正在重新计算', state: 'pending' })
        setLayout((current) => current ? { ...current, pageCount: null } : current)
        setLayoutHistory((history) => [...history, layoutSettings].slice(-20))
        setLayoutSettings((current) => ({ ...current, [key]: value }))
      }

      const resetLayoutSettings = () => {
        setFitState({ text: '正在恢复默认', state: 'pending' })
        setLayoutHistory((history) => [...history, layoutSettings].slice(-20))
        setLayoutSettings({ fontSize: 14, lineHeight: 1.55, sectionGap: 20, pageMargin: 48 })
      }

      const undoLayout = () => {
        if (!layoutHistory.length) return
        const previous = layoutHistory[layoutHistory.length - 1]
        setFitState({ text: '正在撤销调整', state: 'pending' })
        setLayoutSettings(previous)
        setLayoutHistory((history) => history.slice(0, -1))
      }

      const onDownload = async () => {
        if (!previewSrc) return
        const res = await fetch(previewSrc, { cache: 'no-store' })
        const html = await res.text()
        const exportStyle = `<style data-dsh-resume-export>body{line-height:${layoutSettings.lineHeight} !important}.dsh-resume-page-content{padding:${layoutSettings.pageMargin}px !important}.dsh-resume-section{margin-bottom:${layoutSettings.sectionGap}px !important}p,li{font-size:${layoutSettings.fontSize}px !important}</style>`
        const exportedHtml = html.replace('</head>', `${exportStyle}</head>`)
        const blob = new Blob([exportedHtml], { type: 'text/html;charset=utf-8' })
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

      const onFrameLoad = (event) => {
        try {
          event.currentTarget.contentWindow?.scrollTo(0, 0)
          const indicator = event.currentTarget.contentDocument?.querySelector('.dsh-resume-layout-status')
          if (indicator) setFitState({ text: indicator.textContent || '已完成排版', state: indicator.dataset.state || 'multi' })
        } catch {
          setFitState({ text: '已加载预览', state: 'pending' })
        }
      }

      const previewOptions = status?.previews?.length
        ? status.previews.map((p) => React.createElement('option', { key: p, value: p }, p))
        : [React.createElement('option', { key: 'empty', value: '' }, loading ? '加载中…' : '暂无 preview.html')]
      const fitLabel = fitState.state === 'overflow' ? '版式需调整' : fitState.state === 'sparse' ? '一页但偏空' : fitState.state === 'multi' ? '多页' : fitState.state === 'fit' ? '一页通过' : '检查中'
      const pageSummary = layout?.pageCount ? `${layout.pageCount} 页${layout.overflow ? ' · 有溢出' : layout.sparse ? ` · 留白 ${Math.round((layout.pages?.[0]?.blankRatio || 0) * 100)}%` : ''}` : '正在测量'
      const navItems = [
        ['preview', '▣', '预览'],
        ['files', '≡', '投递版本'],
        ['templates', '▤', '模板库'],
        ['workshop', '✦', '模板工坊'],
        ['guide', '✓', '排版检查'],
      ]
      const templateGallery = React.createElement(
        'div',
        { className: 'cj-templateGallery', 'data-library': 'true', 'aria-label': '视觉模板' },
        ...templateOptions.map((template) => React.createElement(
          'button',
          { key: template.id, type: 'button', className: 'cj-templateCard', 'data-active': template.id === templateId ? 'true' : 'false', onClick: () => onTemplateChange(template.id), 'aria-label': `选择模板：${template.name}` },
          React.createElement(
            'div',
            { className: `cj-templatePaper cj-templatePaper-${template.visual?.variant || 'standard'}${template.layout?.mode === 'two-column' ? ' cj-templatePaper-two-column' : ''}` },
            React.createElement('div', { className: 'cj-thumbTop' }),
            React.createElement('div', { className: 'cj-thumbRule' }),
            React.createElement('div', { className: 'cj-thumbSection' }),
            React.createElement('div', { className: 'cj-thumbLines' }),
          ),
          React.createElement('div', { className: 'cj-templateName' }, template.name),
          React.createElement('div', { className: 'cj-templateTags' }, (template.tags || []).slice(0, 2).join(' · ')),
        )),
      )
      const previewView = React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'cj-mainBar' },
          React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'cj-mainHeading' }, '投递版预览'),
            React.createElement('div', { className: 'cj-mainHint' }, '先确认内容与版式，再导出 PDF'),
          ),
          React.createElement(
            'select',
            { className: 'cj-fileSelect', value: selected, onChange: (e) => setSelected(e.target.value) },
            ...previewOptions,
          ),
        ),
        error ? React.createElement('div', { className: 'cj-error' }, error) : null,
        React.createElement(
          'div',
          { className: 'cj-canvas' },
          React.createElement(
            'div',
            { className: 'cj-frame', style: { minHeight: compact ? 440 : 480 } },
            previewSrc
              ? React.createElement('iframe', { title: 'resume-preview', src: previewSrc, onLoad: onFrameLoad })
              : React.createElement('div', { className: 'cj-empty' }, '等待预览文件'),
          ),
        ),
      )
      const filesView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '投递版本'), React.createElement('div', { className: 'cj-mainHint' }, '每个岗位保留一份独立简历，避免覆盖主简历。'))),
        React.createElement(
          'div',
          { className: 'cj-fileList' },
          ...(status?.previews?.length
            ? status.previews.map((p) => React.createElement('button', { key: p, type: 'button', className: 'cj-fileItem', 'data-active': selected === p ? 'true' : 'false', onClick: () => { setSelected(p); setView('preview') } }, React.createElement('div', { className: 'cj-fileItemName' }, p), React.createElement('div', { className: 'cj-fileItemMeta' }, '可预览 · 点击打开')))
            : [React.createElement('div', { className: 'cj-empty', key: 'empty' }, '还没有投递版预览')]),
        ),
      )
      const templateWorkshop = React.createElement(
        'div',
        { className: 'cj-workshop' },
        React.createElement('div', { className: 'cj-workshopTitle' }, '生成或维护模板'),
        React.createElement('div', { className: 'cj-workshopHint' }, '让 DeepSeek 生成 TemplateSpec JSON 后粘贴到这里。保存前会自动校验，模型不直接写 CSS。'),
        React.createElement('div', { className: 'cj-workshopPrompt' }, '推荐提示：生成一个适合前端实习投递的黑白高密度一页模板，保留项目成果指标，并输出符合 dsh-resume TemplateSpec 的 JSON。'),
        React.createElement('textarea', { className: 'cj-templateJson', value: templateDraft, onChange: (event) => setTemplateDraft(event.target.value), spellCheck: false, 'aria-label': '模板 JSON' }),
        React.createElement('div', { className: 'cj-workshopActions' },
          React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: saveTemplateDraft }, '保存 AI 模板'),
          React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: copySelectedTemplate }, '复制当前模板'),
          React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: undoTemplateChoice, disabled: !templateHistory.length }, '撤销切换'),
          React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: restoreLatestTemplate, disabled: !templateVersions.length }, '恢复上一版本'),
        ),
        templateMessage ? React.createElement('div', { className: 'cj-workshopMessage' }, templateMessage) : null,
        React.createElement('div', { className: 'cj-cardCopy' }, templateVersions.length ? `当前模板有 ${templateVersions.length} 个历史版本` : '自定义模板保存后会自动保留历史版本。'),
        templateVersions.length ? React.createElement('div', { className: 'cj-versionList' }, ...templateVersions.slice(0, 5).map((version) => React.createElement('span', { className: 'cj-versionTag', key: version.id }, version.id))) : null,
      )
      const templatesView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '模板库'), React.createElement('div', { className: 'cj-mainHint' }, '选择视觉基线，不会自动离开当前页面。'))),
        React.createElement('div', { className: 'cj-guide' },
          React.createElement('h3', null, '选择一个视觉方向'),
          React.createElement('p', null, '点击卡片只会选择并应用模板，不会跳转。确认后点击下面的按钮进入 A4 预览。'),
          templateGallery,
          React.createElement('div', { className: 'cj-workshopActions' }, React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: () => setView('preview') }, '应用并查看预览')),
        ),
      )
      const workshopView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '模板工坊'), React.createElement('div', { className: 'cj-mainHint' }, '生成、保存、复制和恢复视觉模板。'))),
        React.createElement('div', { className: 'cj-guide' }, templateWorkshop),
      )
      const guideView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '排版检查'), React.createElement('div', { className: 'cj-mainHint' }, '帮助你判断这份简历是否适合直接投递。'))),
        React.createElement(
          'div',
          { className: 'cj-guide' },
          React.createElement('h3', null, '一页简历检查清单'),
          React.createElement('p', null, qualityLoading ? '正在读取当前投递版并检查…' : quality ? `当前评分 ${quality.score}/100。${quality.next}` : '内容不足时补充真实证据，内容过多时先删重复信息，不用用极小字号硬塞。'),
          ...(quality?.checks || [
            { id: 'identity', status: 'info', message: '等待选择投递版后开始检查' },
            { id: 'evidence', status: 'info', message: '检查会在本地完成，不上传简历内容' },
          ]).map((item, index) => React.createElement('div', { className: 'cj-guideRow', key: item.id }, React.createElement('span', { className: `cj-qualityStatus cj-quality-${item.status}` }, item.status === 'pass' ? '✓' : item.status === 'error' ? '!' : item.status === 'warn' ? '!' : '·'), React.createElement('span', null, React.createElement('strong', null, String(index + 1).padStart(2, '0') + '　' + item.message), item.detail ? React.createElement('small', null, item.detail) : null))),
        ),
      )
      const inspectorView = React.createElement(
        'aside',
        { className: 'cj-inspector' },
        React.createElement('div', { className: 'cj-inspectorTitle' }, '当前状态'),
        React.createElement(
          'div',
          { className: 'cj-inspectorCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '版式结果'),
          React.createElement('div', { className: 'cj-fitLarge', 'data-state': fitState.state }, fitLabel),
          React.createElement('div', { className: 'cj-cardCopy' }, `${fitState.text} · ${pageSummary}`),
        ),
        React.createElement(
          'div',
          { className: 'cj-controlCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '视觉模板'),
          React.createElement('div', { className: 'cj-fitLarge', 'data-state': 'fit' }, selectedTemplate?.name || '校招标准'),
          React.createElement('div', { className: 'cj-cardCopy' }, selectedTemplate?.description || '原创视觉预设'),
          React.createElement('div', { className: 'cj-cardCopy' }, '在左侧模板库选择；模板工坊负责生成和维护。'),
        ),
        React.createElement(
          'div',
          { className: 'cj-controlCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '手动调整'),
          React.createElement('div', { className: 'cj-cardCopy' }, '只影响当前预览，可随时恢复默认。'),
          ...[
            ['fontSize', '字号', (value) => `${value}px`, 11, 18, 0.5],
            ['lineHeight', '行高', (value) => value.toFixed(2), 1.2, 2, 0.05],
            ['sectionGap', '模块间距', (value) => `${value}px`, 6, 30, 1],
            ['pageMargin', '页边距', (value) => `${value}px`, 24, 72, 2],
          ].map(([key, label, format, min, max, step]) => React.createElement(
            'label',
            { className: 'cj-controlRow', key },
            React.createElement('span', { className: 'cj-controlMeta' }, React.createElement('span', null, label), React.createElement('span', { className: 'cj-controlValue' }, format(layoutSettings[key]))),
            React.createElement('input', { className: 'cj-range', type: 'range', min, max, step, value: layoutSettings[key], onChange: (event) => updateLayoutSetting(key, Number(event.target.value)) }),
          )),
          React.createElement('div', { className: 'cj-controlActions' }, React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: undoLayout, disabled: !layoutHistory.length }, '撤销'), React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: resetLayoutSettings }, '恢复默认')),
        ),
        React.createElement(
          'div',
          { className: 'cj-inspectorCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '内容检查'),
          React.createElement('div', { className: 'cj-fitLarge', 'data-state': quality?.passed ? 'fit' : quality ? 'overflow' : 'pending' }, quality ? `${quality.score}/100` : '检查中'),
          React.createElement('div', { className: 'cj-cardCopy' }, quality ? `${quality.warnings.length} 项提醒` : '切换到排版检查查看结果'),
        ),
        React.createElement(
          'div',
          { className: 'cj-inspectorCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '工作区'),
          React.createElement('div', { className: 'cj-cardCopy' }, status?.root || '等待工作区初始化'),
        ),
        React.createElement(
          'div',
          { className: 'cj-inspectorCard' },
          React.createElement('div', { className: 'cj-cardTitle' }, '投递前确认'),
          React.createElement('div', { className: 'cj-check' }, React.createElement('span', { className: 'cj-checkDot' }), '内容来自你的真实经历'),
          React.createElement('div', { className: 'cj-check' }, React.createElement('span', { className: 'cj-checkDot' }), '已检查页面数量'),
        ),
      )

      return React.createElement(
        'div',
        { className: 'cj-workbench' },
        !compact && React.createElement('div', { className: 'cj-workbenchTop' }, React.createElement('div', { className: 'cj-brand' }, React.createElement('div', { className: 'cj-brandIcon' }, '简'), React.createElement('div', null, React.createElement('div', { className: 'cj-brandTitle' }, '投递版简历工作台'), React.createElement('div', { className: 'cj-brandDesc' }, '真实经历 · JD 匹配 · 一页排版'))), React.createElement('div', { className: 'cj-topActions' }, React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: onRefresh }, '重新检查'), React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: onDownload, disabled: !previewSrc }, '下载 HTML'), React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: onPrint, disabled: !previewSrc }, '确认并导出'))),
        React.createElement(
          'div',
          { className: 'cj-workbenchBody' },
          React.createElement('nav', { className: 'cj-nav', 'aria-label': '简历工作台导航' }, React.createElement('div', { className: 'cj-navLabel' }, 'WORKSPACE'), ...navItems.map(([id, icon, label]) => React.createElement('button', { key: id, type: 'button', className: 'cj-navItem', 'data-active': view === id ? 'true' : 'false', onClick: () => setView(id) }, React.createElement('span', { className: 'cj-navIcon' }, icon), label)), React.createElement('div', { className: 'cj-navFoot' }, 'Agent 负责改稿与排版。\n你负责最终确认。')),
          React.createElement('main', { className: 'cj-main' }, view === 'preview' ? previewView : view === 'files' ? filesView : view === 'templates' ? templatesView : view === 'workshop' ? workshopView : guideView),
          inspectorView,
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

