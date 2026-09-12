import { Author, LibraryItem } from '../types/library.js'

export const NAME_CATEGORIES = ['authors', 'narrators', 'genres', 'series'] as const
export type NameCategory = (typeof NAME_CATEGORIES)[number]

export function isNameCategory(value: unknown): value is NameCategory {
    return typeof value === 'string' && (NAME_CATEGORIES as readonly string[]).includes(value)
}

/**
 * Normalizes a raw query-string value into a comparable search term.
 * Returns undefined when there is nothing to match on.
 */
export function normalizeSearchTerm(value: unknown): string | undefined {
    const raw = typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''
    const trimmed = raw.trim().toLowerCase()
    return trimmed || undefined
}

/**
 * Case-insensitive substring test. Search terms are matched literally: they are
 * never compiled into a regular expression, so neither a malformed pattern nor a
 * pathologically backtracking one can reach the matcher.
 */
function fieldContains(value: unknown, term: string): boolean {
    if (value === undefined || value === null) {
        return false
    }
    return String(value).toLowerCase().includes(term)
}

function anyContains(values: readonly unknown[] | undefined, term: string): boolean {
    return Array.isArray(values) && values.some((value) => fieldContains(value, term))
}

function anyNameContains(values: readonly Author[] | undefined, term: string): boolean {
    return Array.isArray(values) && values.some((value) => fieldContains(value?.name, term))
}

export function matchesNameCategory(item: LibraryItem, category: NameCategory, term: string): boolean {
    switch (category) {
        case 'authors':
            return anyNameContains(item.authors, term)
        case 'narrators':
            return anyNameContains(item.narrators, term)
        case 'genres':
            return anyContains(item.genres, term) || anyContains(item.tags, term)
        case 'series':
            return anyContains(item.series, term)
    }
}

export function matchesFreeText(item: LibraryItem, term: string): boolean {
    return (
        fieldContains(item.title, term) ||
        fieldContains(item.subtitle, term) ||
        fieldContains(item.description, term) ||
        fieldContains(item.publisher, term) ||
        fieldContains(item.isbn, term) ||
        fieldContains(item.language, term) ||
        fieldContains(item.publishedYear, term) ||
        anyNameContains(item.authors, term) ||
        anyContains(item.genres, term) ||
        anyContains(item.tags, term)
    )
}

export function matchesAuthor(item: LibraryItem, term: string): boolean {
    return anyNameContains(item.authors, term)
}

export function matchesTitle(item: LibraryItem, term: string): boolean {
    return fieldContains(item.title, term) || fieldContains(item.subtitle, term)
}
