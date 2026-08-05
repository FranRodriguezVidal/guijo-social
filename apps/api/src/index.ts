import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { sign, verify } from 'hono/jwt'

type EnvBindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  JWT_SECRET: string
  APP_ORIGIN?: string
  APP_NAME?: string
}

type Variables = {
  anonymousNumber: string
}

type RegisterPayload = {
  anonymousNumber?: string
  password?: string
  age?: number
  acceptedPolicies?: boolean
  acceptedPrivacy?: boolean
}

type LoginPayload = {
  anonymousNumber?: string
  password?: string
}

type PostPayload = {
  content?: string
  parentPostId?: string | null
}

type CommentPayload = {
  content?: string
}

type ReportPayload = {
  reason?: string
  details?: string
}

type ProfileRow = {
  id: string
  anonymous_number: string
  password_hash: string
  age: number
  accepted_policies_at: string
  accepted_privacy_at: string
}

const app = new Hono<{ Bindings: EnvBindings; Variables: Variables }>()

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin')
  const allowedOrigins = parseAllowedOrigins(c.env.APP_ORIGIN)

  if (requestOrigin && isAllowedOrigin(requestOrigin, allowedOrigins)) {
    c.header('Access-Control-Allow-Origin', requestOrigin)
    c.header('Vary', 'Origin')
  }

  c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  return next()
})

app.get('/health', (c) => {
  return c.json({ ok: true, app: c.env.APP_NAME ?? 'Guijo Social API' })
})

app.get('/auth/check-number', async (c) => {
  const rawNumber = c.req.query('number')
  const anonymousNumber = sanitizeAnonymousNumber(rawNumber)

  if (!anonymousNumber) {
    return c.json({
      available: false,
      status: 'invalid',
      message: 'Escribe solo numeros.',
    }, 400)
  }

  if (anonymousNumber === 'ANONYM-0') {
    return c.json({
      available: false,
      status: 'occupied',
      message: 'Numero ocupado.',
    })
  }

  const supabase = getSupabase(c.env)
  const { data: reserved, error } = await supabase
    .from('reserved_anonymous_numbers')
    .select('anonymous_number, claimed_by_profile_id')
    .eq('anonymous_number', anonymousNumber)
    .maybeSingle()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  if (!reserved) {
    const { error: insertError } = await supabase
      .from('reserved_anonymous_numbers')
      .insert({ anonymous_number: anonymousNumber, notes: 'auto-reserved' })

    if (insertError) {
      return c.json({ error: insertError.message }, 500)
    }

    return c.json({
      available: true,
      status: 'available',
      message: 'Numero disponible.',
    })
  }

  if (reserved.claimed_by_profile_id) {
    return c.json({
      available: false,
      status: 'occupied',
      message: 'Numero ocupado.',
    })
  }

  return c.json({
    available: true,
    status: 'available',
    message: 'Numero disponible.',
  })
})

app.post('/auth/register', async (c) => {
  const body = await c.req.json<RegisterPayload>()
  const anonymousNumber = sanitizeAnonymousNumber(body.anonymousNumber)
  const password = body.password?.trim()
  const age = Number(body.age)

  if (!anonymousNumber || !password || !Number.isInteger(age)) {
    return c.json({ error: 'Missing registration fields.' }, 400)
  }

  if (anonymousNumber === 'ANONYM-0') {
    return c.json({ error: 'Numero ocupado.' }, 409)
  }

  if (!body.acceptedPolicies || !body.acceptedPrivacy) {
    return c.json({ error: 'Policies and privacy must be accepted.' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must have at least 8 characters.' }, 400)
  }

  const supabase = getSupabase(c.env)
  const { data: reserved, error: reservedError } = await supabase
    .from('reserved_anonymous_numbers')
    .select('anonymous_number, claimed_by_profile_id')
    .eq('anonymous_number', anonymousNumber)
    .maybeSingle()

  if (reservedError) {
    return c.json({ error: reservedError.message }, 500)
  }

  if (!reserved) {
    const { error: reserveCreateError } = await supabase
      .from('reserved_anonymous_numbers')
      .insert({ anonymous_number: anonymousNumber, notes: 'auto-reserved' })

    if (reserveCreateError) {
      return c.json({ error: reserveCreateError.message }, 500)
    }
  }

  if (reserved?.claimed_by_profile_id) {
    return c.json({ error: 'Anonymous number is not available.' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()
  const { data: createdProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      anonymous_number: anonymousNumber,
      password_hash: passwordHash,
      age,
      accepted_policies_at: now,
      accepted_privacy_at: now,
      device_info: c.req.header('user-agent') ?? 'unknown',
      last_seen_ip: c.req.header('cf-connecting-ip') ?? null,
    })
    .select('id, anonymous_number, age')
    .single()

  if (createError || !createdProfile) {
    return c.json({ error: createError?.message ?? 'Profile could not be created.' }, 500)
  }

  const { error: reserveUpdateError } = await supabase
    .from('reserved_anonymous_numbers')
    .update({ claimed_by_profile_id: createdProfile.id, claimed_at: now })
    .eq('anonymous_number', anonymousNumber)

  if (reserveUpdateError) {
    return c.json({ error: reserveUpdateError.message }, 500)
  }

  const token = await issueToken(c.env.JWT_SECRET, createdProfile.id, anonymousNumber)

  return c.json({
    token,
    profile: {
      id: createdProfile.id,
      anonymousNumber: createdProfile.anonymous_number,
      age: createdProfile.age,
    },
  }, 201)
})

app.post('/auth/login', async (c) => {
  const body = await c.req.json<LoginPayload>()
  const anonymousNumber = sanitizeAnonymousNumber(body.anonymousNumber)
  const password = body.password?.trim()

  if (!anonymousNumber || !password) {
    return c.json({ error: 'Anonymous number and password are required.' }, 400)
  }

  const supabase = getSupabase(c.env)
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, anonymous_number, password_hash, age')
    .eq('anonymous_number', anonymousNumber)
    .maybeSingle<ProfileRow>()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  if (!profile || !(await verifyPassword(password, profile.password_hash))) {
    return c.json({ error: 'Invalid credentials.' }, 401)
  }

  const token = await issueToken(c.env.JWT_SECRET, profile.id, profile.anonymous_number)
  return c.json({
    token,
    profile: {
      id: profile.id,
      anonymousNumber: profile.anonymous_number,
      age: profile.age,
    },
  })
})

app.use('/me/*', requireAuth)
app.use('/posts/*', requireAuth)
app.use('/reports/*', requireAuth)

app.get('/me/summary', async (c) => {
  const anonymousNumber = c.get('anonymousNumber')
  const supabase = getSupabase(c.env)

  const [{ data: profile }, { count: postsCount }, { count: likesCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('anonymous_number, age, created_at')
      .eq('anonymous_number', anonymousNumber)
      .single(),
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_anonymous_number', anonymousNumber),
    supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('anonymous_number', anonymousNumber),
  ])

  return c.json({
    profile,
    stats: {
      posts: postsCount ?? 0,
      likes: likesCount ?? 0,
    },
  })
})

app.get('/posts/feed', async (c) => {
  const supabase = getSupabase(c.env)
  const { data, error } = await supabase
    .from('posts_feed')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ items: data ?? [] })
})

app.post('/posts', async (c) => {
  const body = await c.req.json<PostPayload>()
  const content = body.content?.trim()
  const anonymousNumber = c.get('anonymousNumber')

  if (!content || content.length < 2 || content.length > 280) {
    return c.json({ error: 'Post must contain between 2 and 280 characters.' }, 400)
  }

  const supabase = getSupabase(c.env)
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_anonymous_number: anonymousNumber,
      content,
      parent_post_id: body.parentPostId ?? null,
    })
    .select('*')
    .single()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ item: data }, 201)
})

app.post('/posts/:postId/comments', async (c) => {
  const { postId } = c.req.param()
  const body = await c.req.json<CommentPayload>()
  const content = body.content?.trim()
  const anonymousNumber = c.get('anonymousNumber')

  if (!content || content.length < 2 || content.length > 280) {
    return c.json({ error: 'Comment must contain between 2 and 280 characters.' }, 400)
  }

  const supabase = getSupabase(c.env)
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      anonymous_number: anonymousNumber,
      content,
    })
    .select('*')
    .single()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ item: data }, 201)
})

app.post('/posts/:postId/like', async (c) => {
  const { postId } = c.req.param()
  const anonymousNumber = c.get('anonymousNumber')
  const supabase = getSupabase(c.env)

  const { error } = await supabase
    .from('post_likes')
    .upsert({ post_id: postId, anonymous_number: anonymousNumber }, { onConflict: 'post_id,anonymous_number' })

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ ok: true })
})

app.post('/reports', async (c) => {
  const body = await c.req.json<ReportPayload>()
  const anonymousNumber = c.get('anonymousNumber')

  if (!body.reason?.trim()) {
    return c.json({ error: 'Report reason is required.' }, 400)
  }

  const supabase = getSupabase(c.env)
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_anonymous_number: anonymousNumber,
      reason: body.reason.trim(),
      details: body.details?.trim() ?? null,
      status: 'pending_review',
      review_after: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ item: data }, 201)
})

export default app

function getSupabase(env: EnvBindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseAllowedOrigins(value?: string) {
  const origins = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (!origins || origins.length === 0) {
    return '*'
  }

  return origins.length === 1 ? origins[0] : origins
}

function isAllowedOrigin(requestOrigin: string, allowed: string | string[]) {
  const patterns = Array.isArray(allowed) ? allowed : [allowed]

  return patterns.some((pattern) => {
    if (pattern === '*') {
      return true
    }

    if (pattern.includes('*')) {
      const normalized = pattern.replace(/^https?:\/\//, '').replace(/^\*\./, '')
      const requestHost = requestOrigin.replace(/^https?:\/\//, '')
      return requestHost === normalized || requestHost.endsWith(`.${normalized}`)
    }

    return requestOrigin === pattern
  })
}

function sanitizeAnonymousNumber(value?: string) {
  if (!value) {
    return ''
  }

  const cleaned = value.replace(/[^0-9]/g, '')
  return cleaned ? `ANONYM-${cleaned}` : ''
}

async function issueToken(secret: string, profileId: string, anonymousNumber: string) {
  return sign(
    {
      sub: profileId,
      anonymousNumber,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
    },
    secret,
    'HS256',
  )
}

async function requireAuth(c: Parameters<MiddlewareHandler<{ Bindings: EnvBindings; Variables: Variables }>>[0], next: Parameters<MiddlewareHandler<{ Bindings: EnvBindings; Variables: Variables }>>[1]) {
  const authorization = c.req.header('Authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized.' }, 401)
  }

  try {
    const payload = await verify(authorization.slice(7), c.env.JWT_SECRET, 'HS256')
    const anonymousNumber = payload.anonymousNumber

    if (typeof anonymousNumber !== 'string') {
      return c.json({ error: 'Unauthorized.' }, 401)
    }

    c.set('anonymousNumber', anonymousNumber)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized.' }, 401)
  }
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await derivePasswordKey(password, salt)
  return `${toBase64(salt)}.${toBase64(new Uint8Array(key))}`
}

async function verifyPassword(password: string, storedHash: string) {
  const [saltPart, hashPart] = storedHash.split('.')

  if (!saltPart || !hashPart) {
    return false
  }

  const salt = Uint8Array.from(fromBase64(saltPart))
  const expectedHash = fromBase64(hashPart)
  const derived = new Uint8Array(await derivePasswordKey(password, salt))

  if (derived.byteLength !== expectedHash.byteLength) {
    return false
  }

  return timingSafeEqual(derived, expectedHash)
}

async function derivePasswordKey(password: string, salt: Uint8Array) {
  const normalizedSalt = new Uint8Array(salt)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSalt,
      iterations: 120000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false
  }

  let diff = 0
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index] ^ right[index]
  }

  return diff === 0
}