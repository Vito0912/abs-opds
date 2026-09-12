import crypto from 'node:crypto'
import type { CacheEntry, CachedToken } from '../types/cache.js'

const TOKEN_CACHE_TTL = 10 * 60 * 1000
const MAX_TOKEN_CACHE_SIZE = 10_000

const SALT_LENGTH = 16
const NONCE_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

const tokenCache = new Map<string, CacheEntry<CachedToken>>()

export function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key)

    if (!entry) {
        return undefined
    }

    if (entry.expiresAt <= Date.now()) {
        cache.delete(key)
        return undefined
    }

    return entry.value
}

export function pruneExpired<T>(cache: Map<string, CacheEntry<T>>): void {
    const now = Date.now()

    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
            cache.delete(key)
        }
    }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
            if (error) {
                reject(error)
                return
            }

            resolve(derivedKey)
        })
    })
}

export async function encryptTokenWithPassword(token: string, password: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_LENGTH)
    const nonce = crypto.randomBytes(NONCE_LENGTH)
    const key = await deriveKey(password, salt)

    try {
        const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, {
            authTagLength: AUTH_TAG_LENGTH
        })

        const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])

        return [
            'v2',
            salt.toString('hex'),
            nonce.toString('hex'),
            cipher.getAuthTag().toString('hex'),
            encrypted.toString('hex')
        ].join(':')
    } finally {
        key.fill(0)
    }
}

export async function decryptToken(encryptedToken: string, password: string): Promise<string> {
    const parts = encryptedToken.split(':')

    if (parts.length !== 5) {
        throw new Error('Invalid encrypted token')
    }

    const [version, saltHex, nonceHex, authTagHex, encryptedHex] = parts

    if (
        version !== 'v2' ||
        !/^[0-9a-f]{32}$/i.test(saltHex ?? '') ||
        !/^[0-9a-f]{24}$/i.test(nonceHex ?? '') ||
        !/^[0-9a-f]{32}$/i.test(authTagHex ?? '') ||
        encryptedHex === undefined ||
        !/^[0-9a-f]*$/i.test(encryptedHex) ||
        encryptedHex.length % 2 !== 0
    ) {
        throw new Error('Invalid encrypted token')
    }

    const salt = Buffer.from(saltHex, 'hex')
    const nonce = Buffer.from(nonceHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')

    const key = await deriveKey(password, salt)

    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, {
            authTagLength: AUTH_TAG_LENGTH
        })

        decipher.setAuthTag(authTag)

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

        return decrypted.toString('utf8')
    } finally {
        key.fill(0)
    }
}

function getTokenCacheKey(username: string): string {
    return username.toLowerCase()
}

function ensureTokenCacheCapacity(): void {
    pruneExpired(tokenCache)

    while (tokenCache.size >= MAX_TOKEN_CACHE_SIZE) {
        const oldestKey = tokenCache.keys().next().value as string | undefined

        if (oldestKey === undefined) {
            break
        }

        tokenCache.delete(oldestKey)
    }
}

export async function getCachedToken(username: string, password: string): Promise<CachedToken | null> {
    const cacheKey = getTokenCacheKey(username)
    const cached = getCachedValue(tokenCache, cacheKey)

    if (!cached) {
        return null
    }

    try {
        return {
            token: await decryptToken(cached.token, password),
            userId: cached.userId
        }
    } catch {
        tokenCache.delete(cacheKey)
        return null
    }
}

export async function setCachedToken(
    username: string,
    token: string,
    password: string,
    userId?: string
): Promise<void> {
    const cacheKey = getTokenCacheKey(username)

    ensureTokenCacheCapacity()

    tokenCache.set(cacheKey, {
        value: {
            token: await encryptTokenWithPassword(token, password),
            userId
        },
        expiresAt: Date.now() + TOKEN_CACHE_TTL
    })
}

export function pruneTokenCache(): void {
    pruneExpired(tokenCache)
}
