export async function hashSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function generateUUID(): string {
  return crypto.randomUUID()
}

export function generateKeyId(): string {
  return 'key_' + crypto.randomUUID().replace(/-/g, '')
}

export function generateApiKey(): { key: string, prefix: string } {
  const random = crypto.randomUUID().replace(/-/g, '')
  return {
    key: `utl_${random}`,
    prefix: `utl_`
  }
}

export function isValidHttpUrl(string: string) {
  let url
  try {
    url = new URL(string)
  } catch (_) {
    return false
  }
  return url.protocol === 'http:' || url.protocol === 'https:'
}

// Very basic IP checker. For production, consider using a library like ipaddr.js to check private ranges.
export function isPrivateIp(ip: string): boolean {
  // Catch simple localhost/private IPv4 prefixes
  if (
    ip.startsWith('10.') ||
    ip.startsWith('127.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip === '::1'
  ) {
    return true
  }
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10)
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true
    }
  }
  return false
}

// In Cloudflare Workers, we don't resolve DNS before fetching easily to check IP unless we use DoH.
// We'll rely on basic URL parsing to block obviously bad hostnames.
export function checkSSRF(urlString: string): URL {
  let url: URL
  try {
    url = new URL(urlString)
  } catch (e) {
    throw new Error('Invalid URL format')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS are allowed')
  }

  // Block obvious localhosts
  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    isPrivateIp(hostname)
  ) {
    throw new Error('Access to private or local network is forbidden')
  }
  
  return url
}
