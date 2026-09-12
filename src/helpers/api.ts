import { InternalUser } from '../types/internal.js'
import type { Request, Response } from 'express'
import axios from 'axios'
import { isDevelopment, serverURL, useProxy } from '../config.js'
import crypto from 'crypto'
import { promisify } from 'util'
import { resolveUpstreamURL } from './upstream.js'
import {
    buildContentDisposition,
    getDownloadExtension,
    getDownloadMimeType,
    normalizeFormat,
    sanitizeFilenameBase
} from './download.js'

interface CachedToken {
    encryptedToken: string
    expires: number
}

const tokenCache = new Map<string, CachedToken>()
const CACHE_TTL = 10 * 60 * 1000

const scryptAsync = promisify(crypto.scrypt) as (
    password: crypto.BinaryLike,
    salt: crypto.BinaryLike,
    keylen: number
) => Promise<Buffer>

/**
 * Derives the token-encryption key from the user's password.
 *
 * scrypt is intentionally expensive, so this uses the asynchronous variant: the
 * synchronous one blocked the event loop for tens of milliseconds on every
 * authenticated request, capping the whole server's throughput.
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return scryptAsync(password, salt, 32)
}

/**
 * Encrypts an Audiobookshelf token with a key derived from the user's password,
 * so a cached token is not recoverable from process memory alone.
 *
 * AES-GCM is used rather than CBC: its authentication tag makes decryption with
 * the wrong password fail deterministically. Unauthenticated CBC only failed via
 * a padding error, so roughly one wrong password in 256 decrypted to garbage
 * that was then accepted as a valid session.
 */
async function encryptTokenWithPassword(token: string, password: string): Promise<string> {
    const salt = crypto.randomBytes(16)
    const key = await deriveKey(password, salt)
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])

    return [salt, iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('hex')).join(':')
}

async function decryptToken(payload: string, password: string): Promise<string | null> {
    const parts = payload.split(':')
    if (parts.length !== 4) {
        return null
    }

    try {
        const [salt, iv, authTag, encrypted] = parts.map((part) => Buffer.from(part, 'hex'))
        const key = await deriveKey(password, salt)
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(authTag)
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
        return null
    }
}

function pruneTokenCache(): void {
    const now = Date.now()
    for (const [key, entry] of tokenCache) {
        if (now > entry.expires) {
            tokenCache.delete(key)
        }
    }
}

async function getCachedToken(username: string, password: string): Promise<string | null> {
    pruneTokenCache()

    const cached = tokenCache.get(username)
    if (!cached || Date.now() > cached.expires) {
        if (cached) tokenCache.delete(username)
        return null
    }

    // Wrong password, or an entry we can no longer read.
    return await decryptToken(cached.encryptedToken, password)
}

async function setCachedToken(username: string, token: string, password: string): Promise<void> {
    tokenCache.set(username, {
        encryptedToken: await encryptTokenWithPassword(token, password),
        expires: Date.now() + CACHE_TTL
    })
}

export async function apiCall(path: string, user: InternalUser) {
    const target = resolveUpstreamURL(serverURL, `/api${path.startsWith('/') ? path : `/${path}`}`)
    if (!target) {
        throw new Error(`Refusing to call a path outside the Audiobookshelf server: ${path}`)
    }

    const request = await axios.get(target.toString(), {
        headers: {
            Authorization: `Bearer ${user.apiKey}`
        }
    })

    if (request.status !== 200) {
        throw new Error(`Error: ${request.status} ${request.statusText}`)
    }

    return request.data
}

export async function loginToAudiobookshelf(username: string, password: string): Promise<InternalUser | null> {
    try {
        const cachedToken = await getCachedToken(username, password)
        if (cachedToken) {
            if (isDevelopment) {
                console.log(`[DEBUG] Using cached token for user: ${username}`)
            }
            return {
                name: username,
                apiKey: cachedToken
            }
        }

        if (isDevelopment) {
            console.log(`[DEBUG] Attempting ABS login to: ${serverURL}/login`)
        }

        const response = await axios.post(`${serverURL}/login`, {
            username: username,
            password: password
        })

        if (isDevelopment) {
            console.log(`[DEBUG] ABS login response status: ${response.status}`)
        }

        if (response.status === 200 && response.data.user) {
            const userData = response.data.user
            if (isDevelopment) {
                console.log(`[DEBUG] ABS login successful for user: ${userData.username}`)
            }

            await setCachedToken(username, userData.accessToken, password)

            return {
                name: userData.username,
                apiKey: userData.accessToken
            }
        }
        return null
    } catch (error: any) {
        if (isDevelopment) {
            console.log(`[DEBUG] ABS login failed:`, error.response?.status, error.response?.data || error.message)
        } else {
            console.error('Login failed:', error.response?.status || error.message)
        }
        return null
    }
}

export async function proxyToAudiobookshelf(req: Request, res: Response) {
    if (isDevelopment) {
        console.log(`[DEBUG] Attempting ABS proxy for request: ${req.originalUrl}`)
    }

    if (!useProxy) {
        res.status(403).send('Forbidden')
        return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(405).send('Method Not Allowed')
        return
    }

    const target = resolveUpstreamURL(serverURL, req.originalUrl.replace(/^\/opds\/proxy/, ''))
    if (!target) {
        res.status(400).send('Invalid proxy target')
        return
    }

    try {
        const response = await axios.request({
            method: req.method,
            url: target.toString(),
            responseType: 'stream',
            headers: {
                'x-forwarded-proto': req.protocol,
                'x-forwarded-host': req.get('host') ?? ''
            },
            maxRedirects: 0,
            timeout: 15000,
            // Relay the body verbatim so the forwarded content-encoding and
            // content-length keep describing the bytes we actually send.
            decompress: false,
            validateStatus: () => true
        })

        res.status(response.status)
        copyResponseHeaders(response.headers, res)

        if (req.method === 'HEAD') {
            response.data.destroy?.()
            res.end()
            return
        }

        pipeUpstream(response.data, res)
    } catch (err) {
        if (isDevelopment) {
            console.error('[DEBUG] ABS proxy error:', err)
        }
        if (!res.headersSent) {
            res.status(502).send('Bad Gateway')
        } else {
            res.end()
        }
    }
}

function getQueryStringValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0]
    }

    return undefined
}

/** Headers that are strictly connection-scoped and must not be relayed onward. */
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
])

function copyResponseHeaders(
    responseHeaders: Record<string, any>,
    res: Response,
    additionalExcluded: readonly string[] = []
): void {
    const excluded = new Set(HOP_BY_HOP_HEADERS)
    for (const header of additionalExcluded) {
        excluded.add(header.toLowerCase())
    }

    for (const [key, value] of Object.entries(responseHeaders)) {
        if (value !== undefined && !excluded.has(key.toLowerCase())) {
            res.setHeader(key, value as any)
        }
    }
}

function pipeUpstream(stream: NodeJS.ReadableStream, res: Response): void {
    stream.pipe(res)
    stream.on('error', () => {
        if (!res.headersSent) {
            res.status(502)
        }
        res.end()
    })
}

export async function downloadItemFromAudiobookshelf(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(405).send('Method Not Allowed')
        return
    }

    if (!useProxy) {
        res.status(403).send('Forbidden')
        return
    }

    const token = getQueryStringValue(req.query.token)
    if (!token) {
        res.status(401).send('Authentication required')
        return
    }

    const itemId = getQueryStringValue(req.params.itemId)
    const filenameParam = getQueryStringValue(req.params.filename)
    if (!itemId || !filenameParam) {
        res.status(400).send('Invalid download request')
        return
    }

    const requestedFilename = sanitizeFilenameBase(filenameParam)
    const format = normalizeFormat(getQueryStringValue(req.query.format))
    const extension = getDownloadExtension(format)
    const filename = requestedFilename.toLowerCase().endsWith(`.${extension}`)
        ? requestedFilename
        : `${requestedFilename}.${extension}`
    const target = resolveUpstreamURL(serverURL, `/api/items/${encodeURIComponent(itemId)}/ebook`)
    if (!target) {
        res.status(400).send('Invalid download request')
        return
    }

    try {
        const response = await axios.request({
            method: req.method,
            url: target.toString(),
            responseType: 'stream',
            headers: {
                Authorization: `Bearer ${token}`
            },
            maxRedirects: 0,
            timeout: 15000,
            decompress: false,
            validateStatus: () => true
        })

        res.status(response.status)
        copyResponseHeaders(response.headers, res, ['content-disposition', 'content-type'])

        if (response.status >= 200 && response.status < 300) {
            res.setHeader('Content-Type', getDownloadMimeType(format))
            res.setHeader('Content-Disposition', buildContentDisposition(filename))
        }

        if (req.method === 'HEAD') {
            response.data.destroy?.()
            res.end()
            return
        }

        pipeUpstream(response.data, res)
    } catch (err) {
        if (isDevelopment) {
            console.error('[DEBUG] ABS download proxy error:', err)
        }
        if (!res.headersSent) {
            res.status(502).send('Bad Gateway')
        } else {
            res.end()
        }
    }
}
