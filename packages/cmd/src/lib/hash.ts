import * as crypto from 'crypto';

export function generateShortHash(value: string): string {
  const hash = crypto.createHash('sha256').update(value).digest('base64');

  const shortHash = hash
    .slice(0, 8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return shortHash;
}
