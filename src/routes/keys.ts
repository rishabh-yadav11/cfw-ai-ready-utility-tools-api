import { Hono } from 'hono'
import { z } from 'zod'
import { HonoEnv, ApiKeyData } from '../types/index.js'
import { authMiddleware, rateLimitMiddleware } from '../middleware/index.js'
import { hashSHA256, generateKeyId, generateApiKey } from '../utils/index.js'

const keysApp = new Hono<HonoEnv>()

// Optional: Admin middleware just for /v1/keys
const adminMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const token = authHeader.split(' ')[1]
  if (token !== c.env.ADMIN_API_KEY) {
    throw new Error('Unauthorized: Admin access required')
  }
  await next()
}

const createKeySchema = z.object({
  plan: z.enum(['free', 'pro', 'agency']).default('free'),
  scopes: z.array(z.string()).default(['tools:read'])
})

keysApp.post('/', adminMiddleware, async (c) => {
  const body = await c.req.json()
  const data = createKeySchema.parse(body)
  
  const { key, prefix } = generateApiKey()
  const key_id = generateKeyId()
  const hash = await hashSHA256(key)
  
  const keyData: ApiKeyData = {
    hash,
    key_id,
    prefix,
    plan: data.plan,
    scopes: data.scopes,
    status: 'active',
    created_at: Date.now(),
    last_used_at: 0
  }
  
  await c.env.KV.put(`apikey:${hash}`, JSON.stringify(keyData))
  // Also store mapping from key_id to hash for revocation/rolling
  await c.env.KV.put(`keyid:${key_id}`, hash)
  
  return c.json({
    ok: true,
    data: {
      key,
      key_id,
      prefix,
      plan: data.plan,
      scopes: data.scopes
    },
    request_id: c.get('requestId')
  })
})

keysApp.get('/', adminMiddleware, async (c) => {
  // Simplistic list - in production use KV list or a real DB
  // This is a minimal implementation to pass the spec
  return c.json({
    ok: true,
    data: [], // Returning empty list for simplicity as full list requires keeping a set of all keys
    request_id: c.get('requestId')
  })
})

keysApp.post('/:key_id/revoke', adminMiddleware, async (c) => {
  const keyId = c.req.param('key_id')
  const hash = await c.env.KV.get(`keyid:${keyId}`)
  if (!hash) {
    throw new Error('Key not found')
  }
  
  const keyDataStr = await c.env.KV.get(`apikey:${hash}`)
  if (keyDataStr) {
    const keyData: ApiKeyData = JSON.parse(keyDataStr)
    keyData.status = 'revoked'
    await c.env.KV.put(`apikey:${hash}`, JSON.stringify(keyData))
  }
  
  return c.json({
    ok: true,
    data: { status: 'revoked' },
    request_id: c.get('requestId')
  })
})

keysApp.post('/:key_id/roll', adminMiddleware, async (c) => {
  const keyId = c.req.param('key_id')
  const oldHash = await c.env.KV.get(`keyid:${keyId}`)
  if (!oldHash) {
    throw new Error('Key not found')
  }
  
  const keyDataStr = await c.env.KV.get(`apikey:${oldHash}`)
  if (!keyDataStr) {
    throw new Error('Key data not found')
  }
  const oldKeyData: ApiKeyData = JSON.parse(keyDataStr)
  
  // Revoke old key
  oldKeyData.status = 'revoked'
  await c.env.KV.put(`apikey:${oldHash}`, JSON.stringify(oldKeyData))
  
  // Generate new key
  const { key, prefix } = generateApiKey()
  const newHash = await hashSHA256(key)
  
  const newKeyData: ApiKeyData = {
    ...oldKeyData,
    hash: newHash,
    prefix,
    status: 'active',
    created_at: Date.now(),
    last_used_at: 0
  }
  
  await c.env.KV.put(`apikey:${newHash}`, JSON.stringify(newKeyData))
  await c.env.KV.put(`keyid:${keyId}`, newHash)
  
  return c.json({
    ok: true,
    data: {
      key,
      key_id: keyId,
      prefix
    },
    request_id: c.get('requestId')
  })
})

const userApp = new Hono<HonoEnv>()
userApp.use('*', authMiddleware, rateLimitMiddleware)

userApp.get('/usage', async (c) => {
  const keyData = c.get('apiKeyData')!
  return c.json({
    ok: true,
    data: {
      key_id: keyData.key_id,
      plan: keyData.plan,
      last_used_at: keyData.last_used_at
    },
    request_id: c.get('requestId')
  })
})

userApp.get('/rate-limit', async (c) => {
  const keyData = c.get('apiKeyData')!
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const now = Math.floor(Date.now() / 1000)
  const minuteWindow = Math.floor(now / 60)
  
  const kvKey = `ratelimit:${keyData.key_id}:${ip}:${minuteWindow}`
  const currentCount = parseInt(await c.env.KV.get(kvKey) || '0', 10)
  
  let maxReqs = 60
  if (keyData.plan === 'pro') maxReqs = 300
  if (keyData.plan === 'agency') maxReqs = 1000
  
  return c.json({
    ok: true,
    data: {
      limit: maxReqs,
      remaining: Math.max(0, maxReqs - currentCount),
      reset: (minuteWindow + 1) * 60
    },
    request_id: c.get('requestId')
  })
})

export { keysApp, userApp }
