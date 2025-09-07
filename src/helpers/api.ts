import { InternalUser } from '../types/internal'
import type { Request, Response } from 'express'
import axios from 'axios'
import { serverURL, useProxy } from '../index'
import crypto from 'crypto'

interface CachedToken {
    hashedToken: string
    expires: number
}

const tokenCache = new Map<string, CachedToken>()
const CACHE_TTL = 10 * 60 * 1000 

// https://stackoverflow.com/questions/6953286/how-to-encrypt-data-that-needs-to-be-decrypted-in-node-js
function encryptTokenWithPassword(token: string, password: string): string {
    const key = crypto.scryptSync(password, 'salt', 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
}

function decryptToken(hashedToken: string, password: string): string {
    const [ivHex, encrypted] = hashedToken.split(':')
    const key = crypto.scryptSync(password, 'salt', 32)
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}

function getCachedToken(username: string, password: string): string | null {
    const cached = tokenCache.get(username)
    if (!cached || Date.now() > cached.expires) {
        if (cached) tokenCache.delete(username)
        return null
    }
    try {
        return decryptToken(cached.hashedToken, password)
    } catch {
        tokenCache.delete(username)
        return null
    }
}

function setCachedToken(username: string, token: string, password: string): void {
    const hashedToken = encryptTokenWithPassword(token, password)
    tokenCache.set(username, {
        hashedToken,
        expires: Date.now() + CACHE_TTL
    })
}

export async function apiCall(path: string, user: InternalUser) {
    const request = await axios.get(serverURL + '/api' + path, {
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
        const cachedToken = getCachedToken(username, password)
        if (cachedToken) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEBUG] Using cached token for user: ${username}`)
            }
            return {
                name: username,
                apiKey: cachedToken
            }
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Attempting ABS login to: ${serverURL}/login`)
        }

        const response = await axios.post(`${serverURL}/login`, {
            username: username,
            password: password
        })

        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ABS login response status: ${response.status}`)
        }

        if (response.status === 200 && response.data.user) {
            const userData = response.data.user
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEBUG] ABS login successful for user: ${userData.username}`)
            }
            
            setCachedToken(username, userData.accessToken, password)
            
            return {
                name: userData.username,
                apiKey: userData.accessToken
            }
        }
        return null
    } catch (error: any) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ABS login failed:`, error.response?.status, error.response?.data || error.message)
        } else {
            console.error('Login failed:', error.response?.status || error.message)
        }
        return null
    }
}

export async function proxyToAudiobookshelf(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] Attempting ABS proxy for request: ${req.originalUrl}`)
    }

    if (!useProxy) {
        res.status(403).send('Forbidden')
        return
    }

    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed')
        return
    }

    try {
        const target = new URL(req.originalUrl.replace(/^\/opds\/proxy/, ''), serverURL).toString()

        const response = await axios.get(target, {
            responseType: 'stream',
            headers: {
                'x-forwarded-proto': req.protocol,
                'x-forwarded-host': req.get('host') ?? ''
            },
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true
        })

        res.status(response.status)
        for (const [key, value] of Object.entries(response.headers)) {
            if (value !== undefined) {
                res.setHeader(key, value as any)
            }
        }

        response.data.pipe(res)
        response.data.on('error', () => {
            if (!res.headersSent) res.status(502)
            res.end()
        })
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[DEBUG] ABS proxy error:', err)
        }
        if (!res.headersSent) {
            res.status(502).send('Bad Gateway')
        } else {
            res.end()
        }
    }
}
