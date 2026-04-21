/**
 * Build the canonical JSON payload for a sign-in request.
 *
 * Both the /sign page (which signs) and verifyCallback (which verifies)
 * must produce identical bytes for the same inputs. Keys are sorted
 * alphabetically. The `data` key is omitted entirely if not provided.
 */
export function buildCanonicalPayload(fields: {
  type: string;
  domain: string;
  address: string;
  nonce: string;
  timestamp: string;
  expires: string;
  data?: string;
}): string {
  const obj: Record<string, string> = {
    address: fields.address,
    domain: fields.domain,
    expires: fields.expires,
    nonce: fields.nonce,
    timestamp: fields.timestamp,
    type: fields.type,
  };
  if (fields.data !== undefined) {
    obj.data = fields.data;
  }
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).toSorted()) {
    sorted[key] = obj[key]!;
  }
  return JSON.stringify(sorted);
}
