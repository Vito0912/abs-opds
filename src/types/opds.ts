export const OPDS_CATEGORY_TYPES = ['all', 'recent', 'authors', 'narrators', 'genres', 'series'] as const
export type OpdsCategory = (typeof OPDS_CATEGORY_TYPES)[number]

/** Categories that list distinct names rather than library items directly. */
export const OPDS_NAME_CATEGORY_TYPES = ['authors', 'narrators', 'genres', 'series'] as const
export type OpdsNameCategory = (typeof OPDS_NAME_CATEGORY_TYPES)[number]

export function isOpdsCategory(value: unknown): value is OpdsCategory {
    return typeof value === 'string' && (OPDS_CATEGORY_TYPES as readonly string[]).includes(value)
}

export function isOpdsNameCategory(value: unknown): value is OpdsNameCategory {
    return typeof value === 'string' && (OPDS_NAME_CATEGORY_TYPES as readonly string[]).includes(value)
}
