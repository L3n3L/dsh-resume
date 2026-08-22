window.__ModuleLoader__.load({
  id: 'dsh-resume',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    let dshPrimitives = {}
    try {
      dshPrimitives = require('@deepseek-ai/dsh-client-ui-primitives') || {}
    } catch {
      // Older hosts may not expose the primitives module; the fallback keeps the panel usable.
    }
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const inject = ['slots', 'sessions']
    const CSS_ID = 'dsh-resume/panel.v4.css'
    let clientContext = null

    function textFromValue(value, depth = 0) {
      if (depth > 3 || value == null) return ''
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value.map((item) => textFromValue(item, depth + 1)).filter(Boolean).join('')
      if (typeof value !== 'object') return ''
      const fields = ['text', 'content', 'blocks', 'output', 'result', 'message', 'error', 'value', 'summary', 'argsRaw', 'arguments', 'rawInput']
      return fields.map((field) => textFromValue(value[field], depth + 1)).filter(Boolean).join('')
    }

    function textFromBlocks(blocks) {
      if (!Array.isArray(blocks)) return ''
      return blocks.map((block) => textFromValue(block)).filter(Boolean).join('')
    }

    function textFromConversationNode(node) {
      if (!node || typeof node !== 'object') return ''
      if (node.kind === 'assistant' && Array.isArray(node.blocks)) {
        const finalText = node.blocks
          .filter((block) => String(block?.kind || block?.type || '').toLowerCase() === 'text')
          .map((block) => textFromValue(block))
          .filter(Boolean)
          .join('')
          .trim()
        if (finalText) return finalText
      }
      const parts = [
        Array.isArray(node.blocks) ? textFromBlocks(node.blocks) : textFromValue(node.blocks),
        Array.isArray(node.content) ? textFromBlocks(node.content) : textFromValue(node.content),
        textFromValue(node.text),
        textFromValue(node.output),
        textFromValue(node.result),
        textFromValue(node.error),
      ].filter(Boolean)
      return parts.sort((left, right) => right.length - left.length)[0]?.trim() || ''
    }

    function nodeCandidates(node) {
      return [
        node,
        ...(Array.isArray(node?.blocks) ? node.blocks : []),
        ...(Array.isArray(node?.content) ? node.content : []),
      ].filter((item) => item && typeof item === 'object')
    }

    function toolDescriptor(node) {
      const candidate = nodeCandidates(node).find((item) => item.name || item.toolName || item.tool?.name || item.toolCall?.name || item.tool_call?.name || item.call?.name || item.function?.name)
      if (!candidate) return { name: '', kind: '' }
      return {
        name: String(candidate.name || candidate.toolName || candidate.tool?.name || candidate.toolCall?.name || candidate.tool_call?.name || candidate.call?.name || candidate.function?.name || ''),
        kind: String(candidate.type || candidate.kind || ''),
      }
    }

    function classifyTimelineNode(node, part = node, kindHint = '') {
      const rawKind = String(node?.kind || node?.type || '').toLowerCase()
      const partKind = String(part?.kind || part?.type || part?.role || part?.channel || '').toLowerCase()
      const tool = toolDescriptor(part)
      const raw = `${kindHint} ${rawKind} ${partKind} ${tool.kind} ${tool.name}`.toLowerCase()
      const explicitKind = `${kindHint} ${rawKind} ${partKind}`.trim()
      if (/\breasoning\b|\bthink(?:ing)?\b|\bthought\b/.test(explicitKind)) return 'think'
      if (/\btool[-_ ]?call\b|\btool[-_ ]?result\b/.test(explicitKind) || tool.name) {
        if (/\bread\b|\bcat\b|\bopen\b/.test(tool.name.toLowerCase())) return 'read'
        if (/\bedit\b|\bwrite\b|\bpatch\b|\bapply\b/.test(tool.name.toLowerCase())) return 'edit'
        if (/\bgrep\b|\bsearch\b|\bfind\b/.test(tool.name.toLowerCase())) return 'grep'
        if (/\bshell\b|\bexec(?:ute)?\b|\bcommand\b|\brun\b/.test(tool.name.toLowerCase())) return 'shell'
        return 'tool'
      }
      if (/^command$/.test(rawKind)) return 'shell'
      if (/^tool[-_ ]?result$/.test(rawKind)) return 'tool'
      if (raw.includes('question') || raw.includes('pending')) return 'question'
      if (raw.includes('think') || raw.includes('reason')) return 'think'
      if (raw.includes('read')) return 'read'
      if (raw.includes('edit') || raw.includes('write') || raw.includes('patch')) return 'edit'
      if (raw.includes('grep') || raw.includes('search')) return 'grep'
      if (raw.includes('shell') || raw.includes('exec') || raw.includes('command')) return 'shell'
      if (tool.name || raw.includes('tool')) return 'tool'
      if (rawKind === 'assistant') return 'assistant'
      if (rawKind === 'user' || rawKind === 'steering') return 'user'
      return 'system'
    }

    function timelineLabel(type) {
      return ({ think: 'Think', read: 'Read', edit: 'Edit', grep: 'Grep', shell: 'Shell', tool: 'Tool call', question: 'Question', assistant: 'Assistant', user: 'User', system: 'System' })[type] || 'Event'
    }

    function templateIdFromText(text) {
      const source = String(text || '')
      const patterns = [
        /["'](?:id|templateId)["']\s*:\s*["']([a-z0-9][a-z0-9_-]*)["']/i,
        /\b(?:templateId|模板\s*(?:id|标识))\s*[:=：]\s*["'`]?([a-z0-9][a-z0-9_-]*)/i,
      ]
      for (const pattern of patterns) {
        const match = source.match(pattern)
        if (match?.[1]) return match[1]
      }
      return ''
    }

    function previewPathFromText(text) {
      const source = String(text || '')
      const jsonMatch = source.match(/["']previewPath["']\s*:\s*["']([^"']+preview\.html)["']/i)
      if (jsonMatch?.[1]) return jsonMatch[1].replace(/\\/g, '/')
      const pathMatch = source.match(/(?:^|[\s"'`])((?:companies\/|[^\s"'`]+\/)?[^\s"'`]*preview\.html)(?:$|[\s"'`])/i)
      return pathMatch?.[1]?.replace(/\\/g, '/') || ''
    }

    function previewPathFromNode(node) {
      for (const candidate of nodeCandidates(node)) {
        for (const field of ['previewPath', 'outPath', 'preview']) {
          const value = String(candidate?.[field] || '').replace(/\\/g, '/')
          if (value.endsWith('preview.html')) return value
        }
      }
      return ''
    }

    function summarizeVisualAudit(metrics) {
      const audit = metrics?.visualAudit || {}
      const state = String(audit.state || (metrics?.overflow ? 'overflow' : metrics?.pageCount > 1 ? 'multi-page' : metrics?.sparse ? 'sparse' : 'pending'))
      const labels = {
        balanced: '版面平衡',
        'needs-review': '建议复核',
        sparse: '一页偏空',
        'multi-page': '多页排版',
        overflow: '存在溢出',
        pending: '等待测量',
      }
      const firstPage = metrics?.pages?.[0] || {}
      const blankRatio = Number(firstPage.blankRatio)
      const occupancyRatio = Number(firstPage.occupancyRatio)
      const parts = []
      if (metrics?.pageCount) parts.push(`${metrics.pageCount} 页`)
      if (Number.isFinite(blankRatio)) parts.push(`首页留白 ${Math.round(blankRatio * 100)}%`)
      if (Number.isFinite(occupancyRatio)) parts.push(`内容占用 ${Math.round(occupancyRatio * 100)}%`)
      if (Number.isFinite(audit.moduleCount)) parts.push(`${audit.moduleCount} 个模块`)
      return {
        state,
        label: labels[state] || '等待测量',
        detail: parts.join(' · ') || '打开 A4 预览后自动采集真实页面指标',
        warnings: Array.isArray(audit.warnings) ? audit.warnings : [],
      }
    }

    function rendererLabel(renderer) {
      return ({
        'clean-single': '清晰单栏',
        'split-sidebar': '侧栏双栏',
        'technical-timeline': '技术时间线',
        'portfolio-grid': '作品集卡片',
        editorial: '编辑风',
        academic: '学术风',
        'swiss-grid': '瑞士网格',
        'midnight-terminal': '午夜终端',
        'sidebar-signal': '侧栏信号',
      })[String(renderer || '')] || '基础布局'
    }

    function conversationNodeSegments(node) {
      if (!node || typeof node !== 'object') return []
      const candidates = []
      const seen = new Set()
      const add = (value, kindHint = '') => {
        if (Array.isArray(value)) {
          value.forEach((item) => add(item, kindHint))
          return
        }
        if (value == null || (typeof value !== 'object' && typeof value !== 'string')) return
        // Some hosts wrap several parts in one assistant block. Descend into
        // that wrapper before reading its aggregate text, otherwise the
        // reasoning and final answer would be merged again.
        if (typeof value === 'object') {
          const nested = ['blocks', 'content'].filter((field) => Array.isArray(value[field]))
          if (nested.length) {
            nested.forEach((field) => add(value[field], kindHint || String(value.kind || value.type || '')))
            return
          }
        }
        const valueKind = String(value?.kind || value?.type || '').toLowerCase()
        const structuredText = valueKind === 'tool-call'
          ? [value.name, value.argsRaw].filter(Boolean).join(' ').trim()
          : valueKind === 'tool-result'
            ? [value.call?.name, textFromValue(value.content), textFromValue(value.error), value.isError ? '工具调用失败' : ''].filter(Boolean).join(' ').trim()
            : valueKind === 'command'
              ? [value.name, value.args, value.outcome?.text].filter(Boolean).join(' ').trim()
              : ''
        const text = (structuredText || textFromValue(value)).trim()
        if (!text || seen.has(text)) return
        seen.add(text)
        candidates.push({ source: typeof value === 'object' ? value : { text: value }, text, kindHint: kindHint || valueKind })
      }
      const nodeKind = String(node.kind || node.type || '').toLowerCase()
      if (nodeKind === 'tool-result' || nodeKind === 'command' || nodeKind === 'tool-call') add(node, nodeKind)
      // Hosts may flatten one assistant turn into sibling fields. Keep the
      // reasoning fields before the final answer so the mirror follows the
      // actual task-flow order instead of showing the answer first.
      for (const field of ['thinking', 'reasoning', 'thought']) add(node[field], field)
      add(node.blocks)
      if (nodeKind !== 'tool-result') add(node.content)
      for (const field of ['final', 'answer', 'response', 'text', 'output']) add(node[field], field)
      if (candidates.length) return candidates
      const fallback = textFromConversationNode(node).trim()
      return fallback ? [{ source: node, text: fallback, kindHint: '' }] : []
    }

    function normalizeTimelineNode(node, snapshot, index, nodes) {
      const rawStatus = String(node?.status || node?.state || node?.phase || '').toLowerCase()
      return conversationNodeSegments(node).map((segment, segmentIndex) => {
        const type = classifyTimelineNode(node, segment.source, segment.kindHint)
        const tool = toolDescriptor(segment.source)
        const status = /error|fail|reject|cancel/.test(rawStatus)
          ? 'error'
          : /wait|pending|question/.test(rawStatus) || type === 'question'
            ? 'waiting'
          : /run|progress|active/.test(rawStatus) || node?.kind === 'tool-call' || (Boolean(snapshot?.running) && index === nodes.length - 1)
              ? 'running'
              : 'done'
        const baseSeq = Number(node?.seq)
        const seq = Number.isFinite(baseSeq) ? baseSeq * 100 + segmentIndex : index * 100 + segmentIndex
        const target = tool.name || (type === 'assistant' || type === 'user' ? '' : segment.text.replace(/\s+/g, ' ').slice(0, 140))
        return {
          seq,
          type,
          label: timelineLabel(type),
          target,
          summary: segment.text,
          status,
        }
      })
    }

    function getCurrentSessionSource() {
      try {
        const info = clientContext?.sessions?.currentProvideInfo?.getSnapshot?.()
        const sessionId = info?.sessionId
        const session = sessionId ? clientContext?.sessions?.binding?.(sessionId)?.session : null
        const source = session || info?.hooks?.session
        return { info, source, session }
      } catch {
        return { info: null, source: null, session: null }
      }
    }

    function summarizeConversation(snapshot) {
      const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : []
      const normalized = nodes.flatMap((node, index) => normalizeTimelineNode(node, snapshot, index, nodes))
      const lastSeq = nodes.reduce((max, node) => Math.max(max, Number(node?.seq) || 0), 0)
      const liveNodes = []
      if (snapshot?.partial?.blocks?.length) {
        liveNodes.push({ kind: 'assistant', seq: lastSeq + 0.1, blocks: snapshot.partial.blocks })
      }
      if (Array.isArray(snapshot?.runningCalls)) {
        snapshot.runningCalls.forEach((call, index) => liveNodes.push({ kind: 'tool-call', seq: lastSeq + 0.2 + index / 100, ...call }))
      }
      const liveNormalized = liveNodes.flatMap((node, index) => normalizeTimelineNode(node, snapshot, nodes.length + index, liveNodes))
      normalized.push(...liveNormalized)
      const messages = normalized
        .filter((item) => item.type === 'user' || item.type === 'assistant')
        .map((item) => ({
          role: item.type,
          kind: item.type,
          text: item.summary,
          seq: item.seq,
        }))
        .slice(-10)
      const feed = normalized
        .map((item) => ({ ...item, role: item.type === 'assistant' ? 'assistant' : item.type === 'user' ? 'user' : 'event' }))
        .filter((item) => item.type !== 'system' && (item.target || item.summary))
      const sessionFacts = [
        snapshot?.summary,
        snapshot?.context?.summary,
        snapshot?.goal,
        snapshot?.task,
        snapshot?.title,
      ].map((value) => textFromValue(value).trim()).filter(Boolean).join('\n').slice(0, 2400)
      return {
        sessionId: snapshot?.sessionId || null,
        running: Boolean(snapshot?.running),
        messages,
        feed,
        sessionFacts,
        pending: Array.isArray(snapshot?.pending) ? snapshot.pending : [],
        pendingQuestion: snapshot?.pending?.find?.((item) => item?.kind === 'question') || null,
        hasMore: Boolean(snapshot?.hasMore),
        loadingOlder: Boolean(snapshot?.loadingOlder),
      }
    }

    function useMainConversation() {
      const [, refresh] = useState(0)
      useEffect(() => {
        const current = clientContext?.sessions?.currentProvideInfo
        if (!current?.subscribe) return undefined
        let stopSession = () => {}
        const subscribeSession = () => {
          stopSession()
          const { source } = getCurrentSessionSource()
          stopSession = source?.subscribe?.(() => refresh((value) => value + 1)) || (() => {})
          refresh((value) => value + 1)
        }
        subscribeSession()
        const stopCurrent = current.subscribe(subscribeSession)
        return () => {
          stopCurrent?.()
          stopSession()
        }
      }, [])
      const { info, session } = getCurrentSessionSource()
      const snapshot = session?.getSnapshot?.() || null
      return {
        sessionId: info?.sessionId || snapshot?.sessionId || null,
        session,
        snapshot,
        summary: summarizeConversation(snapshot),
      }
    }

    function extractMarkdownCandidate(text) {
      const match = String(text || '').match(/```(?:markdown|md|dsh-resume)?\s*([\s\S]*?)```/i)
      if (!match || !match[1].trim()) return null
      const content = match[1].trim()
      if (!/(^|\n)#{1,3}\s|教育经历|项目经历|实习经历|工作经历|专业技能/.test(content)) return null
      return { content, summary: '主对话返回了一份可预览的 Markdown 修改建议。' }
    }

    function buildResumePrompt(message, context, mainSummary) {
      const recent = (mainSummary?.feed || mainSummary?.messages || [])
        .slice(-24)
        .map((item) => {
          const label = item.role === 'assistant' ? '主对话 AI' : item.role === 'user' ? '用户' : (item.label || '主对话事件')
          const detail = item.type === 'assistant' || item.type === 'user' ? item.summary : [item.target, item.summary].filter(Boolean).join('：')
          return label + '：' + String(detail || '').slice(0, 800)
        })
        .join('\n')
      return [
        '[DSH_RESUME_WORKBENCH]',
        `请处理当前简历工作台请求：${message}`,
        '',
        `当前简历：${context.resumePath || 'resume.md'}`,
        `当前预览：${context.previewPath || 'preview.html'}`,
        `当前模板：${context.templateId || '未选择'}`,
        `当前排版：${context.metrics ? `${context.metrics.pageCount || '?'} 页，留白 ${Math.round(Number(context.metrics.pages?.[0]?.blankRatio || 0) * 100)}%，溢出 ${context.metrics.overflow ? '是' : '否'}` : '指标尚未回传'}`,
        context.selectedText ? `当前 Markdown：\n${String(context.selectedText).slice(0, 12000)}` : '',
        mainSummary?.sessionFacts ? `主对话已有摘要/目标：\n${mainSummary.sessionFacts}` : '',
        recent ? `主对话时间线（含工具/系统节点）：\n${recent}` : '',
        mainSummary?.pending?.length ? `主对话当前有 ${mainSummary.pending.length} 个待处理交互，请先完成它们，不要并行开启另一个请求。` : '',
        '',
        '规则：主对话是唯一真实上下文；不编造经历；优先使用主对话已有上下文和 jobhunt 工具；需要用户决定时使用结构化提问；涉及 Markdown 时先给出修改建议或候选内容，不要替用户保存文件。',
        '[/DSH_RESUME_WORKBENCH]',
      ].filter(Boolean).join('\n')
    }

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
  inset: 0;
  z-index: 80;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: var(--dsw-alias-bg-module-platform, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: none;
}
.cj-panel[data-wide="true"] { left: 0; }
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
.cj-workbenchBody[data-view="preview"] { grid-template-columns: 120px minmax(0, 1fr); }
.cj-workbenchBody[data-view="start"], .cj-workbenchBody[data-view="templates"], .cj-workbenchBody[data-view="workshop"], .cj-workbenchBody[data-view="files"], .cj-workbenchBody[data-view="guide"] { grid-template-columns: 120px minmax(0, 1fr); }
.cj-nav {
  display: flex;
  flex-direction: column;
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
.cj-navFoot { display: flex; flex-direction: column; gap: 12px; margin-top: auto; padding: 12px 10px 0; border-top: 1px solid rgba(15,23,42,.07); color: #99a2b3; font-size: 11px; line-height: 17px; }
.cj-closeAction { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 36px; padding: 0 9px; border: 1px solid rgba(15,23,42,.14); border-radius: 9px; background: #f3f4f6; color: #26334d; font-size: 12px; font-weight: 650; line-height: 18px; }
.cj-closeAction:hover { border-color: rgba(15,23,42,.24); background: #e7eaf0; color: #14213d; }
.cj-closeAction:focus-visible { outline: 2px solid rgba(20,33,61,.28); outline-offset: 2px; }
.cj-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: auto; padding: 16px; gap: 11px; }
.cj-main-preview { overflow: hidden; }
.cj-mainBar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; }
.cj-mainHeading { font-size: 13px; font-weight: 700; color: #26334d; }
.cj-mainHint { margin-top: 2px; color: #8b95a7; font-size: 11px; }
.cj-fileSelect { min-width: 0; max-width: 270px; height: 30px; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #536078; padding: 0 9px; font-size: 11px; }
.cj-templateGallery { display: flex; gap: 8px; min-height: 104px; overflow-x: auto; padding: 1px 1px 4px; }
.cj-templateGallery[data-library="true"] { flex-wrap: wrap; align-content: flex-start; min-height: 0; overflow: visible; gap: 12px; }
.cj-templateCard { all: unset; box-sizing: border-box; display: block; flex: 0 0 190px; cursor: pointer; padding: 8px; border: 1px solid #e1e6ee; border-radius: 12px; background: #fff; }
.cj-templateCard:hover { border-color: #9db5e8; box-shadow: 0 3px 12px rgba(45,80,150,.08); }
.cj-templateCard[data-active="true"] { border-color: #3559a8; box-shadow: 0 0 0 2px rgba(53,89,168,.12); }
.cj-templateCard[data-compared="true"] { border-color: #9a78dd; box-shadow: 0 0 0 2px rgba(154,120,221,.14); }
.cj-templatePaper { position: relative; height: 96px; overflow: hidden; padding: 10px 11px; border: 1px solid #e7eaf0; border-radius: 4px; background: var(--thumb-bg, #fff); color: var(--thumb-accent, #26334d); }
.cj-thumbTop { display: flex; align-items: flex-end; gap: 5px; height: 12px; }
.cj-thumbTop:before { content: ''; display: block; width: 26px; height: 5px; border-radius: 1px; background: currentColor; }
.cj-thumbTop:after { content: ''; display: block; width: 42px; height: 3px; border-radius: 1px; background: #cbd3df; }
.cj-thumbRule { height: 2px; margin-top: 5px; background: var(--thumb-accent, #3559a8); }
.cj-thumbSection { width: 42px; height: 4px; margin-top: 8px; background: currentColor; box-shadow: 0 10px 0 #d7dde7, 28px 10px 0 #d7dde7, 0 20px 0 #d7dde7, 34px 20px 0 #d7dde7; }
.cj-thumbLines { position: absolute; left: 56px; right: 9px; top: 29px; height: 3px; background: #cbd3df; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templatePaper-technical { border-left: 5px solid var(--thumb-accent, #1f3a5f); }
.cj-templatePaper-technical .cj-thumbRule { background: var(--thumb-accent, #1f3a5f); }
.cj-templatePaper-editorial { background: linear-gradient(135deg, color-mix(in srgb, var(--thumb-accent, #0f766e) 10%, #fff), var(--thumb-bg, #fff) 60%); }
.cj-templatePaper-editorial .cj-thumbRule { height: 7px; background: color-mix(in srgb, var(--thumb-accent, #0f766e) 16%, transparent); }
.cj-templatePaper-editorial .cj-thumbSection { border-radius: 8px; }
.cj-templatePaper-terminal { background: linear-gradient(90deg, var(--thumb-bg, #fff) 0, var(--thumb-bg, #fff) 88%, #f1f5f9 88%); }
.cj-templatePaper-terminal .cj-thumbRule { background: var(--thumb-accent, #c2410c); }
.cj-templatePaper-two-column .cj-thumbLines { left: 64px; right: 28px; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templatePaper-two-column:after { content: ''; position: absolute; top: 29px; right: 9px; width: 18px; height: 3px; background: currentColor; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7; }
.cj-templateThumb { position: relative; height: 174px; overflow: hidden; border: 1px solid #e7eaf0; border-radius: 5px; background: #eef1f5; }
.cj-templateThumb iframe { position: absolute; top: 3px; left: 50%; width: 794px; height: 1123px; border: 0; background: #fff; transform: translateX(-50%) scale(.15); transform-origin: top center; pointer-events: none; }
.cj-templateThumb[data-loading="true"] { background: linear-gradient(90deg, #eef1f5 25%, #f8fafc 40%, #eef1f5 60%); background-size: 300% 100%; animation: cj-thumbLoading 1.2s ease-in-out infinite; }
.cj-templateThumb[data-loading="true"] iframe { opacity: 0; }
@keyframes cj-thumbLoading { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.cj-comparePreview .cj-templateThumb { height: 116px; }
.cj-comparePreview .cj-templateThumb iframe { transform: translateX(-50%) scale(.1); }
.cj-templateName { margin-top: 7px; overflow: hidden; color: #26334d; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.cj-templateCardFooter { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.cj-templateCardFooter .cj-templateName { min-width: 0; flex: 1; }
.cj-compareButton { all: unset; flex: 0 0 auto; cursor: pointer; padding: 3px 5px; border-radius: 5px; color: #6f5aa5; font-size: 10px; }
.cj-compareButton:hover, .cj-compareButton[data-active="true"] { background: #f0eafa; color: #6844a6; }
.cj-templateTags { margin-top: 3px; overflow: hidden; color: #5571aa; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.cj-templateDescription { min-height: 30px; margin-top: 4px; overflow: hidden; color: #8a94a6; font-size: 10px; line-height: 15px; }
.cj-workshop { padding: 14px; border: 1px solid #e3e7ee; border-radius: 12px; background: #fbfcfe; }
.cj-workshopTitle { color: #26334d; font-size: 13px; font-weight: 700; }
.cj-workshopHint { margin-top: 5px; color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-workshopFlow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.cj-workshopStep { min-height: 68px; padding: 9px; border: 1px solid #e0e6ef; border-radius: 9px; background: #fff; }
.cj-workshopStep > span { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #e9eef9; color: #3559a8; font-size: 10px; font-weight: 800; }
.cj-workshopStep strong { display: block; margin-top: 5px; color: #26334d; font-size: 11px; }
.cj-workshopStep small { display: block; margin-top: 3px; color: #8a94a6; font-size: 10px; line-height: 14px; }
.cj-workshopCurrent { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 9px 10px; border-radius: 9px; background: #eef3fb; color: #5571aa; font-size: 11px; }
.cj-workshopCurrent strong { color: #26334d; }
.cj-workshopMiniPaper { position: relative; width: 54px; height: 40px; flex: 0 0 auto; overflow: hidden; border: 1px solid #d8e0ef; border-radius: 3px; background: #fff; }
.cj-workshopMiniPaper:before { content: ''; position: absolute; left: 7px; right: 7px; top: 7px; height: 3px; background: currentColor; box-shadow: 0 8px 0 #d7dde7, 0 16px 0 #d7dde7, 20px 24px 0 #d7dde7; }
.cj-workshopMiniPaper:after { content: ''; position: absolute; left: 7px; right: 7px; top: 13px; height: 1px; background: currentColor; opacity: .55; }
.cj-workshopMiniPaper[data-variant="technical"] { color: #1f3a5f; border-left: 4px solid #1f3a5f; }
.cj-workshopMiniPaper[data-variant="editorial"] { color: #0f766e; background: #effcf9; }
.cj-workshopMiniPaper[data-variant="terminal"] { color: #c2410c; background: linear-gradient(90deg, #fff 0, #fff 86%, #f1f5f9 86%); }
.cj-advanced { margin-top: 12px; border-top: 1px solid #e5e9f0; padding-top: 10px; }
.cj-advanced summary { cursor: pointer; color: #59667d; font-size: 11px; font-weight: 700; }
.cj-workshopPrompt { margin-top: 9px; padding: 9px 10px; border-radius: 8px; background: #f0f3f8; color: #59667d; font-size: 11px; line-height: 17px; }
.cj-templateJson { display: block; width: 100%; min-height: 150px; margin-top: 10px; resize: vertical; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #26334d; padding: 9px; font: 11px/16px ui-monospace, SFMono-Regular, Consolas, monospace; }
.cj-workshopActions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.cj-workshopActions .cj-ghostAction, .cj-workshopActions .cj-solidAction { height: 30px; line-height: 30px; font-size: 11px; }
.cj-workshopMessage { margin-top: 8px; color: #26734d; font-size: 11px; line-height: 16px; }
.cj-comparePanel { margin-top: 14px; padding: 11px; border: 1px solid #ded5f3; border-radius: 11px; background: #fbf9ff; }
.cj-compareHead, .cj-tokenPanelHead, .cj-workshopPreviewHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cj-compareHead strong, .cj-tokenPanelHead strong { display: block; color: #30264b; font-size: 12px; }
.cj-compareHead span, .cj-tokenPanelHead span { display: block; margin-top: 3px; color: #887ba4; font-size: 10px; }
.cj-compareGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
.cj-compareCard { min-width: 0; padding: 8px; border: 1px solid #e8e1f6; border-radius: 9px; background: #fff; }
.cj-comparePreview { overflow: hidden; border-radius: 4px; }
.cj-comparePreview .cj-templatePaper { height: 68px; transform: scale(.98); transform-origin: top center; }
.cj-compareCard > strong { display: block; margin-top: 6px; overflow: hidden; color: #3a3154; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.cj-compareCard > span { display: block; margin-top: 3px; color: #8a7ca6; font-size: 9px; }
.cj-compareCard .cj-solidAction { width: 100%; height: 26px; margin-top: 7px; font-size: 10px; line-height: 26px; }
.cj-tokenPanel { margin-top: 12px; padding: 11px; border: 1px solid #e3e7ee; border-radius: 11px; background: #fff; }
.cj-tokenGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.cj-tokenControl { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 6px; min-width: 0; color: #66738a; font-size: 10px; }
.cj-tokenControl input[type="color"] { width: 28px; height: 22px; padding: 1px; border: 1px solid #dbe0e9; border-radius: 6px; background: #fff; }
.cj-tokenControl input[type="range"] { grid-column: 1 / -1; width: 100%; accent-color: #6d55aa; }
.cj-tokenControl strong { color: #536078; font-size: 10px; }
.cj-tokenSelect { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; color: #66738a; font-size: 10px; }
.cj-tokenSelect select { height: 27px; border: 1px solid #dbe0e9; border-radius: 7px; background: #fff; color: #536078; font-size: 10px; }
.cj-tokenActions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.cj-tokenActions button { height: 28px; font-size: 10px; line-height: 28px; }
.cj-workshopLayout { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(360px, .72fr) minmax(460px, 1.28fr); gap: 10px; }
.cj-workshopColumn { min-height: 0; overflow: auto; }
.cj-workshopPreview { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e3e7ee; border-radius: 12px; background: #eef1f5; }
.cj-workshopPreviewHead { flex: 0 0 auto; min-height: 42px; padding: 0 12px; border-bottom: 1px solid #dfe5ee; background: #fff; }
.cj-workshopPreviewHead strong { color: #26334d; font-size: 12px; }
.cj-workshopPreviewHead span { color: #8a94a6; font-size: 10px; }
.cj-workshopPreviewFrame { min-height: 0; flex: 1; overflow: hidden; }
.cj-workshopPreviewFrame iframe { display: block; width: 100%; height: 100%; min-height: 560px; border: 0; background: #eef1f5; }
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
.cj-visualAudit { margin-bottom: 18px; padding: 14px; border: 1px solid #e5e8ee; border-radius: 11px; background: #fbfcfe; }
.cj-visualAudit[data-state="balanced"] { border-color: #cfe8dc; background: #f8fdf9; }
.cj-visualAudit[data-state="overflow"], .cj-visualAudit[data-state="sparse"], .cj-visualAudit[data-state="needs-review"] { border-color: #f0d8a8; background: #fffdf8; }
.cj-visualAuditHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cj-sectionEyebrow { display: block; margin-bottom: 3px; color: #9aa3b3; font-size: 10px; letter-spacing: .08em; }
.cj-visualAuditHead h3 { font-size: 14px; }
.cj-visualAuditBadge { flex: 0 0 auto; color: #66738a; font-size: 11px; }
.cj-visualAudit[data-state="balanced"] .cj-visualAuditBadge { color: #15803d; }
.cj-visualAudit[data-state="overflow"] .cj-visualAuditBadge, .cj-visualAudit[data-state="sparse"] .cj-visualAuditBadge, .cj-visualAudit[data-state="needs-review"] .cj-visualAuditBadge { color: #a16207; }
.cj-visualAuditMeta, .cj-visualAuditHint { margin: 7px 0 0 !important; color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-visualAuditWarnings { margin-top: 8px; color: #a16207; font-size: 11px; line-height: 17px; }
.cj-visualAuditOkay { margin-top: 8px; color: #15803d; font-size: 11px; line-height: 17px; }
.cj-visualAuditHint { padding-top: 8px; border-top: 1px solid #edf0f4; color: #8b95a7; }
.cj-startView { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; }
.cj-startCard { width: min(680px, 100%); padding: 28px; border: 1px solid #e1e6ee; border-radius: 16px; background: linear-gradient(145deg, #fff, #f7f9fc); box-shadow: 0 12px 34px rgba(35,55,95,.07); }
.cj-startEyebrow { color: #5571aa; font-size: 11px; font-weight: 800; letter-spacing: .1em; }
.cj-startTitle { margin-top: 10px; color: #1e2b43; font-size: 24px; font-weight: 800; letter-spacing: -.03em; }
.cj-startCopy { max-width: 560px; margin-top: 8px; color: #6f7b90; font-size: 13px; line-height: 21px; }
.cj-startActions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; }
.cj-startOption { all: unset; box-sizing: border-box; cursor: pointer; min-height: 116px; padding: 14px; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
.cj-startOption:hover { border-color: #8da6d4; box-shadow: 0 5px 16px rgba(45,80,150,.1); transform: translateY(-1px); }
.cj-startOption[data-recommended="true"] { border-color: #7190ca; background: linear-gradient(155deg, #fff, #f4f7fd); box-shadow: 0 4px 15px rgba(53,89,168,.08); }
.cj-startOptionBadge { display: inline-flex; padding: 2px 6px; border-radius: 999px; background: #e6edfb; color: #3559a8; font-size: 9px; font-weight: 800; }
.cj-startOptionTitle { color: #26334d; font-size: 13px; font-weight: 700; }
.cj-startOptionCopy { margin-top: 7px; color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-startStatus { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; color: #5571aa; font-size: 11px; line-height: 17px; }
.cj-startStatus[data-state="error"] { color: #b42318; }
.cj-startRetry { flex: 0 0 auto; border: 0; border-radius: 7px; background: #eef3fb; color: #3559a8; padding: 5px 9px; font-size: 11px; cursor: pointer; }
.cj-startRetry:hover { background: #e1eafc; }
.cj-nextStep { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #edf0f4; color: #66738a; font-size: 11px; line-height: 16px; }
.cj-nextStep strong { color: #59667d; }
.cj-nextStepButton { flex: 0 0 auto; border: 0; border-radius: 7px; background: #eef3fb; color: #3559a8; padding: 6px 8px; font-size: 10px; cursor: pointer; }
.cj-nextStepButton:hover { background: #e1eafc; }
.cj-inspectorDetails { margin-top: 9px; border-top: 1px solid #edf0f4; padding-top: 8px; }
.cj-inspectorDetails summary { cursor: pointer; color: #66738a; font-size: 11px; font-weight: 700; }
.cj-inspectorDetails .cj-inspectorCard { margin-top: 8px; }
.cj-inspectorCard[data-priority="primary"] { border-color: #cfdbf2; background: linear-gradient(155deg, #f7f9fe, #fff); }
.cj-previewActions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cj-previewShell { position: relative; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.cj-previewShell > .cj-mainBar { flex: 0 0 auto; padding-right: 0; }
.cj-toolButton { all: unset; box-sizing: border-box; cursor: pointer; max-width: 180px; height: 30px; overflow: hidden; padding: 0 10px; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #536078; font-size: 11px; line-height: 30px; text-overflow: ellipsis; white-space: nowrap; }
.cj-toolButton:hover, .cj-toolButton[aria-expanded="true"] { border-color: #9db5e8; color: #3559a8; background: #f7f9fe; }
.cj-iconAction { all: unset; box-sizing: border-box; cursor: pointer; display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid #dbe0e9; border-radius: 8px; background: #fff; color: #536078; font-size: 15px; line-height: 30px; }
.cj-iconAction:hover { border-color: #9db5e8; color: #3559a8; background: #f7f9fe; }
.cj-inlineTuning { min-width: 300px; flex: 1; display: flex; align-items: center; justify-content: center; gap: 9px; padding: 0 8px; }
.cj-inlineControl { min-width: 78px; display: grid; grid-template-columns: auto auto; align-items: center; gap: 4px 6px; color: #7b8496; font-size: 9px; white-space: nowrap; }
.cj-inlineControl strong { color: #536078; font-size: 9px; font-weight: 700; }
.cj-inlineControl input { grid-column: 1 / -1; display: block; width: 82px; height: 13px; margin: 0; accent-color: #3559a8; }
.cj-inlineReset { all: unset; box-sizing: border-box; cursor: pointer; min-width: 23px; height: 23px; padding: 0 4px; border-radius: 6px; color: #7b8496; font-size: 10px; line-height: 23px; text-align: center; }
.cj-inlineReset:hover { background: #edf1f6; color: #3559a8; }
.cj-inlineReset:disabled { cursor: default; opacity: .4; }
.cj-inlineStatus { flex: 0 0 auto; color: #7b8496; font-size: 10px; white-space: nowrap; }
.cj-inlineStatus-sparse { color: #a16207; }
.cj-inlineStatus-review { color: #a16207; }
.cj-inlineStatus-overflow, .cj-inlineStatus-multi { color: #b42318; }
.cj-inlineStatus-fit { color: #15803d; }
.cj-templatePicker { position: absolute; top: 42px; right: 0; z-index: 50; width: min(760px, calc(100vw - 190px)); max-height: 300px; overflow: auto; padding: 12px; border: 1px solid #dfe5ee; border-radius: 13px; background: rgba(255,255,255,.98); box-shadow: 0 16px 40px rgba(24,43,78,.16); }
.cj-templatePickerHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; color: #26334d; font-size: 12px; }
.cj-templatePickerHead strong { font-weight: 800; }
.cj-templatePickerClose { all: unset; cursor: pointer; padding: 4px 6px; border-radius: 6px; color: #8b95a7; font-size: 10px; }
.cj-templatePickerClose:hover { background: #edf1f6; color: #3559a8; }
.cj-tuningPopover { position: absolute; top: 42px; right: 0; z-index: 50; width: 360px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; border: 1px solid #dfe5ee; border-radius: 13px; background: rgba(255,255,255,.98); box-shadow: 0 16px 40px rgba(24,43,78,.16); }
.cj-tuningPopoverHead { flex: 0 0 100%; display: flex; align-items: center; justify-content: space-between; color: #26334d; font-size: 12px; }
.cj-tuningPopover .cj-inlineControl { flex: 1 1 145px; min-width: 140px; }
.cj-tuningPopover .cj-inlineControl input { width: 100%; }
.cj-tuningPopover .cj-inlineReset { margin-left: auto; }
.cj-previewWorkspace { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(300px, .82fr) minmax(420px, 1.18fr); gap: 10px; }
.cj-previewWorkspace[data-chat="open"] { grid-template-columns: minmax(240px, .62fr) minmax(560px, 1.1fr) minmax(300px, .72fr); }
.cj-previewEditorPane, .cj-previewA4Pane { min-height: 0; }
.cj-editorLoading { min-height: 0; flex: 1; display: grid; place-items: center; color: #8b95a7; font-size: 12px; }
.cj-inspectorDock { position: absolute; top: 0; right: 0; z-index: 40; }
.cj-inspectorToggle { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 20px auto auto 14px; align-items: center; gap: 6px; min-width: 164px; height: 32px; padding: 0 9px; border: 1px solid #dbe0e9; border-radius: 9px; background: rgba(255,255,255,.96); color: #536078; box-shadow: 0 4px 14px rgba(24,43,78,.08); }
.cj-inspectorToggle:hover, .cj-inspectorToggle[aria-expanded="true"] { border-color: #9db5e8; color: #26334d; }
.cj-inspectorToggle > span:nth-child(2) { font-size: 11px; font-weight: 700; }
.cj-inspectorToggle small { overflow: hidden; color: #8b95a7; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.cj-inspectorChevron { color: #8b95a7; font-size: 12px; text-align: center; }
.cj-inspectorDot { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: #eef1f5; color: #7b8496; font-size: 11px; font-weight: 800; }
.cj-inspectorDot-fit { background: #e4f5ed; color: #15803d; }
.cj-inspectorDot-sparse { background: #fff2d8; color: #a16207; }
.cj-inspectorDot-overflow, .cj-inspectorDot-multi { background: #fde8e8; color: #b91c1c; }
.cj-inspectorPopover { width: 310px; max-height: min(620px, calc(100vh - 150px)); overflow: auto; margin-top: 7px; padding: 11px; border: 1px solid #dfe5ee; border-radius: 13px; background: rgba(255,255,255,.98); box-shadow: 0 16px 40px rgba(24,43,78,.18); }
.cj-inspectorPopoverHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 1px 8px; color: #26334d; font-size: 12px; }
.cj-inspectorPopover .cj-inspectorCard, .cj-inspectorPopover .cj-controlCard { margin-top: 8px; }
.cj-editorOverlay { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; overflow: hidden; background: #f7f8fb; }
.cj-editorTop { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 10px 16px; border-bottom: 1px solid rgba(15,23,42,.09); background: #fff; }
.cj-editorTopTitle { min-width: 0; color: #26334d; font-size: 13px; font-weight: 800; }
.cj-editorTopMeta { margin-top: 2px; overflow: hidden; color: #8b95a7; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.cj-editorTopActions { display: flex; align-items: center; gap: 6px; }
.cj-editorBody { min-height: 0; flex: 1; display: grid; grid-template-columns: minmax(0, .94fr) minmax(0, 1.06fr); gap: 10px; padding: 10px; }
.cj-editorBody[data-chat="open"] { grid-template-columns: minmax(0, .76fr) minmax(0, .92fr) 340px; }
.cj-editorPane { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
.cj-editorPaneHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; padding: 0 11px; border-bottom: 1px solid #edf0f4; color: #59667d; font-size: 11px; font-weight: 700; }
.cj-editorPaneHead small { color: #9aa3b3; font-size: 10px; font-weight: 400; }
.cj-editorText { min-height: 0; flex: 1; width: 100%; resize: none; border: 0; outline: 0; padding: 14px; color: #26334d; background: #fff; font: 12px/1.7 ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; tab-size: 2; }
.cj-editorText:focus { box-shadow: inset 0 0 0 2px rgba(53,89,168,.12); }
.cj-editorStatus { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 11px; border-top: 1px solid #edf0f4; color: #8b95a7; font-size: 10px; line-height: 15px; }
.cj-editorStatus > span { min-width: 0; }
.cj-editorReload { flex: 0 0 auto; border: 0; border-radius: 6px; background: #eef3fb; color: #3559a8; padding: 4px 7px; font-size: 10px; cursor: pointer; }
.cj-editorReload:hover { background: #e1eafc; }
.cj-editorPreviewFrame { min-height: 0; flex: 1; overflow: hidden; background: #fff; }
.cj-editorPreviewFrame iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.cj-editorChat { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 14px; background: #f8fafc; box-shadow: 0 8px 24px rgba(24,43,78,.06); }
.cj-editorChatHead { padding: 13px 13px 10px; border-bottom: 1px solid #e8edf3; background: rgba(255,255,255,.92); }
.cj-editorChatTitle { color: #26334d; font-size: 12px; font-weight: 800; }
.cj-editorChatHint { margin-top: 3px; color: #8b95a7; font-size: 10px; line-height: 15px; }
.cj-chatMessages { min-height: 0; flex: 1; overflow: auto; padding: 11px 10px 6px; scroll-behavior: smooth; }
.cj-chatLoadEarlier { display: block; margin: 0 auto 8px; border: 1px solid #dfe5ee; border-radius: 999px; background: #fff; color: #6d7890; padding: 5px 10px; font-size: 10px; cursor: pointer; }
.cj-chatLoadEarlier:hover { border-color: #b9c9e4; background: #f8faff; color: #3559a8; }
.cj-chatLoadEarlier:disabled { cursor: wait; opacity: .62; }
.cj-chatHistoryNotice { margin: 0 auto 8px; color: #8791a3; font-size: 10px; line-height: 15px; text-align: center; }
.cj-chatUnread { position: sticky; bottom: 2px; display: block; margin: 2px auto 0; border: 1px solid #cbd8ee; border-radius: 999px; background: #fff; color: #3559a8; padding: 5px 9px; font-size: 10px; box-shadow: 0 5px 14px rgba(24,43,78,.12); cursor: pointer; }
.cj-chatEmpty { padding: 12px; border: 1px dashed #dbe3ef; border-radius: 11px; background: rgba(255,255,255,.72); color: #7b8496; font-size: 11px; line-height: 17px; }
.cj-chatMessage { margin: 0 0 9px; padding: 9px 10px; border: 1px solid #e9edf3; border-radius: 11px; color: #59667d; background: #fff; font-size: 11px; line-height: 17px; box-shadow: 0 2px 8px rgba(24,43,78,.03); }
.cj-chatMessage[data-role="user"] { max-width: 92%; margin-left: auto; border-color: #d8e4fa; background: #edf4ff; color: #3559a8; }
.cj-chatMessage strong { display: block; margin-bottom: 5px; color: #26334d; font-size: 10px; }
.cj-chatMessage[data-role="user"] strong { color: #3559a8; }
.cj-expandableBody { position: relative; }
.cj-expandableBody[data-expanded="false"] { max-height: 132px; overflow: hidden; }
.cj-expandableBody[data-expanded="false"]::after { content: ''; position: absolute; right: 0; bottom: 0; left: 0; height: 32px; pointer-events: none; background: linear-gradient(transparent, #fff); }
.cj-chatMessage[data-role="user"] .cj-expandableBody[data-expanded="false"]::after { background: linear-gradient(transparent, #edf4ff); }
.cj-expandToggle { position: relative; z-index: 1; display: block; margin: 6px 0 0; border: 0; background: transparent; color: #5475bb; padding: 0; font-size: 10px; cursor: pointer; }
.cj-expandToggle:hover { color: #274887; text-decoration: underline; }
.cj-assistantMarkdown { color: #44516a; }
.cj-assistantMarkdown p { margin: 0 0 7px; }
.cj-assistantMarkdown p:last-child { margin-bottom: 0; }
.cj-assistantMarkdown h3, .cj-assistantMarkdown h4 { margin: 9px 0 5px; color: #26334d; font-size: 12px; line-height: 17px; }
.cj-assistantMarkdown ul { margin: 4px 0 7px 16px; padding: 0; }
.cj-assistantMarkdown li { margin: 2px 0; }
.cj-assistantMarkdown code { border-radius: 4px; background: #f1f4f8; color: #3559a8; padding: 1px 4px; font: 10px/15px ui-monospace, SFMono-Regular, Consolas, monospace; }
.cj-assistantMarkdown pre { overflow: auto; margin: 6px 0 2px; padding: 8px; border-radius: 7px; background: #172033; color: #e5edf9; font: 10px/15px ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; }
.cj-chatComposer { padding: 9px; border-top: 1px solid #edf0f4; }
.cj-chatInput { display: block; width: 100%; min-height: 66px; resize: vertical; border: 1px solid #dbe0e9; border-radius: 9px; outline: 0; padding: 8px; color: #26334d; font-family: inherit; font-size: 11px; line-height: 17px; }
.cj-chatInput:focus { border-color: #8da6d4; box-shadow: 0 0 0 2px rgba(53,89,168,.10); }
.cj-chatQuick { display: flex; gap: 5px; margin-top: 6px; overflow-x: auto; }
.cj-chatQuick button { flex: 0 0 auto; border: 0; border-radius: 999px; background: #f0f3f8; color: #59667d; padding: 5px 7px; font-size: 10px; cursor: pointer; }
.cj-chatQuick button:hover { background: #e5ebf5; color: #3559a8; }
.cj-chatActions { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin-top: 7px; }
.cj-chatBridge { color: #8b95a7; font-size: 10px; line-height: 15px; }
.cj-chatBridge[data-state="connected"] { color: #15803d; }
.cj-chatBridge[data-state="fallback"] { color: #a16207; }
.cj-chatContext { margin: 9px 10px 0; padding: 8px 9px; border: 1px solid #e3e8f0; border-radius: 9px; background: #fbfcfe; color: #6d7890; font-size: 10px; line-height: 15px; }
.cj-chatContext strong { color: #3559a8; font-weight: 600; }
.cj-chatContext[data-state="idle"] strong { color: #7b8496; }
.cj-chatContextText { display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cj-chatTimeline { margin: 2px 0 10px; padding: 0 2px; border: 0; background: transparent; }
.cj-chatTimelineHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 2px 5px; padding-bottom: 4px; border-bottom: 1px solid #edf0f4; color: #7b8496; font-size: 10px; }
.cj-chatTimelineHead span { color: #9aa3b3; font-weight: 400; }
.cj-chatTimelineList { display: grid; gap: 2px; max-height: 190px; overflow: auto; }
.cj-nativeTaskRow { min-height: 24px; }
.cj-nativeEventTarget { overflow: hidden; color: #8b95a7; text-overflow: ellipsis; white-space: nowrap; }
.cj-chatTimelineItem { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 6px; align-items: start; min-width: 0; }
.cj-chatTimelineDot { display: inline-grid; place-items: center; width: 18px; height: 18px; border: 1px solid #dbe3ef; border-radius: 6px; background: #fff; color: #70809b; font-size: 9px; font-weight: 800; }
.cj-chatTimelineItem[data-state="running"] .cj-chatTimelineDot { background: #e8efff; color: #3559a8; }
.cj-chatTimelineItem[data-state="waiting"] .cj-chatTimelineDot { background: #fff2d8; color: #a16207; }
.cj-chatTimelineItem[data-state="error"] .cj-chatTimelineDot { background: #fde8e8; color: #b91c1c; }
.cj-chatTimelineBody { min-width: 0; color: #6d7890; font-size: 10px; line-height: 14px; }
.cj-chatTimelineMeta { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
.cj-chatTimelineMeta strong { flex: 0 0 auto; color: #42516d; font-size: 10px; }
.cj-chatTimelineMeta span { overflow: hidden; color: #8b95a7; text-overflow: ellipsis; white-space: nowrap; }
.cj-chatTimelineSummary { overflow: hidden; color: #9aa3b3; text-overflow: ellipsis; white-space: nowrap; }
.cj-chatTimelineItem summary { display: block; cursor: pointer; list-style: none; }
.cj-chatTimelineItem summary::-webkit-details-marker { display: none; }
.cj-chatTimelineItem summary::before { content: '›'; display: inline-block; width: 10px; color: #9aa3b3; }
.cj-chatTimelineItem[open] summary::before { content: '⌄'; }
.cj-chatTimelineItem[data-type="think"] .cj-chatTimelineDot { background: #f4f1fb; color: #7c5aa8; }
.cj-chatTimelineItem[data-type="read"] .cj-chatTimelineDot { background: #eef7f5; color: #15803d; }
.cj-chatTimelineItem[data-type="edit"] .cj-chatTimelineDot { background: #fff5e8; color: #a16207; }
.cj-chatTimelineItem[data-type="grep"] .cj-chatTimelineDot { background: #eef4ff; color: #3559a8; }
.cj-chatTimelineDetail { grid-column: 2; margin: 4px 0 0 10px; color: #7b8496; font-size: 10px; line-height: 15px; white-space: pre-wrap; }
.cj-questionCard { margin: 9px 10px; padding: 10px; border: 1px solid #cbd8ee; border-radius: 10px; background: #f7faff; color: #26334d; }
.cj-questionEyebrow { color: #5472ab; font-size: 10px; font-weight: 600; letter-spacing: .03em; }
.cj-questionTitle { margin: 3px 0 8px; font-size: 12px; line-height: 17px; font-weight: 600; }
.cj-questionDetail { margin: -2px 0 8px; color: #6d7890; font-size: 10px; line-height: 15px; }
.cj-questionOptions { display: grid; gap: 5px; }
.cj-questionOption { display: flex; align-items: flex-start; gap: 6px; width: 100%; border: 1px solid #dbe3f1; border-radius: 7px; background: #fff; color: #42516d; padding: 7px 8px; text-align: left; font-size: 11px; line-height: 15px; cursor: pointer; }
.cj-questionOption:hover { border-color: #8da6d4; background: #f1f5fb; }
.cj-questionOption[data-selected="true"] { border-color: #5475bb; background: #edf3ff; color: #274887; }
.cj-questionMark { flex: 0 0 auto; width: 15px; height: 15px; border: 1px solid #b9c5d8; border-radius: 50%; color: #5475bb; font-size: 9px; line-height: 13px; text-align: center; }
.cj-questionOption[data-selected="true"] .cj-questionMark { border-color: #5475bb; background: #5475bb; color: #fff; }
.cj-questionCustom { box-sizing: border-box; width: 100%; min-height: 30px; resize: vertical; border: 1px solid #dbe3f1; border-radius: 7px; outline: 0; padding: 6px 8px; color: #26334d; font: inherit; font-size: 11px; line-height: 15px; }
.cj-questionCustom:focus { border-color: #8da6d4; box-shadow: 0 0 0 2px rgba(53,89,168,.10); }
.cj-questionActions { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; }
.cj-questionProgress { color: #8b95a7; font-size: 10px; }
.cj-questionSubmit { border: 0; border-radius: 7px; background: #14213d; color: #fff; padding: 6px 9px; font-size: 10px; cursor: pointer; }
.cj-questionSubmit:disabled { opacity: .45; cursor: default; }
.cj-questionError { margin-top: 5px; color: #b91c1c; font-size: 10px; line-height: 14px; }
.cj-chatSend { border: 0; border-radius: 8px; background: #14213d; color: #fff; padding: 7px 10px; font-size: 11px; cursor: pointer; }
.cj-chatSend:disabled { opacity: .45; cursor: default; }
.cj-chatStop { border: 0; border-radius: 8px; background: #eef1f6; color: #536078; padding: 7px 10px; font-size: 11px; cursor: pointer; }
.cj-chatStop:hover { background: #e3e8f1; color: #26334d; }
.cj-chatApply { margin-top: 6px; border: 0; border-radius: 7px; background: #e4f5ed; color: #15803d; padding: 5px 7px; font-size: 10px; cursor: pointer; }
@media (max-width: 900px) { .cj-editorBody, .cj-editorBody[data-chat="open"], .cj-previewWorkspace, .cj-previewWorkspace[data-chat="open"], .cj-workshopLayout { grid-template-columns: 1fr; overflow: auto; } .cj-editorPane, .cj-previewWorkspace .cj-editorPane, .cj-workshopPreview { min-height: 360px; } .cj-editorChat { min-height: 300px; } .cj-inlineTuning { min-width: 0; justify-content: flex-start; overflow-x: auto; } }
@media (max-width: 720px) { .cj-startActions { grid-template-columns: 1fr; } .cj-startCard { padding: 20px; } .cj-workshopFlow, .cj-compareGrid, .cj-tokenGrid { grid-template-columns: 1fr; } .cj-templateCard { flex-basis: 160px; } }
.cj-guideNo { color: #9aabc9; font-weight: 800; }
.cj-qualityStatus { display: inline-grid; place-items: center; width: 19px; height: 19px; flex: 0 0 auto; border-radius: 50%; background: #eef1f5; color: #7b8496; font-size: 11px; font-weight: 800; }
.cj-quality-pass { background: #e4f5ed; color: #15803d; }
.cj-quality-warn { background: #fff2d8; color: #a16207; }
.cj-quality-error { background: #fde8e8; color: #b91c1c; }
.cj-qualityStatus + span { display: flex; flex-direction: column; gap: 3px; }
.cj-qualityStatus + span small { color: #8b95a7; font-size: 11px; }
@media (max-width: 720px) {
  .cj-body { padding-left: 14px; padding-right: 14px; }
  .cj-selectWrap { min-width: 100%; }
  .cj-actions { width: 100%; justify-content: space-between; }
  .cj-action { flex: 1; padding-left: 8px; padding-right: 8px; }
  .cj-workbenchBody { display: block; overflow: auto; }
  .cj-nav { display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid rgba(15,23,42,.08); padding: 8px; }
  .cj-navLabel { display: none; }
  .cj-navFoot { display: flex; flex: 0 0 auto; flex-direction: row; align-items: center; margin: 0; padding: 0 8px; border: 0; }
  .cj-navFoot > div { display: none; }
  .cj-closeAction { width: auto; min-height: 34px; padding: 0 12px; }
  .cj-navItem { width: auto; padding: 0 12px; white-space: nowrap; }
  .cj-main { min-height: 560px; }
  .cj-main-preview { overflow: auto; }
  .cj-previewShell > .cj-mainBar { padding-right: 0; align-items: flex-start; flex-direction: column; }
  .cj-previewActions { width: 100%; flex-wrap: wrap; }
  .cj-inspectorDock { top: auto; right: 0; bottom: 6px; }
  .cj-templatePicker { left: 0; right: auto; width: min(100%, 420px); }
  .cj-tuningPopover { left: 0; right: auto; width: min(100%, 360px); }
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

    async function readJsonResponse(response, label) {
      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        if (contentType.includes('text/html')) {
          throw new Error(`${label}服务尚未刷新，请重启 DSH Web 后重试`)
        }
        throw new Error(`${label}返回了无效数据，请稍后重试`)
      }
      if (!response.ok) throw new Error(data?.error || `${label}失败（${response.status}）`)
      return data
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

    function AssistantQuestionCard({ pending }) {
      const questions = pending?.payload?.questions || []
      const [index, setIndex] = React.useState(0)
      const [drafts, setDrafts] = React.useState(() => questions.map(() => ({ selected: [], custom: '', skipped: false })))
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setIndex(0)
        setDrafts(questions.map(() => ({ selected: [], custom: '', skipped: false })))
        setBusy(false)
        setError('')
      }, [pending?.key])

      if (!questions.length) return null
      const question = questions[index] || questions[0]
      const draft = drafts[index] || { selected: [], custom: '', skipped: false }
      const answered = draft.selected.length > 0 || draft.custom.trim() !== ''
      const updateDraft = (next) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? next(item) : item))
      const choose = (label) => {
        updateDraft((current) => {
          if (question.multiSelect === true) {
            const selected = current.selected.includes(label)
              ? current.selected.filter((value) => value !== label)
              : [...current.selected, label]
            return { ...current, selected, skipped: false }
          }
          return { selected: [label], custom: '', skipped: false }
        })
        setError('')
      }
      const submit = async (values) => {
        const incomplete = values.findIndex((value) => !value.skipped && value.selected.length === 0 && value.custom.trim() === '')
        if (incomplete >= 0) {
          setIndex(incomplete)
          setError('请先完成这个问题，或选择跳过。')
          return
        }
        setBusy(true)
        setError('')
        try {
          await pending.respond({
            ok: true,
            value: {
              sessionId: pending.sessionId,
              answer: {
                answers: questions.map((item, itemIndex) => {
                  const value = values[itemIndex]
                  const custom = value.custom.trim()
                  return {
                    id: item.id,
                    selected: value.skipped || (custom && item.multiSelect !== true) ? [] : value.selected,
                    ...(custom ? { custom } : {}),
                  }
                }),
              },
            },
          })
        } catch (cause) {
          setBusy(false)
          setError(String(cause?.message || cause))
        }
      }
      const continueQuestion = () => {
        if (!answered) {
          setError('请选择一个选项或填写自定义答案。')
          return
        }
        if (index < questions.length - 1) {
          setIndex((value) => value + 1)
          setError('')
          return
        }
        void submit(drafts)
      }
      const skipQuestion = () => {
        const next = drafts.map((item, itemIndex) => itemIndex === index ? { selected: [], custom: '', skipped: true } : item)
        setDrafts(next)
        if (index < questions.length - 1) {
          setIndex((value) => value + 1)
          setError('')
        } else {
          void submit(next)
        }
      }
      const cancel = async () => {
        setBusy(true)
        try {
          await pending.respond({ ok: false, error: { code: 'cancelled', message: '用户在简历工作台取消了问题', details: {} } })
        } catch (cause) {
          setBusy(false)
          setError(String(cause?.message || cause))
        }
      }
      return React.createElement(
        'section',
        { className: 'cj-questionCard', 'aria-label': 'AI 需要确认' },
        React.createElement('div', { className: 'cj-questionEyebrow' }, 'AI 需要你确认'),
        React.createElement('div', { className: 'cj-questionTitle' }, question.question),
        question.detail ? React.createElement('div', { className: 'cj-questionDetail' }, question.detail) : null,
        React.createElement('div', { className: 'cj-questionOptions', role: question.multiSelect === true ? 'group' : 'radiogroup' },
          ...(question.options || []).map((option, optionIndex) => {
            const selected = draft.selected.includes(option.label)
            return React.createElement('button', { key: `${option.label}-${optionIndex}`, type: 'button', className: 'cj-questionOption', 'data-selected': selected ? 'true' : 'false', role: question.multiSelect === true ? 'checkbox' : 'radio', 'aria-checked': selected, onClick: () => choose(option.label), disabled: busy }, React.createElement('span', { className: 'cj-questionMark' }, selected ? '✓' : String(optionIndex + 1)), React.createElement('span', null, option.label, option.description ? React.createElement('small', { className: 'cj-questionDetail' }, option.description) : null))
          }),
          React.createElement('textarea', { className: 'cj-questionCustom', value: draft.custom, onChange: (event) => { updateDraft((current) => ({ ...current, custom: event.target.value, selected: question.multiSelect === true ? current.selected : [], skipped: false })); setError('') }, placeholder: '也可以填写你的答案', rows: 2, disabled: busy }),
        ),
        error ? React.createElement('div', { className: 'cj-questionError' }, error) : null,
        React.createElement('div', { className: 'cj-questionActions' },
          React.createElement('span', { className: 'cj-questionProgress' }, `${index + 1} / ${questions.length}`),
          React.createElement('div', null,
            React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: skipQuestion, disabled: busy }, '跳过'),
            React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: cancel, disabled: busy }, '取消'),
            React.createElement('button', { type: 'button', className: 'cj-questionSubmit', onClick: continueQuestion, disabled: busy || !answered }, index < questions.length - 1 ? '下一题' : '提交'),
          ),
        ),
      )
    }

    function renderAssistantInline(text, keyPrefix) {
      return String(text || '').split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) return React.createElement('code', { key: `${keyPrefix}-code-${index}` }, part.slice(1, -1))
        if (part.startsWith('**') && part.endsWith('**')) return React.createElement('strong', { key: `${keyPrefix}-strong-${index}` }, part.slice(2, -2))
        return React.createElement(React.Fragment, { key: `${keyPrefix}-text-${index}` }, part)
      })
    }

    function AssistantMarkdown({ text }) {
      const lines = String(text || '').replace(/\r/g, '').split('\n')
      const blocks = []
      let code = null
      let list = []
      const flushList = () => {
        if (!list.length) return
        blocks.push(React.createElement('ul', { key: `list-${blocks.length}` }, ...list.map((item, index) => React.createElement('li', { key: `item-${index}` }, renderAssistantInline(item, `li-${blocks.length}-${index}`)))))
        list = []
      }
      lines.forEach((line, index) => {
        if (line.trim().startsWith('```')) {
          if (code == null) code = []
          else {
            blocks.push(React.createElement('pre', { key: `code-${index}` }, code.join('\n')))
            code = null
          }
          return
        }
        if (code != null) {
          code.push(line)
          return
        }
        const trimmed = line.trim()
        if (!trimmed) {
          flushList()
          return
        }
        const heading = trimmed.match(/^(#{2,4})\s+(.+)$/)
        if (heading) {
          flushList()
          blocks.push(React.createElement(heading[1].length === 2 ? 'h3' : 'h4', { key: `heading-${index}` }, renderAssistantInline(heading[2], `heading-${index}`)))
          return
        }
        const bullet = trimmed.match(/^[-*]\s+(.+)$/)
        if (bullet) {
          list.push(bullet[1])
          return
        }
        flushList()
        blocks.push(React.createElement('p', { key: `paragraph-${index}` }, renderAssistantInline(trimmed, `paragraph-${index}`)))
      })
      if (code != null) blocks.push(React.createElement('pre', { key: `code-final-${blocks.length}` }, code.join('\n')))
      flushList()
      return React.createElement('div', { className: 'cj-assistantMarkdown' }, blocks.length ? blocks : React.createElement('p', null, ''))
    }

    function AssistantExpandableContent({ text, markdown = false, initialExpanded = false }) {
      const source = String(text || '')
      const long = source.length > 520 || source.split('\n').length > 8
      const [expanded, setExpanded] = React.useState(initialExpanded || !long)
      React.useEffect(() => {
        setExpanded(initialExpanded || !long)
      }, [source, initialExpanded, long])
      const visible = expanded || !long ? source : `${source.slice(0, 520).trimEnd()}…`
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-expandableBody', 'data-expanded': expanded || !long ? 'true' : 'false' }, markdown ? React.createElement(AssistantMarkdown, { text: visible }) : visible),
        long ? React.createElement('button', { type: 'button', className: 'cj-expandToggle', onClick: () => setExpanded((value) => !value) }, expanded ? '收起' : '展开全文') : null,
      )
    }

    function AssistantFeed({ items }) {
      if (!Array.isArray(items) || !items.length) return null
      const NativeDisclosureRow = dshPrimitives.DisclosureRow
      const NativeIcon = (event) => {
        const Icon = event.status === 'error'
          ? dshPrimitives.IconWarningOutline16
          : event.status === 'waiting'
            ? dshPrimitives.IconQuestionOutline14
            : event.status === 'running'
              ? dshPrimitives.IconLoadingOutline16
              : dshPrimitives.IconSparkle16
        return Icon ? React.createElement(Icon, { size: 14 }) : null
      }
      const [openRows, setOpenRows] = React.useState({})
      const toggleRow = (key) => setOpenRows((current) => ({ ...current, [key]: !current[key] }))
      return React.createElement(
        'div',
        { className: 'cj-chatFeed', 'aria-label': '主对话任务流' },
        ...items.map((item, index) => {
          if (item.type === 'assistant' || item.type === 'user') {
            return React.createElement('div', { className: 'cj-chatMessage', 'data-role': item.type, key: `${item.seq}-${item.type}-${index}` }, React.createElement('strong', null, item.type === 'user' ? '你' : '主对话'), React.createElement(AssistantExpandableContent, { text: item.summary, markdown: item.type === 'assistant' }))
          }
          const key = `${item.seq}-${item.type}-${index}`
          const open = openRows[key] ?? (item.status === 'running' || item.status === 'waiting')
          const icon = NativeIcon(item) || React.createElement('span', { className: 'cj-chatTimelineDot' }, item.status === 'done' ? '✓' : item.status === 'error' ? '!' : item.status === 'waiting' ? '?' : '·')
          const content = item.summary || item.target
            ? React.createElement('div', { className: 'cj-chatTimelineDetail' }, React.createElement(AssistantExpandableContent, { text: item.summary || item.target, initialExpanded: true }))
            : null
          if (NativeDisclosureRow) {
            return React.createElement(NativeDisclosureRow, {
              key,
              icon,
              title: item.label || 'Event',
              open,
              expandable: Boolean(content),
              onToggle: () => toggleRow(key),
              expandOnRowClick: true,
              previewChevron: true,
              collapsedContent: item.target ? React.createElement('span', { className: 'cj-nativeEventTarget' }, item.target) : null,
              children: content,
              className: 'cj-nativeTaskRow',
            })
          }
          return React.createElement('details', { className: 'cj-chatTimelineItem', 'data-state': item.status || 'done', 'data-type': item.type || 'tool', open, key }, React.createElement('span', { className: 'cj-chatTimelineDot' }, item.status === 'done' ? '✓' : item.status === 'error' ? '!' : item.status === 'waiting' ? '?' : '·'), React.createElement('summary', { className: 'cj-chatTimelineBody' }, React.createElement('div', { className: 'cj-chatTimelineMeta' }, React.createElement('strong', null, item.label || 'Event'), item.target ? React.createElement('span', null, item.target) : null)), content)
        })
      )
    }

    function layoutSettingsFromTemplate(template) {
      return {
        fontSize: Number(template?.typography?.fontSize) || 14,
        lineHeight: Number(template?.typography?.lineHeight) || 1.55,
        sectionGap: Number(template?.spacing?.sectionGap) || 20,
        pageMargin: Number(template?.spacing?.pageMargin) || 48,
      }
    }

    function visualTokensFromTemplate(template) {
      return {
        accentColor: template?.visual?.accentColor || '#2563eb',
        textColor: template?.visual?.textColor || '#1f2937',
        mutedColor: template?.visual?.mutedColor || '#6b7280',
        backgroundColor: template?.visual?.backgroundColor || '#ffffff',
        cornerRadius: Number(template?.visual?.cornerRadius) || 0,
        divider: template?.visual?.divider || 'solid',
      }
    }

    function PreviewWorkbench({ compact, onClose }) {
      ensureCss()
      const [tick, setTick] = useState(0)
      const { status, error, loading, reload } = useStatus(tick)
      const mainConversation = useMainConversation()
      const [selected, setSelected] = useState('')
      const [fitState, setFitState] = useState({ text: '等待排版信息', state: 'pending' })
      const [view, setView] = useState('start')
      const [startupMessage, setStartupMessage] = useState('')
      const [startupError, setStartupError] = useState(false)
      const [startupMode, setStartupMode] = useState('demo')
      const [hasResolvedInitialView, setHasResolvedInitialView] = useState(false)
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
      const [visualTokens, setVisualTokens] = useState(() => visualTokensFromTemplate(selectedTemplate))
      const [visualHistory, setVisualHistory] = useState([])
      const [templateCompareIds, setTemplateCompareIds] = useState([])
      const { quality, qualityLoading } = useQuality(selected, tick)
      const [editorOpen, setEditorOpen] = useState(false)
      const [editorSource, setEditorSource] = useState(null)
      const [editorDraft, setEditorDraft] = useState('')
      const [editorSelection, setEditorSelection] = useState('')
      const [editorPreviewUrl, setEditorPreviewUrl] = useState('')
      const [editorBusy, setEditorBusy] = useState(false)
      const [editorMessage, setEditorMessage] = useState('')
      const [editorExternalPending, setEditorExternalPending] = useState(false)
      const editorDiskContentRef = useRef('')
      const [editorChatOpen, setEditorChatOpen] = useState(false)
      const [chatInput, setChatInput] = useState('')
      const [chatMessages, setChatMessages] = useState([])
      const [chatBridgeState, setChatBridgeState] = useState('idle')
      const [chatBridgeError, setChatBridgeError] = useState('')
      const [editorCandidate, setEditorCandidate] = useState(null)
      const [chatRequest, setChatRequest] = useState(null)
      const [chatTask, setChatTask] = useState(null)
      const [chatUnread, setChatUnread] = useState(false)
      const [chatHistoryLimit, setChatHistoryLimit] = useState(24)
      const [chatHistoryLoading, setChatHistoryLoading] = useState(false)
      const [chatHistoryNotice, setChatHistoryNotice] = useState('')
      const [chatHistoryRevision, setChatHistoryRevision] = useState(0)
      const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
      const [tuningOpen, setTuningOpen] = useState(false)
      const chatRequestRef = useRef(null)
      const chatStreamRef = useRef(null)
      const chatInitialScrollRef = useRef(false)
      const chatPreserveScrollRef = useRef(null)
      const workshopPreviewRef = useRef(null)

      const mainContext = mainConversation.summary

      useEffect(() => {
        chatRequestRef.current = chatRequest
      }, [chatRequest])

      const failChatRequest = (requestId, message) => {
        if (chatRequestRef.current?.requestId !== requestId) return
        chatRequestRef.current = null
        setChatRequest(null)
        setChatBridgeState('fallback')
        setChatBridgeError(message)
        setChatMessages((messages) => [...messages, { role: 'assistant', text: `${message} 可以复制任务到主对话。` }])
      }

      useEffect(() => {
        if (!chatRequest) return
        if (chatRequest.transport === 'session' && mainConversation.sessionId !== chatRequest.sessionId) {
          failChatRequest(chatRequest.requestId, '当前主对话已切换，原请求已停止等待。')
          return
        }
        if (!mainConversation.snapshot) return
        const assistant = (mainConversation.snapshot.nodes || [])
          .filter((node) => node?.kind === 'assistant' && Number(node.seq) > chatRequest.baselineSeq)
          .map((node) => ({ node, text: textFromConversationNode(node).trim() }))
          .filter((item) => item.text)
          .at(-1)
        if (!assistant || mainConversation.snapshot.running || mainContext.pendingQuestion) return
        const candidate = extractMarkdownCandidate(assistant.text)
        setChatMessages((messages) => [...messages, { role: 'assistant', text: assistant.text }])
        if (candidate) setEditorCandidate(candidate)
        setChatBridgeState('connected')
        chatRequestRef.current = null
        setChatRequest(null)
      }, [chatRequest, mainConversation.snapshot, mainConversation.sessionId, mainContext.pendingQuestion])

      useEffect(() => {
        const onAssistantResponse = (event) => {
          const data = event.data?.type === 'dsh-resume:assistant-response' ? event.data : event.detail
          if (!data || data.type !== 'dsh-resume:assistant-response') return
          if (event.type === 'message' && event.source && event.source !== window) return
          if (event.origin && event.origin !== window.location.origin) return
          if (chatRequestRef.current?.requestId && data.requestId && data.requestId !== chatRequestRef.current.requestId) return
          if (chatRequestRef.current?.transport === 'session' && !data.requestId) return
          if (!chatRequestRef.current || !['pending'].includes(chatBridgeState)) return
          chatRequestRef.current = null
          setChatRequest(null)
          setChatBridgeState('connected')
          setChatBridgeError('')
          if (data.text) setChatMessages((messages) => [...messages, { role: 'assistant', text: String(data.text) }])
          if (typeof data.content === 'string' && data.content.trim()) {
            setEditorCandidate({ content: data.content, summary: data.summary || '收到一份可预览的 Markdown 修改建议。' })
          }
        }
        window.addEventListener('message', onAssistantResponse)
        window.addEventListener('dsh-resume:assistant-response', onAssistantResponse)
        return () => {
          window.removeEventListener('message', onAssistantResponse)
          window.removeEventListener('dsh-resume:assistant-response', onAssistantResponse)
        }
      }, [chatBridgeState])

      const openEditor = async () => {
        if (!selected) return
        setEditorBusy(true)
        setEditorMessage('正在读取 Markdown…')
        try {
          const res = await fetch(`/dsh-resume/api/editor/source?preview=${encodeURIComponent(selected)}`, { cache: 'no-store' })
          const source = await readJsonResponse(res, 'Markdown 编辑器')
          setEditorSource(source)
          setEditorDraft(source.content || '')
          editorDiskContentRef.current = source.content || ''
          setEditorExternalPending(false)
          setEditorSelection('')
          setEditorPreviewUrl('')
          setEditorOpen(true)
          setEditorChatOpen(false)
          setChatMessages([])
          setChatUnread(false)
          setChatHistoryLimit(24)
          chatInitialScrollRef.current = false
          chatPreserveScrollRef.current = null
          setChatBridgeState('idle')
          chatRequestRef.current = null
          setChatRequest(null)
          setChatTask(null)
          setChatBridgeError('')
          setEditorCandidate(null)
          setEditorMessage('修改左侧 Markdown，右侧会实时更新预览。')
        } catch (err) {
          setEditorMessage(`打开失败：${err?.message || err}`)
        } finally {
          setEditorBusy(false)
        }
      }

      useEffect(() => {
        if (view !== 'preview' || !selected || editorBusy || editorSource?.previewPath === selected) return
        void openEditor()
      }, [view, selected, editorSource?.previewPath, editorBusy])

      useEffect(() => {
        if (!editorOpen || !editorSource || !editorDraft.trim()) return undefined
        let active = true
        const timer = setTimeout(async () => {
          setEditorBusy(true)
          try {
            const res = await fetch('/dsh-resume/api/editor/preview', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                root: editorSource.root,
                resume: editorSource.resumePath,
                preview: editorSource.previewPath,
                templateId,
                content: editorDraft,
              }),
            })
            const result = await readJsonResponse(res, '实时预览')
            if (active) {
              const tuningQuery = new URLSearchParams(Object.entries({ ...layoutSettings, ...visualTokens }).map(([key, value]) => [key, String(value)]))
              setEditorPreviewUrl(`${result.previewUrl}&${tuningQuery.toString()}&t=${Date.now()}`)
              setEditorMessage('未保存草稿 · 右侧预览已更新')
            }
          } catch (err) {
            if (active) setEditorMessage(`预览失败：${err?.message || err}`)
          } finally {
            if (active) setEditorBusy(false)
          }
        }, 350)
        return () => {
          active = false
          clearTimeout(timer)
        }
      }, [editorOpen, editorSource, editorDraft, templateId, layoutSettings, visualTokens])

      const saveEditor = async () => {
        if (!editorSource || !editorDraft.trim()) return
        setEditorBusy(true)
        setEditorMessage('正在保存 Markdown…')
        try {
          const res = await fetch('/dsh-resume/api/editor/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ root: editorSource.root, resume: editorSource.resumePath, preview: editorSource.previewPath, templateId, content: editorDraft }),
          })
          const result = await readJsonResponse(res, '保存 Markdown')
          editorDiskContentRef.current = editorDraft
          setEditorExternalPending(false)
          setEditorMessage('已保存，并重新生成预览。')
          setTick((n) => n + 1)
          void reload()
          if (result.rendered?.previewPath) setSelected(result.rendered.previewPath)
        } catch (err) {
          setEditorMessage(`保存失败：${err?.message || err}`)
        } finally {
          setEditorBusy(false)
        }
      }

      const copyChatTask = async (message) => {
        const visualAudit = summarizeVisualAudit(layout)
        const context = [
          `请在 dsh-resume 中处理简历：${message}`,
          `简历文件：${editorSource?.resumePath || selected || 'resume.md'}`,
          '请先读取当前 Markdown，只修改真实内容，不编造经历。',
          layout ? `当前排版：${layout.pageCount || '?'} 页，留白 ${Math.round(Number(layout.pages?.[0]?.blankRatio || 0) * 100)}%，溢出 ${layout.overflow ? '是' : '否'}` : '当前排版指标尚未回传。',
          `视觉审计：${visualAudit.label}；${visualAudit.detail}${visualAudit.warnings.length ? `；提醒：${visualAudit.warnings.map((item) => item.message).join('、')}` : ''}`,
          '完成后调用 jobhunt_render 和 jobhunt_layout_metrics，并返回修改前后摘要。',
        ].join('\n')
        try {
          await navigator.clipboard.writeText(context)
          setChatBridgeState('fallback')
          setChatMessages((messages) => [...messages, { role: 'assistant', text: '当前环境没有主对话桥接监听，任务上下文已复制。请粘贴到主对话发送。' }])
        } catch {
          setChatMessages((messages) => [...messages, { role: 'assistant', text: context }])
        }
      }

      const stopChatWaiting = () => {
        if (!chatRequestRef.current) return
        chatRequestRef.current = null
        setChatRequest(null)
        setChatTask(null)
        setChatBridgeState('idle')
        setChatBridgeError('')
        setChatMessages((messages) => [...messages, { role: 'assistant', text: '已停止在插件内等待。主对话不会被取消，完成后仍会出现在任务流中。' }])
      }

      const sendChatMessage = () => {
        const message = chatInput.trim()
        if (!message) return
        if (chatBridgeState === 'pending' || mainContext.pending?.length) {
          setChatBridgeError('请先完成当前主对话的确认，再发送新的请求。')
          return
        }
        const requestId = `resume-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const payload = {
          requestId,
          message,
          context: {
            resumePath: editorSource?.resumePath || selected,
            previewPath: editorSource?.previewPath || selected,
            templateId,
            metrics: layout || null,
            selectedText: editorSelection || editorDraft,
            mainSessionId: mainConversation.sessionId,
            recentConversation: mainContext.messages,
            recentTaskFlow: mainContext.feed.slice(-24),
          },
        }
        setChatMessages((messages) => [...messages, { role: 'user', text: message }])
        setChatInput('')
        setChatBridgeState('pending')
        setChatBridgeError('')
        if (mainConversation.session?.prompt) {
          const baselineSeq = Math.max(...(mainConversation.snapshot?.nodes || []).map((node) => Number(node.seq) || 0), 0)
          const task = { requestId, sessionId: mainConversation.sessionId, baselineSeq, transport: 'session' }
          chatRequestRef.current = task
          setChatTask(task)
          setChatRequest(task)
          void mainConversation.session.prompt([{ type: 'text', text: buildResumePrompt(message, payload.context, mainContext) }], 'queue').then((result) => {
            if (result?.ok) return
            failChatRequest(requestId, `主对话未接受请求：${result?.error?.message || result?.error?.code || '未知原因'}`)
          }).catch((cause) => {
            failChatRequest(requestId, `主对话桥接失败：${String(cause?.message || cause)}`)
          })
          return
        }
        const bridgeMessage = { source: 'dsh-resume', type: 'dsh-resume:assistant-request', payload }
        const task = { requestId, sessionId: null, baselineSeq: 0, transport: 'event' }
        chatRequestRef.current = task
        setChatTask(task)
        setChatRequest(task)
        try {
          if (typeof window.__DSH_RESUME_BRIDGE__?.request === 'function') {
            void Promise.resolve(window.__DSH_RESUME_BRIDGE__.request(bridgeMessage)).catch((cause) => {
              failChatRequest(requestId, `桥接请求失败：${String(cause?.message || cause)}`)
            })
          }
          else window.postMessage(bridgeMessage, '*')
          window.dispatchEvent(new CustomEvent('dsh-resume:assistant-request', { detail: bridgeMessage }))
        } catch {
          chatRequestRef.current = null
          setChatRequest(null)
          void copyChatTask(message)
          return
        }
      }

      const reloadTemplates = useCallback(async (preferredId = '') => {
        try {
          const res = await fetch('/dsh-resume/api/templates', { cache: 'no-store' })
          if (!res.ok) throw new Error(`templates ${res.status}`)
          const data = await res.json()
          if (!Array.isArray(data.templates)) return
          setTemplates(data.templates)
          const preferred = data.templates.find((template) => template.id === preferredId)
          if (preferred) {
            setTemplateId(preferred.id)
            setLayoutSettings(layoutSettingsFromTemplate(preferred))
            setVisualTokens(visualTokensFromTemplate(preferred))
            setVisualHistory([])
            setLayoutHistory([])
            setFitState({ text: `已同步新模板：${preferred.name}`, state: 'pending' })
            setTemplateMessage(`主对话刚刚生成了「${preferred.name}」，已自动加载。`)
          }
        } catch {
          // Keep the last known template list when the preview server is restarting.
        }
      }, [])

      useEffect(() => {
        void reloadTemplates()
      }, [reloadTemplates])

      useEffect(() => {
        if (templatePickerOpen || view === 'templates' || view === 'workshop') void reloadTemplates()
      }, [reloadTemplates, templatePickerOpen, view])

      const previewActivity = useMemo(() => {
        const nodes = Array.isArray(mainConversation.snapshot?.nodes) ? mainConversation.snapshot.nodes : []
        return nodes.map((node) => {
          const tool = toolDescriptor(node)
          const text = textFromConversationNode(node)
          return {
            signature: `${Number(node?.seq) || 0}:${tool.name}:${text.slice(0, 800)}`,
            toolName: tool.name,
            text,
            previewPath: previewPathFromNode(node),
          }
        }).filter((item) => {
          const activity = `${item.toolName} ${item.text}`
          return /jobhunt_(render|template_(save|validate|copy|restore))/i.test(activity)
            || /jobhunt_write/i.test(activity) && /templates[\\/]|resume\.md|preview\.html/i.test(activity)
        }).at(-1) || null
      }, [mainConversation.snapshot])
      const handledPreviewActivity = useRef('')

      useEffect(() => {
        if (!previewActivity?.signature) return
        if (!handledPreviewActivity.current) {
          handledPreviewActivity.current = previewActivity.signature
          return
        }
        if (handledPreviewActivity.current === previewActivity.signature) return
        handledPreviewActivity.current = previewActivity.signature
        const preferredId = templateIdFromText(previewActivity.text)
        const nextPreviewPath = previewActivity.previewPath || previewPathFromText(previewActivity.text)
        const canReadLatestEditorSource = Boolean(nextPreviewPath && editorSource?.previewPath === nextPreviewPath && editorDraft === editorDiskContentRef.current)
        setLayout(null)
        setFitState({ text: '检测到新的预览，正在刷新 A4 和排版指标…', state: 'pending' })
        if (nextPreviewPath) {
          setSelected(nextPreviewPath)
          setView('preview')
          if (editorSource?.previewPath === nextPreviewPath) {
            if (editorDraft === editorDiskContentRef.current) {
              fetch(`/dsh-resume/api/editor/source?preview=${encodeURIComponent(nextPreviewPath)}`, { cache: 'no-store' })
                .then((response) => readJsonResponse(response, '刷新 Markdown'))
                .then((source) => {
                  editorDiskContentRef.current = source.content || ''
                  setEditorSource(source)
                  setEditorDraft(source.content || '')
                  setEditorPreviewUrl('')
                  setEditorExternalPending(false)
                  setEditorMessage('主对话已落盘，正在加载最新 Markdown 和预览。')
                })
                .catch(() => {})
            } else {
              setEditorExternalPending(true)
              setEditorMessage('主对话已生成新预览；当前未保存草稿未被覆盖，请保存或重新打开后读取最新文件。')
            }
          }
        }
        if (!canReadLatestEditorSource) {
          setEditorPreviewUrl((url) => url ? `${url}${url.includes('?') ? '&' : '?'}refresh=${Date.now()}` : url)
        }
        setTick((value) => value + 1)
        void reload()
        const timer = setTimeout(() => { void reloadTemplates(preferredId) }, 250)
        return () => clearTimeout(timer)
      }, [reload, reloadTemplates, previewActivity?.signature])

      useEffect(() => {
        const onLayoutMessage = (event) => {
          if (event.data?.source !== 'dsh-resume-preview') return
          const metrics = event.data.metrics || null
          if (metrics) {
            const metricPreview = String(event.data.previewPath || selected || '').replace(/\\/g, '/')
            if (selected && metricPreview && metricPreview !== selected.replace(/\\/g, '/')) return
            setLayout(metrics)
            const visualAudit = summarizeVisualAudit(metrics)
            setFitState({
              text: metrics.overflow
                ? `内容超出页面：${metrics.pageCount} 页`
                : metrics.sparse
                  ? `一页但留白偏多：约 ${Math.round((metrics.pages?.[0]?.blankRatio || 0) * 100)}% 空白`
                  : visualAudit.state === 'needs-review'
                    ? `建议复核：${visualAudit.warnings[0]?.message || '页面平衡度需要确认'}`
                  : metrics.pageCount === 1
                    ? '一页通过：版面密度合适'
                    : `排版完成：${metrics.pageCount} 页`,
              state: metrics.overflow ? 'overflow' : metrics.sparse ? 'sparse' : visualAudit.state === 'needs-review' ? 'review' : metrics.pageCount === 1 ? 'fit' : 'multi',
            })
            void fetch('/dsh-resume/api/metrics', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ previewPath: metricPreview, metrics }),
            }).catch(() => {})
          }
        }
        window.addEventListener('message', onLayoutMessage)
        return () => window.removeEventListener('message', onLayoutMessage)
      }, [selected])

      useEffect(() => {
        if (!selected && status?.previewRel) setSelected(status.previewRel)
        if (!selected && status?.previews?.length) setSelected(status.previews[0])
      }, [status, selected])

      useEffect(() => {
        if (!status || hasResolvedInitialView) return
        setView(status.previewRel || status.previews?.length ? 'preview' : 'start')
        setHasResolvedInitialView(true)
      }, [status, hasResolvedInitialView])

      const previewSrc = useMemo(() => {
        if (!selected) return null
        const params = new URLSearchParams({ path: selected, t: String(tick), template: templateId })
        for (const [key, value] of Object.entries({ ...layoutSettings, ...visualTokens })) params.set(key, String(value))
        return `/dsh-resume/preview?${params.toString()}`
      }, [selected, tick, layoutSettings, visualTokens, templateId])

      useEffect(() => {
        const frame = workshopPreviewRef.current
        if (!frame?.contentWindow) return
        frame.contentWindow.postMessage({ source: 'dsh-resume-token-preview', tokens: visualTokens }, '*')
      }, [visualTokens])

      const onRefresh = () => {
        setFitState({ text: '正在重新检查', state: 'pending' })
        setLayout(null)
        setTick((n) => n + 1)
        if (editorPreviewUrl) setEditorPreviewUrl(`${editorPreviewUrl}${editorPreviewUrl.includes('?') ? '&' : '?'}refresh=${Date.now()}`)
        void reload()
      }

      const reloadEditorFromDisk = async () => {
        if (!editorSource?.previewPath) return
        setEditorBusy(true)
        try {
          const res = await fetch(`/dsh-resume/api/editor/source?preview=${encodeURIComponent(editorSource.previewPath)}`, { cache: 'no-store' })
          const source = await readJsonResponse(res, '刷新 Markdown')
          editorDiskContentRef.current = source.content || ''
          setEditorSource(source)
          setEditorDraft(source.content || '')
          setEditorPreviewUrl('')
          setEditorExternalPending(false)
          setEditorMessage('已读取磁盘上的最新 Markdown，正在刷新预览。')
        } catch (err) {
          setEditorMessage(`读取最新文件失败：${err?.message || err}`)
        } finally {
          setEditorBusy(false)
        }
      }

      const startWorkspace = async (mode) => {
        setStartupMode(mode)
        setStartupError(false)
        setStartupMessage(mode === 'demo' ? '正在准备示例简历…' : '正在创建你的简历工作区…')
        try {
          const res = await fetch('/dsh-resume/api/onboarding', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode }),
          })
          const result = await readJsonResponse(res, '工作区初始化')
          if (result.rendered?.previewPath) setSelected(result.rendered.previewPath)
          setStartupMessage('')
          setView('preview')
          setTick((n) => n + 1)
          void reload()
        } catch (err) {
          setStartupError(true)
          setStartupMessage(`初始化失败：${err?.message || err}`)
        }
      }

      const onTemplateChange = (value) => {
        if (value !== templateId) setTemplateHistory((history) => [...history, templateId].slice(-20))
        const nextTemplate = templateOptions.find((template) => template.id === value)
        setTemplateId(value)
        setLayoutSettings(layoutSettingsFromTemplate(nextTemplate))
        setVisualTokens(visualTokensFromTemplate(nextTemplate))
        setVisualHistory([])
        setLayoutHistory([])
        setTemplatePickerOpen(false)
        setTuningOpen(false)
        setFitState({ text: '正在应用模板', state: 'pending' })
        setLayout(null)
        setTemplateMessage('')
      }

      const undoTemplateChoice = () => {
        if (!templateHistory.length) return
        const previous = templateHistory[templateHistory.length - 1]
        setTemplateHistory((history) => history.slice(0, -1))
        setTemplateId(previous)
        const previousTemplate = templateOptions.find((template) => template.id === previous)
        setLayoutSettings(layoutSettingsFromTemplate(previousTemplate))
        setVisualTokens(visualTokensFromTemplate(previousTemplate))
        setVisualHistory([])
        setLayoutHistory([])
        setTemplateMessage('已撤销模板切换')
        setLayout(null)
      }

      const updateVisualToken = (key, value) => {
        setVisualHistory((history) => [...history, visualTokens].slice(-20))
        setVisualTokens((tokens) => ({ ...tokens, [key]: value }))
        setLayout(null)
        setFitState({ text: '视觉调整中，正在重新测量 A4…', state: 'pending' })
      }

      const undoVisualToken = () => {
        if (!visualHistory.length) return
        setVisualTokens(visualHistory[visualHistory.length - 1])
        setVisualHistory((history) => history.slice(0, -1))
        setLayout(null)
      }

      const resetVisualTokens = () => {
        setVisualHistory((history) => [...history, visualTokens].slice(-20))
        setVisualTokens(visualTokensFromTemplate(selectedTemplate))
        setLayout(null)
      }

      const toggleTemplateCompare = (id) => {
        setTemplateCompareIds((ids) => ids.includes(id)
          ? ids.filter((item) => item !== id)
          : ids.length >= 3 ? [...ids.slice(1), id] : [...ids, id])
      }

      const saveVisualVariant = async () => {
        if (!selectedTemplate) return
        const defaultId = `${selectedTemplate.id}-custom`.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        const newId = window.prompt('为这套视觉调整设置一个新模板 ID（小写英文和短横线）', defaultId)
        if (!newId) return
        const templateJson = JSON.stringify({
          ...selectedTemplate,
          id: newId,
          name: `${selectedTemplate.name || '模板'} · 定制`,
          visual: { ...(selectedTemplate.visual || {}), ...visualTokens },
        })
        setTemplateMessage('正在校验并保存视觉变体…')
        try {
          const res = await fetch('/dsh-resume/api/templates/actions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'save', templateJson }),
          })
          const result = await res.json()
          if (!res.ok || !result.saved) throw new Error(result.error || result.errors?.join('；') || '保存视觉变体失败')
          await reloadTemplates(result.template.id)
          setTemplateMessage(`已保存「${result.template.name}」，可在模板库继续对比。`)
        } catch (err) {
          setTemplateMessage(`保存失败：${err?.message || err}`)
        }
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
        try {
          const res = await fetch(previewSrc, { cache: 'no-store' })
          if (!res.ok) throw new Error(`预览读取失败（${res.status}）`)
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
          setEditorMessage('HTML 已下载。')
        } catch (err) {
          setEditorMessage(`HTML 下载失败：${err?.message || err}`)
        }
      }

      const onPrint = () => {
        if (!previewSrc) return
        const w = window.open(previewSrc, '_blank')
        if (!w) {
          setEditorMessage('PDF 导出窗口被浏览器拦截，请允许弹窗后重试。')
          return
        }
        const timer = setInterval(() => {
          try {
            if (w.closed) {
              clearInterval(timer)
              return
            }
            if (w.document && w.document.readyState === 'complete') {
              clearInterval(timer)
              w.focus()
              w.print()
            }
          } catch {
            clearInterval(timer)
            setEditorMessage('PDF 导出失败，请直接打开预览页后使用浏览器打印。')
          }
        }, 200)
      }

      const onFrameLoad = (event) => {
        try {
          event.currentTarget.contentWindow?.scrollTo(0, 0)
        } catch {
          setFitState({ text: '已加载预览', state: 'pending' })
        }
      }

      const previewOptions = status?.previews?.length
        ? status.previews.map((p) => React.createElement('option', { key: p, value: p }, p))
        : [React.createElement('option', { key: 'empty', value: '' }, loading ? '加载中…' : '暂无 preview.html')]
      const fitLabel = fitState.state === 'overflow' ? '版式需调整' : fitState.state === 'sparse' ? '一页但偏空' : fitState.state === 'multi' ? '多页' : fitState.state === 'fit' ? '一页通过' : '检查中'
      const measuredBlank = Number(layout?.pages?.[0]?.blankRatio)
      const pageSummary = layout?.pageCount
        ? `${layout.pageCount} 页${layout.overflow ? ' · 有溢出' : Number.isFinite(measuredBlank) ? ` · 留白 ${Math.round(measuredBlank * 100)}%` : ''}`
        : '正在测量'
      const statusButtonLabel = Number.isFinite(measuredBlank)
        ? `留白 ${Math.round(measuredBlank * 100)}%`
        : fitState.state === 'overflow' ? '有溢出' : fitState.state === 'multi' ? '多页' : '测量中'
      const statusButtonMeta = layout?.pageCount ? `${layout.pageCount} 页` : '排版指标'
      const templateThumbnail = (template, compare = false) => {
        const src = selected
          ? `/dsh-resume/preview?${new URLSearchParams({ path: selected, t: String(tick), template: template.id, thumbnail: '1' }).toString()}`
          : ''
        const paperClass = `cj-templatePaper cj-templatePaper-${template.visual?.variant || 'standard'}${template.layout?.mode === 'two-column' ? ' cj-templatePaper-two-column' : ''}`
        if (!src) return React.createElement('div', { className: paperClass, style: { '--thumb-accent': template.visual?.accentColor || '#3559a8', '--thumb-bg': template.visual?.backgroundColor || '#fff' } }, React.createElement('div', { className: 'cj-thumbTop' }), React.createElement('div', { className: 'cj-thumbRule' }), React.createElement('div', { className: 'cj-thumbSection' }), React.createElement('div', { className: 'cj-thumbLines' }))
        return React.createElement('div', { className: 'cj-templateThumb', 'data-loading': 'true', 'data-compare': compare ? 'true' : 'false' }, React.createElement('iframe', { title: `${template.name}真实预览缩略图`, src, loading: 'lazy', onLoad: (event) => { event.currentTarget.parentElement?.setAttribute('data-loading', 'false') } }))
      }
      const navItems = [
        ['start', '⌂', '开始'],
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
          'div',
          { key: template.id, className: 'cj-templateCard', 'data-active': template.id === templateId ? 'true' : 'false', 'data-compared': templateCompareIds.includes(template.id) ? 'true' : 'false', role: 'button', tabIndex: 0, onClick: () => onTemplateChange(template.id), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTemplateChange(template.id) } }, 'aria-label': `选择模板：${template.name}` },
          templateThumbnail(template),
          React.createElement('div', { className: 'cj-templateCardFooter' }, React.createElement('div', { className: 'cj-templateName' }, template.name), React.createElement('button', { type: 'button', className: 'cj-compareButton', 'data-active': templateCompareIds.includes(template.id) ? 'true' : 'false', onClick: (event) => { event.stopPropagation(); toggleTemplateCompare(template.id) } }, templateCompareIds.includes(template.id) ? '已加入' : '＋对比')),
          React.createElement('div', { className: 'cj-templateTags' }, [rendererLabel(template.renderer), template.layout?.mode === 'two-column' ? '双栏' : '单栏', ...(template.tags || []).filter((tag) => tag !== '单栏' && tag !== '双栏')].slice(0, 3).join(' · ')),
          React.createElement('div', { className: 'cj-templateDescription' }, template.description || '原创视觉预设，适合投递版简历。'),
        )),
      )
      const startView = React.createElement(
        'div',
        { className: 'cj-startView' },
        React.createElement('section', { className: 'cj-startCard' },
          React.createElement('div', { className: 'cj-startEyebrow' }, 'DSH RESUME WORKBENCH'),
          React.createElement('div', { className: 'cj-startTitle' }, '开始制作你的投递版简历'),
          React.createElement('div', { className: 'cj-startCopy' }, '不用先学习 Markdown、模板或排版规则。选择一个入口，插件会准备工作区、示例模板和 A4 预览。'),
          React.createElement('div', { className: 'cj-startActions' },
            React.createElement('button', { type: 'button', className: 'cj-startOption', onClick: () => startWorkspace('existing') }, React.createElement('div', { className: 'cj-startOptionTitle' }, '我已有简历'), React.createElement('div', { className: 'cj-startOptionCopy' }, '先创建工作区，再把已有内容交给 DeepSeek 优化。')),
            React.createElement('button', { type: 'button', className: 'cj-startOption', onClick: () => startWorkspace('blank') }, React.createElement('div', { className: 'cj-startOptionTitle' }, '从零开始'), React.createElement('div', { className: 'cj-startOptionCopy' }, '生成一份空白结构，逐步填写教育、技能和项目经历。')),
            React.createElement('button', { type: 'button', className: 'cj-startOption', 'data-recommended': 'true', onClick: () => startWorkspace('demo') }, React.createElement('div', { className: 'cj-startOptionBadge' }, '推荐第一次使用'), React.createElement('div', { className: 'cj-startOptionTitle' }, '先看看示例'), React.createElement('div', { className: 'cj-startOptionCopy' }, '先看一份完整 A4 简历，再替换成你的真实经历。')),
          ),
          startupMessage ? React.createElement('div', { className: 'cj-startStatus', 'data-state': startupError ? 'error' : 'pending' }, React.createElement('span', null, startupMessage), startupError ? React.createElement('button', { type: 'button', className: 'cj-startRetry', onClick: () => startWorkspace(startupMode) }, '重试') : null) : null,
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
      const comparedTemplates = templateCompareIds.map((id) => templateOptions.find((template) => template.id === id)).filter(Boolean)
      const templateCompareView = comparedTemplates.length >= 2
        ? React.createElement(
            'section',
            { className: 'cj-comparePanel', 'aria-label': '模板对比' },
            React.createElement('div', { className: 'cj-compareHead' }, React.createElement('div', null, React.createElement('strong', null, '候选对比'), React.createElement('span', null, '最多选择 3 个方向，先看差异再应用')), React.createElement('button', { type: 'button', className: 'cj-templatePickerClose', onClick: () => setTemplateCompareIds([]) }, '清空')),
            React.createElement('div', { className: 'cj-compareGrid' }, ...comparedTemplates.map((template) => React.createElement(
              'article',
              { className: 'cj-compareCard', key: template.id },
              React.createElement('div', { className: 'cj-comparePreview' }, templateThumbnail(template, true)),
              React.createElement('strong', null, template.name),
               React.createElement('span', null, `${rendererLabel(template.renderer)} · ${template.layout?.density || '标准'} · ${template.visual?.variant || '标准'}`),
              React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: () => { onTemplateChange(template.id); setView('preview') } }, template.id === templateId ? '正在使用' : '应用此模板'),
            )))
          )
        : null
      const tokenControl = (key, label, type = 'color') => React.createElement(
        'label',
        { className: 'cj-tokenControl', key },
        React.createElement('span', null, label),
        type === 'color'
          ? React.createElement('input', { type: 'color', value: visualTokens[key], onChange: (event) => updateVisualToken(key, event.target.value), 'aria-label': label })
          : React.createElement('strong', null, `${visualTokens[key]}px`),
        type === 'range' ? React.createElement('input', { type: 'range', min: 0, max: 16, step: 1, value: visualTokens[key], onChange: (event) => updateVisualToken(key, Number(event.target.value)), 'aria-label': label }) : null,
      )
      const visualTokenPanel = React.createElement(
        'section',
        { className: 'cj-tokenPanel', 'aria-label': '视觉 Token 面板' },
        React.createElement('div', { className: 'cj-tokenPanelHead' }, React.createElement('div', null, React.createElement('strong', null, '视觉 Token'), React.createElement('span', null, '只影响当前预览，实时生效')), React.createElement('button', { type: 'button', className: 'cj-templatePickerClose', onClick: resetVisualTokens }, '恢复模板默认')),
        React.createElement('div', { className: 'cj-tokenGrid' }, tokenControl('accentColor', '强调色'), tokenControl('backgroundColor', '页面底色'), tokenControl('textColor', '正文色'), tokenControl('mutedColor', '辅助色'), tokenControl('cornerRadius', '圆角', 'range')),
        React.createElement('label', { className: 'cj-tokenSelect' }, React.createElement('span', null, '分隔线'), React.createElement('select', { value: visualTokens.divider, onChange: (event) => updateVisualToken('divider', event.target.value) }, React.createElement('option', { value: 'solid' }, '实线'), React.createElement('option', { value: 'dashed' }, '虚线'), React.createElement('option', { value: 'none' }, '不显示'))),
        React.createElement('div', { className: 'cj-tokenActions' }, React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: undoVisualToken, disabled: !visualHistory.length }, '撤销调整'), React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: saveVisualVariant }, '另存为模板')),
      )
      const templateWorkshop = React.createElement(
        'div',
        { className: 'cj-workshop' },
        React.createElement('div', { className: 'cj-workshopTitle' }, '生成或维护模板'),
        React.createElement('div', { className: 'cj-workshopHint' }, '模板工坊负责生成、对比和维护视觉方案。先看候选差异，再用 Token 面板微调，最后确认是否另存为模板。'),
        React.createElement('div', { className: 'cj-workshopFlow' },
          React.createElement('div', { className: 'cj-workshopStep' }, React.createElement('span', null, '1'), React.createElement('strong', null, '确定视觉方向'), React.createElement('small', null, '单栏、双栏、黑白或强调色。')),
          React.createElement('div', { className: 'cj-workshopStep' }, React.createElement('span', null, '2'), React.createElement('strong', null, '让 DeepSeek 生成'), React.createElement('small', null, '输出 dsh-resume TemplateSpec JSON。')),
          React.createElement('div', { className: 'cj-workshopStep' }, React.createElement('span', null, '3'), React.createElement('strong', null, '保存并去预览'), React.createElement('small', null, '保存版本，再用 A4 结果确认。')),
        ),
        React.createElement('div', { className: 'cj-workshopCurrent' }, React.createElement('div', { className: 'cj-workshopMiniPaper', 'data-variant': selectedTemplate?.visual?.variant || 'standard' }), React.createElement('span', null, '当前模板'), React.createElement('strong', null, selectedTemplate?.name || '校招标准'), React.createElement('span', null, selectedTemplate?.layout?.mode === 'two-column' ? '双栏' : '单栏')),
        visualTokenPanel,
        React.createElement('div', { className: 'cj-workshopPrompt' }, '推荐提示：生成一个适合前端实习投递的黑白高密度一页模板，保留项目成果指标，并输出符合 dsh-resume TemplateSpec 的 JSON。'),
        React.createElement('div', { className: 'cj-workshopActions' },
          React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: copySelectedTemplate }, '复制当前模板'),
          React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: () => setView('templates') }, '回到模板库'),
        ),
        React.createElement('details', { className: 'cj-advanced', open: Boolean(templateDraft) },
          React.createElement('summary', null, '高级：编辑 TemplateSpec JSON'),
          React.createElement('div', { className: 'cj-workshopHint' }, '把 DeepSeek 输出的 JSON 粘贴到这里。保存前会自动校验，模型不直接写 CSS。'),
          React.createElement('textarea', { className: 'cj-templateJson', value: templateDraft, onChange: (event) => setTemplateDraft(event.target.value), spellCheck: false, 'aria-label': '模板 JSON' }),
          React.createElement('div', { className: 'cj-workshopActions' },
            React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: saveTemplateDraft }, '保存 AI 模板'),
            React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: undoTemplateChoice, disabled: !templateHistory.length }, '撤销切换'),
            React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: restoreLatestTemplate, disabled: !templateVersions.length }, '恢复上一版本'),
          ),
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
          React.createElement('p', null, '点击卡片会切换当前候选；点“＋对比”可以同时比较最多 3 个方向。确认后再进入 A4 预览。'),
          templateGallery,
          templateCompareView,
          React.createElement('div', { className: 'cj-workshopActions' }, React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: () => setView('preview') }, '应用并查看预览')),
        ),
      )
      const workshopView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '模板工坊'), React.createElement('div', { className: 'cj-mainHint' }, '生成、保存、复制和恢复视觉模板。'))),
        React.createElement('div', { className: 'cj-workshopLayout' }, React.createElement('div', { className: 'cj-guide cj-workshopColumn' }, templateWorkshop), React.createElement('section', { className: 'cj-workshopPreview' }, React.createElement('div', { className: 'cj-workshopPreviewHead' }, React.createElement('strong', null, '实时 A4 预览'), React.createElement('span', null, previewSrc ? 'Token 调整会立即刷新' : '先创建或选择一份投递版')), React.createElement('div', { className: 'cj-workshopPreviewFrame' }, previewSrc ? React.createElement('iframe', { ref: workshopPreviewRef, title: '模板工坊实时 A4 预览', src: previewSrc, onLoad: (event) => { onFrameLoad(event); event.currentTarget.contentWindow?.postMessage({ source: 'dsh-resume-token-preview', tokens: visualTokens }, '*') } }) : React.createElement('div', { className: 'cj-empty' }, '选择一份投递版后，这里会显示真实内容。')))),
      )
      const guideView = React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: 'cj-mainBar' }, React.createElement('div', null, React.createElement('div', { className: 'cj-mainHeading' }, '排版检查'), React.createElement('div', { className: 'cj-mainHint' }, '帮助你判断这份简历是否适合直接投递。'))),
        React.createElement(
          'div',
          { className: 'cj-guide' },
          (() => {
            const visualAudit = summarizeVisualAudit(layout)
            return React.createElement('section', { className: 'cj-visualAudit', 'data-state': visualAudit.state },
              React.createElement('div', { className: 'cj-visualAuditHead' }, React.createElement('div', null, React.createElement('span', { className: 'cj-sectionEyebrow' }, '视觉复核'), React.createElement('h3', null, '这页是否真的“刚好”？')), React.createElement('strong', { className: 'cj-visualAuditBadge' }, visualAudit.label)),
              React.createElement('p', { className: 'cj-visualAuditMeta' }, visualAudit.detail),
              visualAudit.warnings.length
                ? React.createElement('div', { className: 'cj-visualAuditWarnings' }, ...visualAudit.warnings.map((item) => React.createElement('div', { key: item.code }, '· ', item.message)))
                : React.createElement('div', { className: 'cj-visualAuditOkay' }, visualAudit.state === 'balanced' ? '当前没有发现明显的顶部、底部或模块断裂问题。' : '打开投递版预览后，这里会根据真实 A4 页面更新。'),
              React.createElement('div', { className: 'cj-visualAuditHint' }, '你可以直接对 AI 说“让这一页更饱满，但不要缩小字号”，它会读取这组指标后再调整。'),
            )
          })(),
          React.createElement('h3', null, '一页简历检查清单'),
          React.createElement('p', null, qualityLoading ? '正在读取当前投递版并检查…' : quality ? `当前评分 ${quality.score}/100。${quality.next}` : '内容不足时补充真实证据，内容过多时先删重复信息，不用用极小字号硬塞。'),
          ...(quality?.checks || [
            { id: 'identity', status: 'info', message: '等待选择投递版后开始检查' },
            { id: 'evidence', status: 'info', message: '检查会在本地完成，不上传简历内容' },
          ]).map((item, index) => React.createElement('div', { className: 'cj-guideRow', key: item.id }, React.createElement('span', { className: `cj-qualityStatus cj-quality-${item.status}` }, item.status === 'pass' ? '✓' : item.status === 'error' ? '!' : item.status === 'warn' ? '!' : '·'), React.createElement('span', null, React.createElement('strong', null, String(index + 1).padStart(2, '0') + '　' + item.message), item.detail ? React.createElement('small', null, item.detail) : null))),
        ),
      )
      const tuningPanel = React.createElement(
        'div',
        { className: 'cj-tuningPopover', 'aria-label': '手动调整' },
        React.createElement('div', { className: 'cj-tuningPopoverHead' }, React.createElement('strong', null, '手动调整'), React.createElement('button', { type: 'button', className: 'cj-templatePickerClose', onClick: () => setTuningOpen(false) }, '收起')),
        ...[
          ['fontSize', '字号', (value) => `${value}px`, 11, 18, 0.5],
          ['lineHeight', '行高', (value) => value.toFixed(2), 1.2, 2, 0.05],
          ['sectionGap', '间距', (value) => `${value}px`, 6, 30, 1],
          ['pageMargin', '边距', (value) => `${value}px`, 24, 72, 2],
        ].map(([key, label, format, min, max, step]) => React.createElement(
          'label',
          { className: 'cj-inlineControl', key },
          React.createElement('span', null, label),
          React.createElement('strong', null, format(layoutSettings[key])),
          React.createElement('input', { type: 'range', min, max, step, value: layoutSettings[key], onChange: (event) => updateLayoutSetting(key, Number(event.target.value)), 'aria-label': `${label} ${format(layoutSettings[key])}` }),
        )),
        React.createElement('button', { type: 'button', className: 'cj-inlineReset', onClick: undoLayout, disabled: !layoutHistory.length, title: '撤销上一次调整' }, '↶'),
        React.createElement('button', { type: 'button', className: 'cj-inlineReset', onClick: resetLayoutSettings, title: '恢复默认排版' }, '默认'),
      )

      const lastUserPrompt = [...chatMessages].reverse().find((item) => item.role === 'user')?.text || ''
      const baseFeed = Array.isArray(mainContext.feed) ? mainContext.feed : []
      const visibleFeed = baseFeed.slice(-chatHistoryLimit)
      const hasEarlierFeed = mainContext.hasMore || baseFeed.length > chatHistoryLimit
      const feedItems = mainContext.pendingQuestion && !visibleFeed.some((item) => item.type === 'question')
        ? [...visibleFeed, { seq: 'pending-question', type: 'question', label: 'Question', target: mainContext.pendingQuestion.payload?.questions?.[0]?.question || '等待用户确认', summary: '', status: 'waiting', role: 'event' }]
        : visibleFeed
      const chatMessagesView = (!mainConversation.session || chatBridgeState === 'fallback') && chatMessages.length
        ? chatMessages.map((item, index) => React.createElement('div', { className: 'cj-chatMessage', 'data-role': item.role, key: `${item.role}-${index}` }, React.createElement('strong', null, item.role === 'user' ? '你' : '主对话'), React.createElement(AssistantExpandableContent, { text: item.text, markdown: item.role === 'assistant' })))
        : (!feedItems.length ? React.createElement('div', { className: 'cj-chatEmpty' }, '只在需要时打开 AI。它会拿到当前 Markdown、模板和排版指标。') : null)
      const latestFeedItem = feedItems.at(-1)
      const mainContextMessage = latestFeedItem
        ? `${latestFeedItem.label || (latestFeedItem.role === 'assistant' ? 'Assistant' : '消息')} 已同步，完整内容见下方任务流。`
        : ''
      const mainContextState = mainConversation.session ? (mainContext.running ? 'pending' : 'connected') : 'idle'
      const mainContextLabel = mainConversation.session ? (mainContext.running ? '主对话处理中' : '已同步主对话') : '未找到当前主对话'
      const loadEarlier = async () => {
        const stream = chatStreamRef.current
        if (stream) {
          chatPreserveScrollRef.current = { top: stream.scrollTop, height: stream.scrollHeight }
        }
        setChatHistoryNotice('')
        const session = mainConversation.session
        if (typeof session?.loadOlder === 'function' && mainContext.hasMore) {
          setChatHistoryLoading(true)
          const beforeCount = session.getSnapshot?.()?.nodes?.length ?? baseFeed.length
          try {
            await session.loadOlder()
            setChatHistoryRevision((value) => value + 1)
            setChatHistoryLimit((value) => Math.max(value, 48))
            const afterSnapshot = session.getSnapshot?.()
            if ((afterSnapshot?.nodes?.length ?? baseFeed.length) === beforeCount && afterSnapshot?.hasMore === false) {
              setChatHistoryNotice('已经到达最早的主对话记录。')
            }
          } catch (error) {
            setChatHistoryNotice(`更早记录加载失败：${String(error?.message || error)}`)
            chatPreserveScrollRef.current = null
          } finally {
            setChatHistoryLoading(false)
          }
          return
        }
        if (baseFeed.length > chatHistoryLimit) {
          setChatHistoryLimit((value) => value + 24)
          return
        }
        setChatHistoryNotice('当前主对话没有更多可加载的历史记录。')
      }
      const scrollChatToBottom = () => {
        const align = () => {
          const stream = chatStreamRef.current
          if (stream) stream.scrollTop = stream.scrollHeight
        }
        align()
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            align()
            requestAnimationFrame(align)
          })
        } else {
          setTimeout(align, 0)
        }
      }
      useEffect(() => {
        chatInitialScrollRef.current = false
        chatPreserveScrollRef.current = null
        setChatHistoryLimit(24)
        setChatHistoryNotice('')
        setChatHistoryLoading(false)
        setChatHistoryRevision(0)
      }, [mainConversation.sessionId])
      useEffect(() => {
        const stream = chatStreamRef.current
        const preserve = chatPreserveScrollRef.current
        if (!stream || !preserve) return
        stream.scrollTop = preserve.top + (stream.scrollHeight - preserve.height)
        requestAnimationFrame(() => {
          const current = chatStreamRef.current
          if (current) current.scrollTop = preserve.top + (current.scrollHeight - preserve.height)
        })
        chatPreserveScrollRef.current = null
        setChatUnread(false)
      }, [chatHistoryLimit, chatHistoryRevision])
      useEffect(() => {
        const stream = chatStreamRef.current
        if (!stream) return
        if (!chatInitialScrollRef.current && (feedItems.length || chatMessages.length)) {
          scrollChatToBottom()
          chatInitialScrollRef.current = true
          setChatUnread(false)
          return
        }
        if (!chatInitialScrollRef.current) return
        const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 90
        if (nearBottom || !chatMessages.length) {
          scrollChatToBottom()
          setChatUnread(false)
        } else {
          setChatUnread(true)
        }
      }, [editorChatOpen, chatMessages.length, feedItems.length, mainContext.running, chatHistoryLimit])
      const onChatStreamScroll = (event) => {
        const stream = event.currentTarget
        if (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 90) setChatUnread(false)
      }
      const editorChatView = React.createElement(
        'aside',
        { className: 'cj-editorChat', 'aria-label': '简历 AI 助手' },
        React.createElement('div', { className: 'cj-editorChatHead' }, React.createElement('div', { className: 'cj-editorChatTitle' }, 'AI 助手'), React.createElement('div', { className: 'cj-editorChatHint' }, '镜像当前主对话，Think、Tool call、Read、Edit 会按真实顺序出现。')),
        React.createElement('div', { className: 'cj-chatContext', 'data-state': mainContextState }, React.createElement('strong', null, mainContextLabel), React.createElement('span', { className: 'cj-chatContextText' }, mainContextMessage || (mainConversation.sessionId ? `Session ${mainConversation.sessionId}` : '打开主对话后，AI 会自动同步上下文。'))),
        React.createElement('div', { className: 'cj-chatMessages', ref: chatStreamRef, onScroll: onChatStreamScroll }, hasEarlierFeed ? React.createElement('button', { type: 'button', className: 'cj-chatLoadEarlier', onClick: loadEarlier, disabled: chatHistoryLoading }, chatHistoryLoading ? '正在加载更早…' : '加载更早') : null, chatHistoryNotice ? React.createElement('div', { className: 'cj-chatHistoryNotice' }, chatHistoryNotice) : null, React.createElement(AssistantFeed, { items: feedItems }), chatMessagesView, editorCandidate ? React.createElement('div', { className: 'cj-chatMessage' }, React.createElement('strong', null, '可应用修改'), React.createElement(AssistantMarkdown, { text: editorCandidate.summary }), React.createElement('button', { type: 'button', className: 'cj-chatApply', onClick: () => { setEditorDraft(editorCandidate.content); setEditorCandidate(null); setEditorMessage('已把 AI 修改放入草稿，确认后再保存。') } }, '应用到编辑器')) : null, chatUnread ? React.createElement('button', { type: 'button', className: 'cj-chatUnread', onClick: () => { scrollChatToBottom(); setChatUnread(false) } }, '↓ 有新进度，回到底部') : null),
        mainContext.pendingQuestion ? React.createElement(AssistantQuestionCard, { pending: mainContext.pendingQuestion }) : null,
        React.createElement('div', { className: 'cj-chatComposer' },
          React.createElement('textarea', { className: 'cj-chatInput', value: chatInput, onChange: (event) => setChatInput(event.target.value), placeholder: '例如：把项目经历压缩两行，保留技术成果', 'aria-label': '发送给简历 AI 助手' }),
          React.createElement('div', { className: 'cj-chatQuick' },
            ...['压缩两行', '让这一页更饱满', '减少底部留白', '改得更专业', '匹配前端岗位'].map((prompt) => React.createElement('button', { key: prompt, type: 'button', onClick: () => setChatInput(prompt) }, prompt)),
          ),
          React.createElement('div', { className: 'cj-chatActions' }, React.createElement('span', { className: 'cj-chatBridge', 'data-state': chatBridgeState }, mainContext.pending?.length ? '请先完成主对话确认' : chatBridgeState === 'connected' ? '主对话已响应' : chatBridgeState === 'pending' ? (mainConversation.session ? '正在等待主对话…' : '正在等待桥接…') : chatBridgeState === 'fallback' ? `桥接失败${chatBridgeError ? `：${chatBridgeError}` : ''}` : mainConversation.session ? '已同步当前主对话' : '上下文仅随本次发送'), chatBridgeState === 'pending' ? React.createElement('button', { type: 'button', className: 'cj-chatStop', onClick: stopChatWaiting }, '停止等待') : React.createElement('button', { type: 'button', className: 'cj-chatSend', onClick: sendChatMessage, disabled: !chatInput.trim() || Boolean(mainContext.pending?.length) }, '发送')),
          chatBridgeState === 'fallback' && lastUserPrompt ? React.createElement('button', { type: 'button', className: 'cj-chatApply', onClick: () => copyChatTask(lastUserPrompt) }, '复制任务到主对话') : null,
        ),
      )
      const editorInlineView = React.createElement(
        'div',
        { className: 'cj-previewWorkspace', 'data-chat': editorChatOpen ? 'open' : 'closed' },
        React.createElement(
          'section',
          { className: 'cj-editorPane cj-previewEditorPane' },
          React.createElement('div', { className: 'cj-editorPaneHead' }, React.createElement('span', null, 'Markdown'), React.createElement('small', null, editorSource ? (editorSelection ? '已选中一段内容' : '直接编辑，自动预览') : '正在读取内容…')),
          editorSource
            ? React.createElement('textarea', { className: 'cj-editorText', value: editorDraft, onChange: (event) => setEditorDraft(event.target.value), onSelect: (event) => setEditorSelection(event.currentTarget.value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)), spellCheck: false, 'aria-label': 'Markdown 简历内容' })
            : React.createElement('div', { className: 'cj-editorLoading' }, editorBusy ? '正在读取 Markdown…' : '选择一份投递版本后开始编辑'),
          React.createElement('div', { className: 'cj-editorStatus' }, React.createElement('span', null, editorMessage || '编辑内容后，右侧 A4 预览会自动更新。'), editorExternalPending ? React.createElement('button', { type: 'button', className: 'cj-editorReload', onClick: reloadEditorFromDisk }, '读取最新文件') : null),
        ),
        React.createElement(
          'section',
          { className: 'cj-editorPane cj-previewA4Pane' },
          React.createElement('div', { className: 'cj-editorPaneHead' }, React.createElement('span', null, 'A4 预览'), React.createElement('small', null, editorPreviewUrl ? '草稿实时渲染' : '等待输入')),
          React.createElement('div', { className: 'cj-editorPreviewFrame' }, editorPreviewUrl ? React.createElement('iframe', { title: 'Markdown 草稿预览', src: editorPreviewUrl }) : React.createElement('div', { className: 'cj-empty' }, '输入内容后生成预览')),
        ),
        editorChatOpen ? editorChatView : null,
      )
      const previewView = React.createElement(
        'div',
        { className: 'cj-previewShell' },
        React.createElement(
          'div',
          { className: 'cj-mainBar' },
          React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'cj-mainHeading' }, '投递版工作台'),
            React.createElement('div', { className: 'cj-mainHint' }, '左侧改内容，中间看 A4，右侧只在需要时调排版'),
          ),
          React.createElement(
            'div',
            { className: 'cj-previewActions' },
            React.createElement('button', { type: 'button', className: 'cj-toolButton', onClick: () => { setTemplatePickerOpen((value) => !value); setTuningOpen(false) }, 'aria-expanded': templatePickerOpen }, `模板 · ${selectedTemplate?.name || '选择模板'}`),
            React.createElement(
              'select',
              { className: 'cj-fileSelect', value: selected, onChange: (e) => setSelected(e.target.value) },
              ...previewOptions,
            ),
            React.createElement('button', { type: 'button', className: 'cj-toolButton', onClick: () => { setTuningOpen((value) => !value); setTemplatePickerOpen(false) }, 'aria-expanded': tuningOpen }, '手动调整'),
            React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: () => setEditorChatOpen((value) => !value), disabled: !editorSource }, editorChatOpen ? '收起 AI' : 'AI 助手'),
            React.createElement('button', { type: 'button', className: 'cj-iconAction', onClick: onRefresh, title: '重新读取磁盘上的最新预览', 'aria-label': '刷新预览' }, '↻'),
            React.createElement('button', { type: 'button', className: 'cj-ghostAction cj-compactExport', onClick: onDownload, disabled: !previewSrc }, '下载 HTML'),
            React.createElement('button', { type: 'button', className: 'cj-solidAction cj-compactExport', onClick: onPrint, disabled: !previewSrc }, '导出 PDF'),
            React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: saveEditor, disabled: editorBusy || !editorDraft.trim() }, editorBusy ? '处理中…' : '保存'),
            React.createElement('span', { className: `cj-inlineStatus cj-inlineStatus-${fitState.state}` }, `${statusButtonLabel} · ${statusButtonMeta}`),
          ),
          templatePickerOpen ? React.createElement('div', { className: 'cj-templatePicker', 'aria-label': '快速换模板' }, React.createElement('div', { className: 'cj-templatePickerHead' }, React.createElement('strong', null, '快速换模板'), React.createElement('button', { type: 'button', className: 'cj-templatePickerClose', onClick: () => setTemplatePickerOpen(false) }, '收起')), templateGallery) : null,
        ),
        error ? React.createElement('div', { className: 'cj-error' }, error) : null,
        tuningOpen ? tuningPanel : null,
        editorInlineView,
      )

      return React.createElement(
        'div',
        { className: 'cj-workbench', style: { position: 'relative' } },
        !compact && React.createElement('div', { className: 'cj-workbenchTop' }, React.createElement('div', { className: 'cj-brand' }, React.createElement('div', { className: 'cj-brandIcon' }, '简'), React.createElement('div', null, React.createElement('div', { className: 'cj-brandTitle' }, '投递版简历工作台'), React.createElement('div', { className: 'cj-brandDesc' }, '真实经历 · JD 匹配 · 一页排版'))), React.createElement('div', { className: 'cj-topActions' }, React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: onRefresh }, '重新检查'), React.createElement('button', { type: 'button', className: 'cj-ghostAction', onClick: onDownload, disabled: !previewSrc }, '下载 HTML'), React.createElement('button', { type: 'button', className: 'cj-solidAction', onClick: onPrint, disabled: !previewSrc }, '确认并导出'))),
        React.createElement(
          'div',
          { className: 'cj-workbenchBody', 'data-view': view },
          React.createElement('nav', { className: 'cj-nav', 'aria-label': '简历工作台导航' }, React.createElement('div', { className: 'cj-navLabel' }, 'WORKSPACE'), ...navItems.map(([id, icon, label]) => React.createElement('button', { key: id, type: 'button', className: 'cj-navItem', 'data-active': view === id ? 'true' : 'false', onClick: () => setView(id) }, React.createElement('span', { className: 'cj-navIcon' }, icon), label)), React.createElement('div', { className: 'cj-navFoot' }, React.createElement('div', null, 'Agent 负责改稿与排版。\n你负责最终确认。'), onClose ? React.createElement('button', { type: 'button', className: 'cj-closeAction', onClick: onClose, 'aria-label': '退出求职简历工作台' }, '退出工作台') : null)),
          React.createElement('main', { className: `cj-main cj-main-${view}` }, view === 'start' ? startView : view === 'preview' ? previewView : view === 'files' ? filesView : view === 'templates' ? templatesView : view === 'workshop' ? workshopView : guideView),
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
              React.createElement(PreviewWorkbench, { compact: true, onClose: () => setOpen(false) }),
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
      clientContext = ctx

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

