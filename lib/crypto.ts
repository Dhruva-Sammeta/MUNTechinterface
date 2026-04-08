/**
 * Sapphire MUN — Scoped Chat Encryption
 *
 * AES-256-GCM using the Web Crypto API.
 * Keys are derived deterministically based on the message scope (Public, Private, Bloc, EB).
 * This ensures that even if the database is compromised, the content is unreadable without 
 * the proper contextual secret (ID) which is only known to authorized clients.
 */

const SALTS = {
  PUBLIC:  new TextEncoder().encode("sapphire-mun-public-v2"),
  PRIVATE: new TextEncoder().encode("sapphire-mun-private-v2"),
  BLOC:    new TextEncoder().encode("sapphire-mun-bloc-v2"),
  EB:      new TextEncoder().encode("sapphire-mun-eb-desk-v2"),
};

const ITERATIONS = 100_000;

/**
 * Derive a key based on a secret (ID) and a scope-specific salt.
 */
async function deriveScopedKey(secret: string, scope: keyof typeof SALTS): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALTS[scope], iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt chat message content.
 * @param content Plaintext content
 * @param secret The ID used for derivation (e.g. committeeId, sessionId, or blocId)
 * @param scope The visibility scope
 * @returns base64 string of `iv:ciphertext`
 */
export async function encryptMessage(
  content: string,
  secret: string,
  scope: keyof typeof SALTS = "PUBLIC"
): Promise<string> {
  const key = await deriveScopedKey(secret, scope);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(content);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt chat message content.
 */
export async function decryptMessage(
  encrypted: string,
  secret: string,
  scope: keyof typeof SALTS = "PUBLIC"
): Promise<string> {
  try {
    const key = await deriveScopedKey(secret, scope);
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // If decryption fails, return the raw value (or handle as corrupted)
    return encrypted;
  }
}

// Keep legacy exports for backward compatibility during transition if needed
export const encryptChit = (content: string, sessionId: string) => encryptMessage(content, sessionId, "PRIVATE");
export const decryptChit = (encrypted: string, sessionId: string) => decryptMessage(encrypted, sessionId, "PRIVATE");
