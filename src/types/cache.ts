export interface CacheEntry<T> {
    value: T
    expiresAt: number
}

export interface CachedToken {
    token: string
    userId?: string
}
