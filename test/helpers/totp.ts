import { createHmac } from 'node:crypto'

// What an authenticator app does with the `otpauth://` link it scans: read
// the secret, and show the code for the current 30 seconds.

/** The secret of an `otpauth://` link, as bytes (RFC 4648 base32). */
export function secretOf(totpURI: string): Buffer {
  const encoded = new URL(totpURI).searchParams.get('secret') ?? ''
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of encoded.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  return Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => Number.parseInt(byte, 2)))
}

/** The code an authenticator app shows now (RFC 6238: HMAC-SHA-1, 30 seconds, 6 digits). */
export function appCode(secret: Buffer, now = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)))
  const mac = createHmac('sha1', secret).update(counter).digest()
  const offset = mac[mac.length - 1]! & 0xF
  return String(mac.readUInt32BE(offset) & 0x7FFF_FFFF).padStart(10, '0').slice(-6)
}
