import { SERVICE_SALT, normalizeUsername } from '@gadgets/workshop-shared/api'

async function argon2Hash(saltName: string, password: string): Promise<Uint8Array> {
  // Dynamic import - Vite will split this into a separate chunk
  const { argon2id } = await import('hash-wasm')

  // Build salt: SERVICE_SALT + utf8(saltName)
  const nameBuf = new TextEncoder().encode(saltName)
  const salt = new Uint8Array(SERVICE_SALT.length + nameBuf.length)
  salt.set(SERVICE_SALT)
  salt.set(nameBuf, SERVICE_SALT.length)

  return argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MiB in KiB
    hashLength: 32,
    outputType: 'binary',
  })
}

/**
 * Hash a password using Argon2id for authentication. The salt uses the normalized username, so the
 * hash is independent of the case typed (the server resolves accounts by the normalized name).
 *
 * The hash-wasm library is dynamically imported to keep it out of the main bundle,
 * since the WASM binary is only needed during login/signup/password-change flows.
 *
 * @throws if the username is not a valid username (see normalizeUsername)
 */
export async function hashPassword(username: string, password: string): Promise<Uint8Array> {
  return argon2Hash(normalizeUsername(username), password)
}

/**
 * Reproduces the pre-normalization hash, salted with the username exactly as typed at signup.
 * Exists only so LoginPage can re-salt old mixed-case accounts; delete once no deployment has any.
 */
export async function hashPasswordLegacyCase(username: string, password: string): Promise<Uint8Array> {
  return argon2Hash(username, password)
}
