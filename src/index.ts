import { Hono } from 'hono'
import { HonoEnv } from './types/index.js'
import { requestIdMiddleware, errorHandler, authMiddleware, rateLimitMiddleware } from './middleware/index.js'
import { keysApp, userApp } from './routes/keys.js'
import { metadataApp } from './routes/metadata.js'
import { toolsApp } from './routes/tools.js'

const app = new Hono<HonoEnv>()

app.onError(errorHandler)
app.use('*', requestIdMiddleware)

// Global middleware for strict validation (body cap, JSON parsing)
app.use('*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    const contentLength = c.req.header('Content-Length')
    if (contentLength && parseInt(contentLength, 10) > 256 * 1024) {
      throw new Error('Payload too large')
    }
  }
  await next()
})

app.route('/v1/keys', keysApp)
app.route('/v1', userApp) // /v1/usage, /v1/rate-limit

// The following routes require authentication and rate limiting
const protectedApp = new Hono<HonoEnv>()
protectedApp.use('*', authMiddleware, rateLimitMiddleware)

protectedApp.route('/', metadataApp) // mounts /v1/metadata, /v1/favicon, /v1/schema, /v1/metadata/batch
protectedApp.route('/tools', toolsApp) // mounts /v1/tools/url-metadata etc

app.route('/v1', protectedApp)

app.get('/', (c) => c.text('AI-Ready Utility Tools API is running'))

export default app
