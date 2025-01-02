type Payload = Record<string, unknown> | null;

export function maskSensitiveFields(
  payload: Payload,
  fields: string[]
): Payload {
  if (!payload) return payload;

  const maskedPayload = { ...payload };

  fields.forEach((secret) => {
    if (maskedPayload.hasOwnProperty(secret)) {
      maskedPayload[secret] = '*****';
    }
  });

  return maskedPayload;
}

export function maskApiKey(payload: Payload): Payload {
  return maskSensitiveFields(payload, ['apiKey']);
}

export function maskRecordKey(payload: Payload): Payload {
  return maskSensitiveFields(payload, ['recordKey', 'key']);
}
