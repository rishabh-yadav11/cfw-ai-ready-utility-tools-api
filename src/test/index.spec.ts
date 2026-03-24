import { describe, it, expect } from 'vitest'
import app from '../index.js'
import { hashSHA256 } from '../utils/index.js'

describe('Basic Routing and Middleware', () => {
  it('should return 200 on root', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('AI-Ready Utility Tools API is running')
  })

  it('should return 401 for unauthorized access to protected routes', async () => {
    const res = await app.request('http://localhost/v1/metadata?url=https://example.com')
    expect(res.status).toBe(401)
  })
})

describe('Utils', () => {
  it('should correctly hash a string', async () => {
    const hash = await hashSHA256('test')
    expect(hash.length).toBe(64)
  })
})
