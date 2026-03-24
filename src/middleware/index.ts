import { MiddlewareHandler } from 'hono'
import { HonoEnv, ApiKeyData } from '../types/index.js'
import { hashSHA256 } from '../utils/index.js'

export const requestIdMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const reqId = crypto.randomUUID()
  c.set('requestId', reqId)
  c.header('X-Request-Id', reqId)
  await next()
}

export const errorHandler = (err: any, c: any) => {
  const reqId = c.get('requestId') || 'unknown'
  console.error(`Error processing request ${reqId}:`, err)
  
  // Basic structured error mapping
  let statusCode = 500
  let code = 'internal_error'
  let message = 'An unexpected error occurred'
  
  if (err.name === 'ZodError') {
    statusCode = 422
    code = 'validation_error'
    message = 'Invalid request data'
  } else if (err.message?.includes('Forbidden') || err.message?.includes('SSRF')) {
    statusCode = 403
    code = 'forbidden'
    message = err.message
  } else if (err.message?.includes('Unauthorized')) {
    statusCode = 401
    code = 'unauthorized'
    message = err.message
  } else if (err.message?.includes('Rate Limited')) {
    statusCode = 429
    code = 'rate_limited'
    message = err.message
  }
  
  c.status(statusCode)
  return c.json({
    ok: false,
    error: {
      code,
      message,
      ...(err.name === 'ZodError' ? { details: err.errors } : {})
    },
    request_id: reqId
  })
}

export const authMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization header')
  }
  
  const token = authHeader.split(' ')[1]
  const hashedToken = await hashSHA256(token)
  
  // Read from KV
  const keyDataStr = await c.env.KV.get(`apikey:${hashedToken}`)
  if (!keyDataStr) {
    throw new Error('Unauthorized: Invalid API key')
  }
  
  const keyData: ApiKeyData = JSON.parse(keyDataStr)
  if (keyData.status !== 'active') {
    throw new Error(`Unauthorized: API key is ${keyData.status}`)
  }
  
  // Update last used asynchronously
  c.executionCtx.waitUntil(
    c.env.KV.put(`apikey:${hashedToken}`, JSON.stringify({
      ...keyData,
      last_used_at: Date.now()
    }))
  )
  
  c.set('apiKeyData', keyData)
  await next()
}

export const rateLimitMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown'
  const keyData = c.get('apiKeyData')
  const keyId = keyData?.key_id || 'anonymous'
  const plan = keyData?.plan || 'free'
  
  const now = Math.floor(Date.now() / 1000)
  const minuteWindow = Math.floor(now / 60)
  
  // Limits
  let maxReqs = 60
  if (plan === 'pro') maxReqs = 300
  if (plan === 'agency') maxReqs = 1000
  
  const kvKey = `ratelimit:${keyId}:${ip}:${minuteWindow}`
  const currentCount = parseInt(await c.env.KV.get(kvKey) || '0', 10)
  
  if (currentCount >= maxReqs) {
    c.header('X-RateLimit-Limit', maxReqs.toString())
    c.header('X-RateLimit-Remaining', '0')
    c.header('X-RateLimit-Reset', ((minuteWindow + 1) * 60).toString())
    c.header('Retry-After', (((minuteWindow + 1) * 60) - now).toString())
    throw new Error('Rate Limited')
  }
  
  c.executionCtx.waitUntil(
    c.env.KV.put(kvKey, (currentCount + 1).toString(), { expirationTtl: 120 })
  )
  
  c.header('X-RateLimit-Limit', maxReqs.toString())
  c.header('X-RateLimit-Remaining', (maxReqs - currentCount - 1).toString())
  c.header('X-RateLimit-Reset', ((minuteWindow + 1) * 60).toString())
  
  await next()
}
