// _shared/twilio-webhook.ts
//
// Validate Twilio webhook requests WITHOUT the twilio SDK. Twilio signs each
// request as:
//   X-Twilio-Signature = base64( HMAC-SHA1( authToken, signatureBase ) )
// where signatureBase = fullUrl + every POST param, sorted by key, appended as
// key+value with no separator.
//
// Implemented with Web Crypto (crypto.subtle) so it runs in Deno with zero deps
// and is unit-testable under Node 20+ / Vitest, exactly like crypto.ts.

import { timingSafeEqualHex } from './crypto.ts'

/** Build the exact string Twilio signs: url + sorted(key+value) for each param. */
export function buildTwilioSignatureBase(url: string, params: URLSearchParams): string {
  const keys = [...new Set([...params.keys()])].sort()
  let data = url
  for (const k of keys) {
    // getAll handles the rare repeated-key case; single-valued for normal webhooks.
    for (const v of params.getAll(k)) data += k + v
  }
  return data
}

async function hmacSha1Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

export interface TwilioVerifyInput {
  authToken:       string
  signatureHeader: string | null
  url:             string
  params:          URLSearchParams
}

/**
 * True iff X-Twilio-Signature matches a freshly computed HMAC-SHA1 over the
 * canonical (url + sorted params) base. Comparison is constant-time
 * (timingSafeEqualHex is a generic equal-length string compare, base64-safe).
 * Returns false (never throws) on any missing input.
 */
export async function verifyTwilioSignature(input: TwilioVerifyInput): Promise<boolean> {
  const { authToken, signatureHeader, url, params } = input
  if (!authToken || !signatureHeader || !url) return false
  const expected = await hmacSha1Base64(authToken, buildTwilioSignatureBase(url, params))
  return timingSafeEqualHex(expected, signatureHeader)
}
