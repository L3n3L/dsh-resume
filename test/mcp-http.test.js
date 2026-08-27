import assert from 'node:assert/strict'
import test from 'node:test'

import { createResumeMcpHttpHandler, mcpStatus, registerMcpRoutes, setMcpEnabled } from '../lib/mcp-http.js'

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers) },
    write(chunk) { this.body += Buffer.from(chunk).toString('utf8') },
    end(body = '') { this.body += String(body) },
  }
}

function controlRequest(action, origin = 'http://127.0.0.1:8787') {
  return {
    method: 'POST',
    url: '/dsh-resume/api/mcp/control',
    headers: { host: '127.0.0.1:8787', origin, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ action })) },
  }
}

test('MCP stays stopped until explicitly enabled and can be stopped again', async (t) => {
  await setMcpEnabled(false)
  t.after(() => setMcpEnabled(false))

  assert.equal(mcpStatus().enabled, false)
  const started = await setMcpEnabled(true)
  assert.equal(started.enabled, true)
  assert.equal(started.healthy, true)
  assert.equal(started.transport, 'streamable-http')
  assert.ok(started.startedAt)

  const stopped = await setMcpEnabled(false)
  assert.equal(stopped.enabled, false)
  assert.equal(stopped.healthy, false)
})

test('sidebar control route starts MCP and rejects a foreign origin', async (t) => {
  await setMcpEnabled(false)
  const routes = []
  const dispose = registerMcpRoutes({ webServer: { register(definition) { routes.push(definition); return () => {} } } })
  t.after(async () => { await setMcpEnabled(false); await dispose() })

  const control = routes.find((route) => route.path === '/dsh-resume/api/mcp/control')
  assert.ok(control)
  const started = fakeResponse()
  await control.handler(controlRequest('start'), started)
  assert.equal(started.status, 200)
  assert.equal(JSON.parse(started.body).enabled, true)

  const mcp = routes.find((route) => route.path === '/dsh-resume/mcp')
  assert.ok(mcp)
  const initialize = fakeResponse()
  await mcp.handler({
    method: 'POST',
    url: '/dsh-resume/mcp',
    headers: {
      host: '127.0.0.1:8787',
      origin: 'http://127.0.0.1:8787',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'sidebar-test', version: '0.1.0' } } }))
    },
  }, initialize)
  assert.equal(initialize.status, 200)
  assert.match(initialize.body, /serverInfo/)

  const denied = fakeResponse()
  await control.handler(controlRequest('stop', 'http://evil.example'), denied)
  assert.equal(denied.status, 403)
  assert.equal(mcpStatus().enabled, true)
})

test('HTTP MCP handler accepts a basic legacy initialize request', async (t) => {
  const handler = createResumeMcpHttpHandler()
  t.after(() => handler.close())

  const response = await handler.fetch(new Request('http://127.0.0.1/dsh-resume/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'dsh-resume-http-test', version: '0.1.0' },
      },
    }),
  }))

  assert.equal(response.status, 200)
  const body = await response.text()
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith('data: '))
  assert.ok(dataLine, `expected an SSE data event, got: ${body}`)
  const payload = JSON.parse(dataLine.slice('data: '.length))
  assert.equal(payload.jsonrpc, '2.0')
  assert.ok(payload.result?.serverInfo?.name)
})
