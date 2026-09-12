import 'dotenv/config'

export const nodeEnv = process.env.NODE_ENV
export const isDevelopment = nodeEnv === 'development'
export const isTest = nodeEnv === 'test'
export const port = process.env.PORT || 3010
export const opdsUsers = process.env.OPDS_USERS || ''
export const showAudioBooks = process.env.SHOW_AUDIOBOOKS === 'true'
export const showCharCards = process.env.SHOW_CHAR_CARDS === 'true'
export const opdsCategories = process.env.OPDS_CATEGORIES
export const opdsPageSize = process.env.OPDS_PAGE_SIZE ? parseInt(process.env.OPDS_PAGE_SIZE) : 20

export const absURL = new URL(process.env.ABS_URL || 'https://audiobooks.dev')
export const serverURL = absURL.toString().replace(/\/$/, '')
export const useProxy = process.env.USE_PROXY === 'true'

export const DEFAULT_CACHE_EXPIRATION = 3600

export function parseCacheExpiration(value: string | undefined): number {
    if (value === undefined || value.trim() === '') {
        return DEFAULT_CACHE_EXPIRATION
    }

    const cacheExpiration = Number(value)

    return Number.isFinite(cacheExpiration) && cacheExpiration >= 0 ? cacheExpiration : DEFAULT_CACHE_EXPIRATION
}

export const cacheExpirationSeconds = parseCacheExpiration(process.env.CACHE_EXPIRATION)
