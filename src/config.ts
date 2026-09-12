import 'dotenv/config'
import { InternalUser } from './types/internal.js'
import { OPDS_CATEGORY_TYPES, isOpdsCategory, type OpdsCategory } from './types/opds.js'

function readBooleanEnv(name: string, fallback: boolean): boolean {
    const raw = process.env[name]?.trim().toLowerCase()
    if (!raw) {
        return fallback
    }
    if (raw === 'true' || raw === '1' || raw === 'yes') {
        return true
    }
    if (raw === 'false' || raw === '0' || raw === 'no') {
        return false
    }
    console.warn(`Ignoring invalid boolean value "${raw}" for ${name}; using ${fallback}`)
    return fallback
}

/**
 * Reads a positive integer, falling back when the value cannot be parsed.
 * parseInt previously turned a typo into NaN, which silently disabled caching
 * (every freshness comparison against NaN is false) rather than erroring.
 */
function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim()
    if (!raw) {
        return fallback
    }
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        console.warn(`Ignoring invalid value "${raw}" for ${name}; using ${fallback}`)
        return fallback
    }
    return parsed
}

function readServerURL(): string {
    const raw = process.env.ABS_URL?.trim() || 'http://localhost:3000'
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        throw new Error(`ABS_URL is not a valid URL: "${raw}"`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`ABS_URL must use http or https, got "${parsed.protocol}"`)
    }
    // Drop any trailing slash so callers can append paths unambiguously.
    return parsed.toString().replace(/\/+$/, '')
}

function parseInternalUsers(value?: string): InternalUser[] {
    if (!value?.trim()) {
        return []
    }

    const users: InternalUser[] = []
    for (const entry of value.split(',')) {
        if (!entry.trim()) {
            continue
        }
        const [name, apiKey, password] = entry.split(':')
        if (!name || !apiKey || !password) {
            console.warn('Ignoring malformed OPDS_USERS entry; expected "username:ABS_API_TOKEN:password"')
            continue
        }
        users.push({ name, apiKey, password })
    }

    return users
}

function parseOPDSCategories(value?: string): OpdsCategory[] {
    if (!value?.trim()) {
        return [...OPDS_CATEGORY_TYPES]
    }

    const categories: OpdsCategory[] = []
    for (const category of value.split(',')) {
        const normalizedCategory = category.trim().toLowerCase()
        if (isOpdsCategory(normalizedCategory)) {
            if (!categories.includes(normalizedCategory)) {
                categories.push(normalizedCategory)
            }
        } else if (normalizedCategory) {
            console.warn(`Ignoring unknown OPDS category "${normalizedCategory}"`)
        }
    }

    return categories
}

export const port = readPositiveIntEnv('PORT', 3010)
export const serverURL = readServerURL()
export const useProxy = readBooleanEnv('USE_PROXY', false)
export const showAudioBooks = readBooleanEnv('SHOW_AUDIOBOOKS', false)
export const showCharCards = readBooleanEnv('SHOW_CHAR_CARDS', false)
export const pageSize = readPositiveIntEnv('OPDS_PAGE_SIZE', 20)
export const cacheExpirationMs = readPositiveIntEnv('CACHE_EXPIRATION', 60 * 60) * 1000
export const internalUsers = parseInternalUsers(process.env.OPDS_USERS)
export const enabledOPDSCategories = parseOPDSCategories(process.env.OPDS_CATEGORIES)
export const isDevelopment = process.env.NODE_ENV === 'development'
