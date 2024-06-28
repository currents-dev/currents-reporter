import * as crypto from "crypto";

export function generateShortHash(specName: string): string {
  // Create a SHA-256 hash of the specName
  const hash = crypto.createHash("sha256").update(specName).digest("base64");

  // Optionally, you can shorten the hash and make it URL-safe
  // Here, we take the first 8 characters for a shorter hash and replace URL-unsafe characters
  const shortHash = hash
    .slice(0, 8)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return shortHash;
}
