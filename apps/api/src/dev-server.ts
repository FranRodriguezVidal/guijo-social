// @ts-nocheck
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'node:net'
import { serve } from '@hono/node-server'
import app from './index'

const env = {
  ...readDotEnvLike(resolve(process.cwd(), '.dev.vars')),
  ...process.env,
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET']
for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required env var: ${key}. Add it to apps/api/.dev.vars`)
  }
}

if (String(env.SUPABASE_SERVICE_ROLE_KEY).includes('replace-with-your-service-role-key')) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is still a placeholder. Add the real service_role key in apps/api/.dev.vars',
  )
}

if (String(env.SUPABASE_SERVICE_ROLE_KEY).startsWith('sb_publishable_')) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is using a publishable key. Put the real service_role/secret key from Supabase in apps/api/.dev.vars',
  )
}

if (String(env.JWT_SECRET).includes('replace-with-a-long-random-secret')) {
  throw new Error(
    'JWT_SECRET is still a placeholder. Set a real random secret in apps/api/.dev.vars',
  )
}

const port = 8789

if (!(await isPortFree(port))) {
  const running = await isOurApiRunning(port)
  if (running) {
    console.log(`API already running at http://localhost:${port}`)
    console.log('Keeping this terminal attached. Press Ctrl+C to stop.')
    await new Promise(() => {})
  }

  throw new Error(
    `Port ${port} is already in use by another process. Free it and run npm run dev:api again.`,
  )
}

serve(
  {
    port,
    fetch: (request) => app.fetch(request, env),
  },
  (info) => {
    console.log(`API running at http://localhost:${info.port}`)
  },
)

function readDotEnvLike(filePath: string) {
  if (!existsSync(filePath)) {
    return {}
  }

  const content = readFileSync(filePath, 'utf8')
  const result: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const index = line.indexOf('=')
    if (index < 1) {
      continue
    }

    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    result[key] = value
  }

  return result
}

function isPortFree(port: number) {
  return new Promise<boolean>((resolvePromise) => {
    const server = createServer()

    server.once('error', () => {
      resolvePromise(false)
    })

    server.once('listening', () => {
      server.close(() => {
        resolvePromise(true)
      })
    })

    server.listen(port, '::')
  })
}

async function isOurApiRunning(port: number) {
  try {
    const response = await fetch(`http://localhost:${port}/health`)
    if (!response.ok) {
      return false
    }

    const body = (await response.json()) as { ok?: boolean }
    return body?.ok === true
  } catch {
    return false
  }
}
