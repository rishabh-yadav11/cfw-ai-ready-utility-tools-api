import { Hono } from 'hono'
import { z } from 'zod'
import { HonoEnv } from '../types/index.js'
import { checkSSRF } from '../utils/index.js'
import { load } from 'cheerio'

const metadataApp = new Hono<HonoEnv>()

// Basic fetching logic with safety rails
async function safeFetch(urlStr: string, c: any) {
  const url = checkSSRF(urlStr)
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'CFW-AI-Ready-Utility-Tools-Bot/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    // We can't control redirects explicitly in standard fetch to block > 5 without doing it manually,
    // but Cloudflare Workers fetch handles redirects up to 20 by default.
    // We'll rely on basic fetch. For strict 5 redirect limits, we'd need to manually handle 'manual' redirect mode.
    redirect: 'follow',
    signal: AbortSignal.timeout(8000)
  })

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`)
  }
  
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new Error('Only HTML content is supported')
  }
  
  // Body size cap approximation by reading the buffer up to 2MB (or simply arrayBuffer slice if larger)
  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > 2 * 1024 * 1024) {
    throw new Error('Response body exceeds 2MB limit')
  }
  
  const text = new TextDecoder().decode(arrayBuffer)
  return { text, url: response.url }
}

const urlQuerySchema = z.object({
  url: z.string().url().max(2048)
})

metadataApp.get('/metadata', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text, url: finalUrl } = await safeFetch(url, c)
  const $ = load(text)
  
  const title = $('title').text() || $('meta[property="og:title"]').attr('content') || ''
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || ''
  const canonical = $('link[rel="canonical"]').attr('href') || finalUrl
  const lang = $('html').attr('lang') || ''
  const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || ''
  const robots = $('meta[name="robots"]').attr('content') || ''
  
  const ogTags: Record<string, string> = {}
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')
    const content = $(el).attr('content')
    if (prop && content) {
      ogTags[prop] = content
    }
  })

  return c.json({
    ok: true,
    data: {
      title,
      description,
      canonical,
      lang,
      favicon: favicon ? new URL(favicon, finalUrl).toString() : '',
      robots,
      og: ogTags
    },
    request_id: c.get('requestId')
  })
})

metadataApp.get('/favicon', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text, url: finalUrl } = await safeFetch(url, c)
  const $ = load(text)
  
  const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href')
  const faviconUrl = favicon ? new URL(favicon, finalUrl).toString() : new URL('/favicon.ico', finalUrl).toString()
  
  return c.json({
    ok: true,
    data: { favicon_url: faviconUrl },
    request_id: c.get('requestId')
  })
})

metadataApp.get('/schema', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text } = await safeFetch(url, c)
  const $ = load(text)
  
  const schemas: any[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      schemas.push(JSON.parse($(el).text()))
    } catch (e) {
      // ignore parsing errors for individual scripts
    }
  })
  
  return c.json({
    ok: true,
    data: schemas,
    request_id: c.get('requestId')
  })
})

metadataApp.post('/metadata/batch', async (c) => {
  const batchSchema = z.object({
    urls: z.array(z.string().url().max(2048)).max(50)
  })
  
  const body = await c.req.json()
  const { urls } = batchSchema.parse(body)
  
  const results = await Promise.allSettled(urls.map(async (u) => {
    try {
      const { text, url: finalUrl } = await safeFetch(u, c)
      const $ = load(text)
      return {
        url: u,
        status: 'success',
        title: $('title').text()
      }
    } catch (err: any) {
      return {
        url: u,
        status: 'error',
        error: err.message
      }
    }
  }))
  
  return c.json({
    ok: true,
    data: results.map(r => r.status === 'fulfilled' ? r.value : r.reason),
    request_id: c.get('requestId')
  })
})

export { metadataApp }
