/**
 * Humo del sistema Basecamp 420. Habla solo por HTTP y TCP.
 * No abre conexión de escritura a Postgres (HikCentral en 5432 queda intacto).
 *
 * node scripts/system-smoke.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import net from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

loadEnvFile(resolve(root, '.env'))

const apiBase = (process.env.SMOKE_API_BASE ?? defaultApiBase()).replace(/\/$/, '')
const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@basecamp.local'
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? 'change-me-now'
const sessionCookie = readSessionCookieName()

const results = []

async function main() {
  await checkHealth()
  const cookieHeader = await checkLogin()
  await checkMe(cookieHeader)
  await checkSummary(cookieHeader)
  await checkTcpPorts()

  const failed = results.filter((item) => !item.ok)
  if (failed.length > 0) {
    console.error(`\nHumo del sistema: FALLÓ (${failed.length} de ${results.length}).`)
    for (const item of failed) console.error(`- ${item.name}: ${item.detail}`)
    process.exit(1)
  }
  console.log(`\nHumo del sistema: OK (${results.length} comprobaciones).`)
}

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

function defaultApiBase() {
  const port = process.env.API_PORT ?? process.env.PORT ?? '3001'
  return `http://localhost:${port}`
}

function readSessionCookieName() {
  const apiSrc = resolve(root, 'apps/api/src')
  const literal = /SESSION_COOKIE\s*=\s*['"]([^'"]+)['"]/
  for (const file of walkTs(apiSrc)) {
    const match = readFileSync(file, 'utf8').match(literal)
    if (match) return match[1]
  }
  const shared = resolve(root, 'packages/shared/src/permissions.ts')
  const imported = readFileSync(shared, 'utf8').match(literal)
  if (!imported) {
    throw new Error('No se encontró SESSION_COOKIE en apps/api/src ni en packages/shared.')
  }
  return imported[1]
}

function walkTs(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkTs(full))
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

async function checkHealth() {
  const name = 'GET /health'
  try {
    const response = await fetch(`${apiBase}/health`)
    const body = await readJson(response)
    if (response.status !== 200) {
      return record(name, false, `HTTP ${response.status}`)
    }
    if (body?.status !== 'ok' || body?.db !== 'up') {
      return record(name, false, `status=${body?.status ?? '?'} db=${body?.db ?? '?'}`)
    }
    return record(name, true, '200, status ok, db up')
  } catch (error) {
    return record(name, false, errorMessage(error))
  }
}

async function checkLogin() {
  const name = 'POST /auth/login'
  try {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    if (response.status !== 200) {
      record(name, false, `HTTP ${response.status}`)
      return null
    }
    const header = sessionCookieHeader(response, sessionCookie)
    if (!header) {
      record(name, false, `HTTP 200 sin cookie ${sessionCookie}`)
      return null
    }
    record(name, true, `200 y cookie ${sessionCookie}`)
    return header
  } catch (error) {
    record(name, false, errorMessage(error))
    return null
  }
}

async function checkMe(cookieHeader) {
  const name = 'GET /auth/me'
  if (!cookieHeader) return record(name, false, 'sin sesión')
  try {
    const response = await fetch(`${apiBase}/auth/me`, { headers: { cookie: cookieHeader } })
    const body = await readJson(response)
    if (response.status !== 200) return record(name, false, `HTTP ${response.status}`)
    const email = body?.user?.email
    if (String(email).toLowerCase() !== adminEmail.toLowerCase()) {
      return record(name, false, '200 pero el correo no coincide con el admin de semilla')
    }
    return record(name, true, '200 y correo de admin')
  } catch (error) {
    return record(name, false, errorMessage(error))
  }
}

async function checkSummary(cookieHeader) {
  const name = 'GET /summary'
  if (!cookieHeader) return record(name, false, 'sin sesión')
  try {
    const response = await fetch(`${apiBase}/summary`, { headers: { cookie: cookieHeader } })
    if (response.status !== 200) return record(name, false, `HTTP ${response.status}`)
    return record(name, true, '200 resumen admin')
  } catch (error) {
    return record(name, false, errorMessage(error))
  }
}

async function checkTcpPorts() {
  const ports = [
    { port: 5433, label: 'Postgres' },
    { port: 6379, label: 'Redis' },
    { port: 9000, label: 'MinIO' },
  ]
  for (const target of ports) {
    const name = `TCP localhost:${target.port}`
    try {
      await tcpOpen('127.0.0.1', target.port, 2000)
      record(name, true, `${target.label} acepta conexión`)
    } catch (error) {
      record(name, false, errorMessage(error))
    }
  }
}

function sessionCookieHeader(response, name) {
  const lines =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  for (const line of lines) {
    const pair = line.split(';')[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (key === name && value) return `${name}=${value}`
  }
  return null
}

function tcpOpen(host, port, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const socket = net.connect({ host, port })
    const finish = (error) => {
      socket.removeAllListeners()
      socket.destroy()
      if (error) reject(error)
      else resolvePromise()
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish())
    socket.once('timeout', () => finish(new Error('tiempo de espera agotado')))
    socket.once('error', (error) => finish(error))
  })
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'OK' : 'FALLO'}  ${name}: ${detail}`)
}

function errorMessage(error) {
  if (error && typeof error === 'object' && 'cause' in error && error.cause) {
    const cause = error.cause
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code) return String(cause.code)
  }
  if (error instanceof Error) return error.message
  return 'error de red'
}

main().catch((error) => {
  console.error(`\nHumo del sistema: FALLÓ. ${error instanceof Error ? error.message : 'error'}`)
  process.exit(1)
})
