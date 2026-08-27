import { createMcpHandler } from '@modelcontextprotocol/server'

import { createResumeMcpServer } from '../mcp-server/index.js'

const MCP_PATH = '/dsh-resume/mcp'
const MCP_SERVER_VERSION = '0.1.0'
const runtime = {
  enabled: false,
  handler: null,
  startedAt: null,
  lastError: null,
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sameOrigin(req) {
  const headers = req.headers || {}
  const origin = headers.origin
  if (!origin) return true
  try {
    const host = headers.host || '127.0.0.1'
    const requestUrl = new URL(req.url || '/', `http://${host}`)
    return new URL(origin).host === requestUrl.host
  } catch {
    return false
  }
}

async function toWebRequest(req) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (value !== undefined) headers.set(name, String(value))
  }
  const chunks = []
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  return new Request(new URL(req.url || '/', 'http://127.0.0.1'), {
    method: req.method || 'GET',
    headers,
    body,
  })
}

async function writeWebResponse(res, response) {
  for (const [name, value] of response.headers) res.setHeader(name, value)
  res.writeHead(response.status)
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      res.write(Buffer.from(next.value))
    }
  } finally {
    res.end()
  }
}

export function createResumeMcpHttpHandler() {
  return createMcpHandler(createResumeMcpServer, {
    // Serve modern traffic while retaining stateless support for older MCP
    // clients that only implement the 2025-era HTTP shape.
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: (error) => {
      runtime.lastError = String(error?.message || error)
    },
  })
}

export function mcpStatus() {
  return {
    enabled: runtime.enabled,
    healthy: runtime.enabled && Boolean(runtime.handler),
    transport: 'streamable-http',
    endpoint: MCP_PATH,
    version: MCP_SERVER_VERSION,
    startedAt: runtime.startedAt,
    lastError: runtime.lastError,
  }
}

export async function setMcpEnabled(enabled) {
  const next = Boolean(enabled)
  if (next === runtime.enabled && (!next || runtime.handler)) return mcpStatus()
  if (!next) {
    if (runtime.handler) await runtime.handler.close()
    runtime.enabled = false
    runtime.handler = null
    runtime.startedAt = null
    return mcpStatus()
  }
  runtime.lastError = null
  runtime.handler = createResumeMcpHttpHandler()
  runtime.enabled = true
  runtime.startedAt = new Date().toISOString()
  return mcpStatus()
}

export function registerMcpRoutes(ctx) {
  const disposers = []

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/mcp',
    async handler(_req, res) {
      json(res, 200, mcpStatus())
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-resume/api/mcp/control',
    async handler(req, res) {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
      if (!sameOrigin(req)) return json(res, 403, { error: 'cross-origin request rejected' })
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
        if (!['start', 'stop', 'restart'].includes(body.action)) return json(res, 400, { error: 'action must be start, stop, or restart' })
        if (body.action === 'restart') await setMcpEnabled(false)
        const status = await setMcpEnabled(body.action !== 'stop')
        json(res, 200, status)
      } catch (error) {
        runtime.lastError = String(error?.message || error)
        json(res, 500, { ...mcpStatus(), error: runtime.lastError })
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: MCP_PATH,
    async handler(req, res) {
      if (!runtime.enabled || !runtime.handler) return json(res, 503, { error: 'MCP is not started; use the dsh-resume sidebar to start it.' })
      if (!sameOrigin(req)) return json(res, 403, { error: 'cross-origin request rejected' })
      try {
        await writeWebResponse(res, await runtime.handler.fetch(await toWebRequest(req)))
      } catch (error) {
        runtime.lastError = String(error?.message || error)
        json(res, 500, { error: runtime.lastError })
      }
    },
  }))

  return () => Promise.all(disposers.map((dispose) => typeof dispose === 'function' ? dispose() : undefined))
}
