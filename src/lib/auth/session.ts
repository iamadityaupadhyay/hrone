export const SESSION_COOKIE_NAME = 'hrone_session';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  process.env.BASIC_AUTH_PASSWORD ||
  'hrone-enterprise-dashboard-salt-2026';

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(
  username: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000
): Promise<string> {
  const expiresAt = Date.now() + maxAgeMs;
  const payload = `${username}:${expiresAt}`;
  const key = await getHmacKey(SESSION_SECRET);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${payload}:${sigHex}`;
}

export async function verifySessionToken(
  token?: string | null
): Promise<{ valid: boolean; username?: string }> {
  if (!token) return { valid: false };
  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false };

  const [username, expiresStr, sigHex] = parts;
  const expiresAt = Number(expiresStr);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    return { valid: false };
  }

  const payload = `${username}:${expiresAt}`;
  const key = await getHmacKey(SESSION_SECRET);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedSigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (sigHex !== expectedSigHex) {
    return { valid: false };
  }

  return { valid: true, username };
}

