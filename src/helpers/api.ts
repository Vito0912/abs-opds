import { InternalUser } from '../types/internal.js'
import type { Request, Response } from 'express'
import axios from 'axios'
import { absURL, isDevelopment, serverURL, useProxy } from '../config.js'
import { getCachedToken, setCachedToken } from './cache.js'
import type { ABSLoginResponse } from '../types/abs.js'
import {
    buildContentDisposition,
    getDownloadExtension,
    getDownloadMimeType,
    normalizeFormat,
    sanitizeFilenameBase
} from './download.js'

export async function apiCall<T>(path: string, user: InternalUser): Promise<T> {
    const request = await axios.get(serverURL + '/api' + path, {
        headers: {
            Authorization: `Bearer ${user.apiKey}`
        }
    })

    if (request.status !== 200) {
        throw new Error(`Error: ${request.status} ${request.statusText}`)
    }

    return request.data as T
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
                apiKey: cachedToken.token,
                id: cachedToken.userId
            }
        }

        if (isDevelopment) {
            console.log(`[DEBUG] Attempting ABS login to: ${serverURL}/login`)
        }

        const response = await axios.post<ABSLoginResponse>(`${serverURL}/login`, {
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

            await setCachedToken(username, userData.accessToken, password, userData.id)

            return {
                name: userData.username,
                apiKey: userData.accessToken,
                id: userData.id
            }
        }
        return null
    } catch (error: unknown) {
        const axiosResponse = axios.isAxiosError(error) ? error.response : undefined
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (isDevelopment) {
            console.log(`[DEBUG] ABS login failed:`, axiosResponse?.status, axiosResponse?.data || errorMessage)
        } else {
            console.error('Login failed:', axiosResponse?.status || errorMessage)
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

    if (req.method !== 'GET') {
        res.status(405).send('Method Not Allowed')
        return
    }

    if (!req.user) {
        res.status(401).send('Authentication required')
        return
    }

    try {
        const proxyPath = req.originalUrl.replace(/^\/opds\/proxy/, '') || '/'
        const normalizedPath = proxyPath.replace(/^[\\/]+/, '')
        const targetURL = new URL(`/${normalizedPath}`, absURL.origin)

        if (targetURL.origin !== absURL.origin) {
            res.status(400).send('Invalid proxy target')
            return
        }

        targetURL.searchParams.set('token', req.user.apiKey)

        const response = await axios.get(targetURL.toString(), {
            responseType: 'stream',
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true
        })

        res.status(response.status)
        for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
                res.setHeader(key, value)
            }
        }

        response.data.pipe(res)
        response.data.on('error', () => {
            if (!res.headersSent) res.status(502)
            res.end()
        })
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

export async function proxyCoverToAudiobookshelf(req: Request, res: Response) {
    if (!useProxy) {
        res.status(403).send('Forbidden')
        return
    }

    const itemIdParam = getQueryStringValue(req.params.itemId)
    if (!itemIdParam) {
        res.status(400).send('Invalid cover request')
        return
    }

    const itemId = encodeURIComponent(itemIdParam)
    const targetURL = new URL(`/api/items/${itemId}/cover`, absURL.origin)

    try {
        const response = await axios.get(targetURL.toString(), {
            responseType: 'stream',
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true
        })

        res.status(response.status)

        for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
                res.setHeader(key, value)
            }
        }

        response.data.pipe(res)
        response.data.on('error', () => {
            if (!res.headersSent) res.status(502)
            res.end()
        })
    } catch (err) {
        if (isDevelopment) {
            console.error('[DEBUG] ABS cover proxy error:', err)
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

function setProxyHeaders(responseHeaders: Record<string, any>, res: Response): void {
    const excludedHeaders = new Set([
        'connection',
        'content-disposition',
        'content-type',
        'keep-alive',
        'transfer-encoding'
    ])

    for (const [key, value] of Object.entries(responseHeaders)) {
        if (value !== undefined && !excludedHeaders.has(key.toLowerCase())) {
            res.setHeader(key, value as any)
        }
    }
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

    if (!req.user) {
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
    const target = new URL(`/api/items/${encodeURIComponent(itemId)}/ebook`, serverURL).toString()

    try {
        const response = await axios.request({
            method: req.method,
            url: target,
            responseType: 'stream',
            headers: {
                Authorization: `Bearer ${req.user.apiKey}`
            },
            maxRedirects: 0,
            timeout: 15000,
            validateStatus: () => true
        })

        res.status(response.status)
        setProxyHeaders(response.headers, res)

        if (response.status >= 200 && response.status < 300) {
            res.setHeader('Content-Type', getDownloadMimeType(format))
            res.setHeader('Content-Disposition', buildContentDisposition(filename))
        }

        if (req.method === 'HEAD') {
            res.end()
            return
        }

        response.data.pipe(res)
        response.data.on('error', () => {
            if (!res.headersSent) res.status(502)
            res.end()
        })
    } catch (err) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[DEBUG] ABS download proxy error:', err)
        }
        if (!res.headersSent) {
            res.status(502).send('Bad Gateway')
        } else {
            res.end()
        }
    }
}
