# AI-Ready Utility Tools API

A Cloudflare Worker providing AI-friendly APIs for metadata extraction, text cleaning, schema processing, date normalization, and HTML table extraction.

## Features

- **Metadata Extraction**: Fetch titles, descriptions, canonical URLs, language, favicon, robots metadata, and Open Graph tags.
- **Tools**:
  - Extract URL metadata
  - Clean web page text (for LLM ingestion)
  - Extract structured JSON-LD schema
  - Normalize dates into ISO-8601
  - Extract HTML tables into structured JSON arrays
- **Security**: Strict SSRF protections, API key authentication, per-IP rate limiting.
- **Deployment**: Powered by Cloudflare Workers and KV for fast, edge-hosted responses.

## Setup

1. `npm install`
2. Configure your KV namespace in `wrangler.jsonc` and replace `placeholder`.
3. Put `ADMIN_API_KEY` in your `.dev.vars` file for local development.

```sh
echo "ADMIN_API_KEY=my-super-secret-admin-key" > .dev.vars
```

## Running Locally

```sh
npm run dev
```

## Creating an API Key

```sh
curl -X POST http://localhost:8787/v1/keys \
  -H "Authorization: Bearer my-super-secret-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"plan": "free", "scopes": ["tools:read"]}'
```

Response includes your new `key`.

## Testing the API

```sh
curl -X GET "http://localhost:8787/v1/metadata?url=https://example.com" \
  -H "Authorization: Bearer YOUR_GENERated_KEY"
```

## Deployment

```sh
npm run deploy
```

Make sure to map your production KV bindings and Secrets:
```sh
wrangler secret put ADMIN_API_KEY
```
