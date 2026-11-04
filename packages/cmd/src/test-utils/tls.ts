import crypto from 'crypto';

// DER encoding of the ASN.1 types an X.509 certificate is made of.
function der(tag: number, ...parts: Buffer[]) {
  const body = Buffer.concat(parts);
  const length: number[] = [];
  for (let n = body.length; n > 0; n >>= 8) length.unshift(n & 0xff);
  const header =
    body.length < 0x80 ? [body.length] : [0x80 | length.length, ...length];
  return Buffer.concat([Buffer.from([tag, ...header]), body]);
}

const sequence = (...parts: Buffer[]) => der(0x30, ...parts);

function oid(value: string) {
  const [first, second, ...rest] = value.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const n of rest) {
    const encoded = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) encoded.unshift((v & 0x7f) | 0x80);
    bytes.push(...encoded);
  }
  return der(0x06, Buffer.from(bytes));
}

const utcTime = (date: Date) =>
  der(
    0x17,
    Buffer.from(date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z')
  );

/**
 * A self-signed certificate for `localhost`, `127.0.0.1` and the names given,
 * valid for a day, and its key, both PEM.
 */
export function createTestCertificate(dnsNames: string[] = []) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const ecdsaWithSha256 = sequence(oid('1.2.840.10045.4.3.2'));
  const name = sequence(
    der(0x31, sequence(oid('2.5.4.3'), der(0x0c, Buffer.from('localhost'))))
  );
  const now = Date.now();
  const altNames = sequence(
    ...['localhost', ...dnsNames].map((dns) => der(0x82, Buffer.from(dns))),
    der(0x87, Buffer.from([127, 0, 0, 1]))
  );
  const extensions = der(
    0xa3,
    sequence(
      // Basic constraints, critical: a CA, so it can be its own trust anchor.
      sequence(
        oid('2.5.29.19'),
        der(0x01, Buffer.from([0xff])),
        der(0x04, sequence(der(0x01, Buffer.from([0xff]))))
      ),
      sequence(oid('2.5.29.17'), der(0x04, altNames))
    )
  );
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    ecdsaWithSha256,
    name,
    sequence(
      utcTime(new Date(now - 86_400_000)),
      utcTime(new Date(now + 86_400_000))
    ),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    extensions
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  const cert = sequence(
    tbs,
    ecdsaWithSha256,
    der(0x03, Buffer.from([0]), signature)
  );
  const base64 = cert.toString('base64').replace(/.{64}/g, '$&\n');
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}
