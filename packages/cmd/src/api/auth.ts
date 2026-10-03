export type ApiCredentials = { apiKey?: string; recordKey?: string };

/**
 * A record key goes in `x-currents-key`, and only the files routes accept it.
 * It wins when both are set, as in `currents run upload`.
 */
export function getAuthHeaders({ apiKey, recordKey }: ApiCredentials) {
  if (recordKey) return { 'x-currents-key': recordKey };
  if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  return {};
}
