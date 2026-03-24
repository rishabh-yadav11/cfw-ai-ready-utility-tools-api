export interface Env {
  KV: KVNamespace
  ADMIN_API_KEY: string
}

export interface ApiKeyData {
  hash: string
  key_id: string
  prefix: string
  plan: 'free' | 'pro' | 'agency'
  scopes: string[]
  status: 'active' | 'revoked' | 'expired'
  created_at: number
  last_used_at: number
}

export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  meta?: any
  error?: {
    code: string
    message: string
    details?: any
  }
  request_id: string
}

export type HonoEnv = {
  Bindings: Env
  Variables: {
    requestId: string
    apiKeyData?: ApiKeyData
  }
}
