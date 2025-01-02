type Payload = Record<string, unknown> | null;

export function maskSecrets(payload: Payload, secrets: string[]): Payload {
  if (!payload) return payload;

  const maskedPayload = { ...payload };

  secrets.forEach((secret) => {
    if (maskedPayload.hasOwnProperty(secret)) {
      maskedPayload[secret] = '*****';
    }
  });

  return maskedPayload;
}

export function maskApiKey(payload: Payload): Payload {
  return maskSecrets(payload, ['apiKey']);
}

export function maskRecordKey(payload: Payload): Payload {
  return maskSecrets(payload, ['recordKey', 'key']);
}
