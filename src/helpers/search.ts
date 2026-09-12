import { LibraryItem } from '../types/library.js'
import type { LibrarySearch } from '../types/search.js'

export const MAX_SEARCH_LENGTH = 512

export function containsIgnoreCase(value: string | undefined, query: string): boolean {
    return value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ?? false
}

function containsInValues(values: string[] | undefined, query: string): boolean {
    return values?.some((value) => containsIgnoreCase(value, query)) ?? false
}

export function filterLibraryItems(items: LibraryItem[], search: LibrarySearch): LibraryItem[] {
    let filteredItems = items

    if (search.q !== undefined || search.type !== undefined) {
        const query = search.type ? search.name ?? '' : search.q ?? ''

        filteredItems = filteredItems.filter((item) => {
            if (search.type === 'authors') {
                return containsInValues(item.authors?.map((author) => author.name), query)
            }

            if (search.type === 'narrators') {
                return containsInValues(item.narrators?.map((narrator) => narrator.name), query)
            }

            if (search.type === 'genres') {
                return containsInValues(item.genres, query) || containsInValues(item.tags, query)
            }

            if (search.type === 'series') {
                return containsInValues(item.series, query)
            }

            return (
                containsIgnoreCase(item.title, query) ||
                containsIgnoreCase(item.subtitle, query) ||
                containsIgnoreCase(item.description, query) ||
                containsIgnoreCase(item.publisher, query) ||
                containsIgnoreCase(item.isbn, query) ||
                containsIgnoreCase(item.language, query) ||
                containsIgnoreCase(item.publishedYear, query) ||
                containsInValues(item.authors?.map((author) => author.name), query) ||
                containsInValues(item.genres, query) ||
                containsInValues(item.tags, query)
            )
        })
    }

    if (search.author !== undefined) {
        filteredItems = filteredItems.filter((item) =>
            containsInValues(item.authors?.map((author) => author.name), search.author as string)
        )
    }

    if (search.title !== undefined) {
        filteredItems = filteredItems.filter(
            (item) =>
                containsIgnoreCase(item.title, search.title as string) ||
                containsIgnoreCase(item.subtitle, search.title as string)
        )
    }

    return filteredItems
}
