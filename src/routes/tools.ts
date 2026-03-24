import { Hono } from 'hono'
import { z } from 'zod'
import { HonoEnv } from '../types/index.js'
import { checkSSRF } from '../utils/index.js'
import { load } from 'cheerio'

const toolsApp = new Hono<HonoEnv>()

async function safeFetch(urlStr: string, c: any) {
  const url = checkSSRF(urlStr)
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'CFW-AI-Ready-Utility-Tools-Bot/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
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

toolsApp.get('/url-metadata', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text, url: finalUrl } = await safeFetch(url, c)
  const $ = load(text)
  
  const title = $('title').text() || $('meta[property="og:title"]').attr('content') || ''
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || ''
  const canonical = $('link[rel="canonical"]').attr('href') || finalUrl
  
  return c.json({
    ok: true,
    data: { title, description, canonical },
    request_id: c.get('requestId')
  })
})

toolsApp.get('/clean-text', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text, url: finalUrl } = await safeFetch(url, c)
  const $ = load(text)
  
  // Very basic cleanup
  $('script, style, noscript, header, footer, nav, iframe, svg, path, link, meta').remove()
  const cleanText = $('body').text().replace(/\s+/g, ' ').trim()
  
  return c.json({
    ok: true,
    data: {
      text: cleanText,
      source_meta: { url: finalUrl, title: $('title').text() }
    },
    request_id: c.get('requestId')
  })
})

toolsApp.get('/schema', async (c) => {
  const query = c.req.query()
  const { url } = urlQuerySchema.parse(query)
  
  const { text } = await safeFetch(url, c)
  const $ = load(text)
  
  const schemas: any[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      schemas.push(JSON.parse($(el).text()))
    } catch (e) {
      // ignore parsing errors
    }
  })
  
  return c.json({
    ok: true,
    data: schemas,
    request_id: c.get('requestId')
  })
})

toolsApp.post('/normalize-date', async (c) => {
  const schema = z.object({
    date: z.string()
  })
  
  const body = await c.req.json()
  const { date } = schema.parse(body)
  
  const parsedDate = new Date(date)
  if (isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date format')
  }
  
  return c.json({
    ok: true,
    data: { iso: parsedDate.toISOString() },
    request_id: c.get('requestId')
  })
})

toolsApp.post('/extract-html-table', async (c) => {
  const schema = z.object({
    html: z.string()
  })
  
  const body = await c.req.json()
  const { html } = schema.parse(body)
  
  const $ = load(html)
  const tables: any[][] = []
  
  $('table').each((_, table) => {
    const rows: any[] = []
    $(table).find('tr').each((_, tr) => {
      const row: string[] = []
      $(tr).find('td, th').each((_, cell) => {
        row.push($(cell).text().trim())
      })
      if (row.length > 0) rows.push(row)
    })
    if (rows.length > 0) tables.push(rows)
  })
  
  return c.json({
    ok: true,
    data: tables,
    request_id: c.get('requestId')
  })
})

export { toolsApp }
