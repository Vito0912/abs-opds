import express, { Request, Response, NextFunction } from 'express'
import { InternalUser } from './types/internal.js'
import {
    buildCardEntries,
    buildCategoryEntries,
    buildCustomCardEntries,
    buildItemEntries,
    buildLibraryEntries,
    buildOPDSXMLSkeleton,
    buildSearchDefinition
} from './helpers/abs.js'
import { isOpdsCategory, isOpdsNameCategory, type OpdsCategory } from './types/opds.js'
import { apiCall, downloadItemFromAudiobookshelf, loginToAudiobookshelf, proxyToAudiobookshelf } from './helpers/api.js'
import {
    matchesAuthor,
    matchesFreeText,
    matchesNameCategory,
    matchesTitle,
    normalizeSearchTerm
} from './helpers/search.js'
import { Library, LibraryItem } from './types/library.js'
import { createHash, hash, timingSafeEqual } from 'crypto'
import { loadLocalizations } from './i18n/i18n.js'
import {
    cacheExpirationMs,
    enabledOPDSCategories,
    internalUsers,
    isDevelopment,
    pageSize,
    port,
    serverURL,
    showAudioBooks,
    showCharCards
} from './config.js'

const app = express()
app.disable('x-powered-by')

await loadLocalizations()

interface CacheEntry {
    timestamp: number
    data: any
}
const libraryItemsCache = new Map<string, CacheEntry>()

/** Strips combining diacritical marks so "Ä" and "A" group under the same letter. */
function stripDiacritics(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Express types route params as string | string[]; a repeated param would
 * otherwise flow into upstream paths as an array. Reject anything but a single value.
 */
function getRouteParam(req: Request, name: string, res: Response): string | null {
    const value = (req.params as Record<string, string | string[] | undefined>)[name]
    if (typeof value === 'string' && value) {
        return value
    }
    res.status(400).send('Invalid request')
    return null
}

function ensureOPDSCategoryIsEnabled(category: OpdsCategory, res: Response): boolean {
    if (enabledOPDSCategories.includes(category)) {
        return true
    }

    res.status(404).send('Category not found')
    return false
}

function getLibraryItemsCategory(req: Request): OpdsCategory | null {
    if (req.query.sort === 'recent') {
        return 'recent'
    }

    if (typeof req.query.type === 'string') {
        return isOpdsCategory(req.query.type) ? req.query.type : null
    }

    if (req.query.q || req.query.author || req.query.title) {
        return null
    }

    return 'all'
}

/**
 * Compares two secrets without leaking their contents through timing.
 * Both sides are hashed first so the comparison is over equal-length buffers.
 */
function secretsMatch(a: string, b: string): boolean {
    const digestA = createHash('sha256').update(a).digest()
    const digestB = createHash('sha256').update(b).digest()
    return timingSafeEqual(digestA, digestB)
}

function findInternalUser(username: string, password: string): InternalUser | undefined {
    let match: InternalUser | undefined

    // Every configured user is checked, with no early exit, so the response time
    // does not reveal which usernames exist.
    for (const user of internalUsers) {
        const nameMatches = secretsMatch(user.name.toLowerCase(), username.toLowerCase())
        const passwordMatches = secretsMatch(user.password ?? '', password)
        if (nameMatches && passwordMatches) {
            match = user
        }
    }

    return match
}

async function authenticateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization

    if (isDevelopment) {
        console.log(`[DEBUG] Auth attempt for ${req.method} ${req.path}`)
        console.log(`[DEBUG] Auth header present: ${!!authHeader}`)
    }

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        if (isDevelopment) {
            console.log('[DEBUG] No valid Basic Auth header found')
        }
        res.set('WWW-Authenticate', 'Basic realm="OPDS"')
        res.status(401).send('Authentication required')
        return
    }

    try {
        const base64Credentials = authHeader.split(' ')[1]
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8')
        const separatorIndex = credentials.indexOf(':')
        const username = separatorIndex === -1 ? '' : credentials.slice(0, separatorIndex)
        const password = separatorIndex === -1 ? '' : credentials.slice(separatorIndex + 1)

        if (!username || !password) {
            if (isDevelopment) {
                console.log('[DEBUG] Invalid credentials format')
            }
            res.set('WWW-Authenticate', 'Basic realm="OPDS"')
            res.status(401).send('Invalid credentials format')
            return
        }

        if (isDevelopment) {
            console.log(`[DEBUG] Attempting authentication for user: ${username}`)
        }

        // First try internal users (for backwards compatibility)
        const internalUser = findInternalUser(username, password)

        if (internalUser) {
            if (isDevelopment) {
                console.log(`[DEBUG] Internal user authenticated: ${username}`)
            }
            req.user = internalUser
            next()
            return
        }

        if (isDevelopment) {
            console.log(`[DEBUG] Trying Audiobookshelf authentication for: ${username}`)
        }

        const user = await loginToAudiobookshelf(username, password)
        if (user) {
            if (isDevelopment) {
                console.log(`[DEBUG] Audiobookshelf user authenticated: ${username}`)
            }
            req.user = user
            next()
            return
        }

        if (isDevelopment) {
            console.log(`[DEBUG] Authentication failed for user: ${username}`)
        }
        res.set('WWW-Authenticate', 'Basic realm="OPDS"')
        res.status(401).send('Invalid username or password')
        return
    } catch (error) {
        console.error('Authentication error:', error)
        res.set('WWW-Authenticate', 'Basic realm="OPDS"')
        res.status(401).send('Authentication failed')
        return
    }
}

declare global {
    namespace Express {
        interface Request {
            user?: InternalUser
        }
    }
}

app.get('/opds/proxy/download/:itemId/:filename', (req, res) => downloadItemFromAudiobookshelf(req, res))
app.get('/opds/proxy/{*any}', (req, res) => proxyToAudiobookshelf(req, res))

const parseItems = (items: any): LibraryItem[] => {
    const results: any[] = Array.isArray(items?.results) ? items.results : []

    return results
        .filter((item: any) => item?.media?.metadata)
        .map((item: any) => ({
            id: item.id,
            title: item.media.metadata.title,
            subtitle: item.media.metadata.subtitle,
            description: item.media.metadata.description,
            genres: item.media.metadata.genres || [],
            tags: item.media.metadata.tags || [],
            publisher: item.media.metadata.publisher,
            isbn: item.media.metadata.isbn,
            language: item.media.metadata.language,
            publishedYear: item.media.metadata.publishedYear,
            authors: item.media.metadata?.authorName
                ? item.media.metadata.authorName.split(',').map((author: string) => ({ name: author }))
                : [],
            narrators: item.media.metadata?.narratorName
                ? item.media.metadata.narratorName.split(',').map((narrator: string) => ({ name: narrator }))
                : [],
            series: item.media.metadata?.seriesName
                ? item.media.metadata?.seriesName.split(',').map((s: string) => s.replace(/#.*$/, '').trim()) || []
                : [],
            addedAt: item.addedAt,
            format: item.media.ebookFormat
        }))
        .filter((item: LibraryItem) => item.format !== undefined || showAudioBooks)
}

function getLibraryItemsCacheKey(libraryId: string, user: InternalUser): string {
    return `${hash('sha1', `${user.name}:${user.apiKey}`)}:${libraryId}`
}

/** Drops expired entries so the cache cannot grow without bound. */
function pruneLibraryItemsCache(): void {
    const now = Date.now()
    for (const [key, entry] of libraryItemsCache) {
        if (now - entry.timestamp >= cacheExpirationMs) {
            libraryItemsCache.delete(key)
        }
    }
}

async function getLibraryItems(libraryId: string, user: InternalUser) {
    pruneLibraryItemsCache()

    const cacheKey = getLibraryItemsCacheKey(libraryId, user)
    const cached = libraryItemsCache.get(cacheKey)
    if (cached) {
        return cached.data
    }

    const items = await apiCall(`/libraries/${encodeURIComponent(libraryId)}/items`, user)
    libraryItemsCache.set(cacheKey, { timestamp: Date.now(), data: items })
    return items
}

async function libraryHasVisibleItems(libraryId: string, user: InternalUser): Promise<boolean> {
    if (showAudioBooks) return true

    const items = await getLibraryItems(libraryId, user)
    return parseItems(items).length > 0
}

async function ensureLibraryIsVisible(libraryId: string, user: InternalUser, res: Response): Promise<boolean> {
    if (await libraryHasVisibleItems(libraryId, user)) {
        return true
    }

    res.status(404).send('Library not found')
    return false
}

const sortItemsByTitle = (items: LibraryItem[]): void => {
    items.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
}

app.get('/opds', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!

    const libraries = await apiCall(`/libraries`, user)
    const parsedLibaries: Library[] = libraries.libraries.map((library: any) => ({
        id: library.id,
        name: library.name,
        icon: library.icon
    }))
    const visibleLibraries = showAudioBooks
        ? parsedLibaries
        : (
              await Promise.all(
                  parsedLibaries.map(async (library) => ({
                      library,
                      visible: await libraryHasVisibleItems(library.id, user)
                  }))
              )
          )
              .filter(({ visible }) => visible)
              .map(({ library }) => library)

    //Skip listing libraries if only a single library is visible.
    if (visibleLibraries.length === 1) {
        const library = visibleLibraries[0]
        return res
            .type('application/xml')
            .send(
                buildOPDSXMLSkeleton(
                    `urn:uuid:${library.id}`,
                    `Categories`,
                    buildCategoryEntries(library.id, user, req.headers['accept-language'], enabledOPDSCategories)
                )
            )
    }

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            hash('sha1', user.name),
            `${user.name}'s Libraries`,
            buildLibraryEntries(visibleLibraries, user)
        )
    )
})

app.get('/opds/libraries/:libraryId', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!
    const lang = req.headers['accept-language']
    const libraryId = getRouteParam(req, 'libraryId', res)
    if (libraryId === null) {
        return
    }

    if (!(await ensureLibraryIsVisible(libraryId, user, res))) {
        return
    }

    if (req.query.categories) {
        res.type('application/xml').send(
            buildOPDSXMLSkeleton(
                `urn:uuid:${libraryId}`,
                `Categories`,
                buildCategoryEntries(libraryId, user, lang, enabledOPDSCategories)
            )
        )
        return
    }

    const requestedCategory = getLibraryItemsCategory(req)
    if (requestedCategory && !ensureOPDSCategoryIsEnabled(requestedCategory, res)) {
        return
    }

    const items = await getLibraryItems(libraryId, user)

    const library: Library = await apiCall(`/libraries/${encodeURIComponent(libraryId)}`, user)

    let parsedItems: LibraryItem[] = parseItems(items)

    // Sort based on recently added
    if (req.query.sort === 'recent') {
        parsedItems.sort((a, b) => {
            const dateA = new Date(a.addedAt || 0).getTime()
            const dateB = new Date(b.addedAt || 0).getTime()
            return dateB - dateA
        })
    }

    // Filter based on query, author, or title if provided. Search terms are
    // matched as literal substrings rather than compiled to regular expressions.
    const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined
    const nameTerm = normalizeSearchTerm(req.query.name)
    const queryTerm = normalizeSearchTerm(req.query.q)

    if (typeParam && isOpdsNameCategory(typeParam) && nameTerm) {
        parsedItems = parsedItems.filter((item) => matchesNameCategory(item, typeParam, nameTerm))
    } else if (queryTerm) {
        parsedItems = parsedItems.filter((item) => matchesFreeText(item, queryTerm))
    }

    const authorTerm = normalizeSearchTerm(req.query.author)
    if (authorTerm) {
        parsedItems = parsedItems.filter((item) => matchesAuthor(item, authorTerm))
    }

    const titleTerm = normalizeSearchTerm(req.query.title)
    if (titleTerm) {
        parsedItems = parsedItems.filter((item) => matchesTitle(item, titleTerm))
    }

    if (req.query.sort !== 'recent') {
        sortItemsByTitle(parsedItems)
    }

    // Pagination
    const page = Math.max(0, parseInt(req.query.page as string) || 0)
    const startIndex = Math.min(page * pageSize, parsedItems.length)
    const endIndex = Math.min(startIndex + pageSize, parsedItems.length)
    const paginatedItems = parsedItems.slice(startIndex, endIndex)
    const endOfPage = endIndex >= parsedItems.length

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            `urn:uuid:${libraryId}`,
            `${library.name}`,
            buildItemEntries(paginatedItems, user),
            library,
            user,
            req,
            endOfPage,
            parsedItems.length
        )
    )
})

app.get('/opds/libraries/:libraryId/search-definition', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!
    const libraryId = getRouteParam(req, 'libraryId', res)
    if (libraryId === null) {
        return
    }

    if (!(await ensureLibraryIsVisible(libraryId, user, res))) {
        return
    }

    res.type('application/xml').send(buildSearchDefinition(libraryId, user))
})

app.get('/opds/libraries/:libraryId/:type', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!
    const libraryId = getRouteParam(req, 'libraryId', res)
    if (libraryId === null) {
        return
    }

    if (!(await ensureLibraryIsVisible(libraryId, user, res))) {
        return
    }

    const category = req.params.type
    if (!isOpdsNameCategory(category)) {
        res.status(400).send('Invalid type')
        return
    }

    if (!ensureOPDSCategoryIsEnabled(category, res)) {
        return
    }

    const items = await getLibraryItems(libraryId, user)

    const library: Library = await apiCall(`/libraries/${encodeURIComponent(libraryId)}`, user)

    let parsedItems: LibraryItem[] = parseItems(items)

    let distinctType = new Set<string>()
    parsedItems.forEach((item: LibraryItem) => {
        if (category === 'authors') {
            item.authors.forEach((author) => distinctType.add(author.name.trim()))
        }
        if (category === 'narrators') {
            item.narrators.forEach((narrator) => distinctType.add(narrator.name.trim()))
        }
        if (category === 'genres') {
            item.genres.forEach((genre: string) => distinctType.add(genre.trim()))
            item.tags.forEach((tag: string) => distinctType.add(tag.trim()))
        }
        if (category === 'series') {
            item.series.forEach((series: string) => distinctType.add(series.trim()))
        }
    })

    let distinctTypeArray = Array.from(distinctType)

    // Sort authors alphabetically
    distinctTypeArray.sort((a, b) => a.localeCompare(b))

    //Group by normalized first letter, discard empty entries
    const countByStartLetter: Record<string, number> = Object.fromEntries(
        Object.entries(
            Object.groupBy(distinctTypeArray, (item) => {
                const normalizedStartLetter = stripDiacritics(item.charAt(0).toUpperCase())
                const isAtoZ = 'A' <= normalizedStartLetter && normalizedStartLetter <= 'Z'
                return isAtoZ ? normalizedStartLetter : ''
            })
        )
            .map(([letter, objects]) => [letter, objects?.length])
            .filter(([l, c]) => Boolean(l) && Boolean(c))
    )

    if (!req.query.start && showCharCards) {
        // Iterate trough countByStartLetter
        const itemCards: { item: string; link: string }[] = Object.entries(countByStartLetter).map(
            ([letter, count]) => ({
                item: `${letter.toUpperCase()} (${count})`,
                link: `/opds/libraries/${encodeURIComponent(library.id)}/${category}?start=${encodeURIComponent(letter.toLowerCase())}`
            })
        )

        res.type('application/xml').send(
            buildOPDSXMLSkeleton(`urn:uuid:${libraryId}`, `${library.name}`, buildCustomCardEntries(itemCards))
        )
        return
    }
    if (showCharCards) {
        const startLetterFilter = normalizeSearchTerm(req.query.start)
        distinctTypeArray = distinctTypeArray.filter(
            (item: string) => stripDiacritics(item.charAt(0).toLowerCase()) === startLetterFilter
        )
    }

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            `urn:uuid:${libraryId}`,
            `${library.name}`,
            buildCardEntries(distinctTypeArray, category, user, libraryId)
        )
    )
})

// Keep unexpected failures from leaking internals to OPDS clients.
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled request error:', error)
    if (!res.headersSent) {
        res.status(500).type('text/plain').send('Internal Server Error')
    } else {
        res.end()
    }
})

app.listen(port, () => {
    console.log(`OPDS server running at http://localhost:${port}/opds`)
    console.log(`OPDS authentication: HTTP Basic Auth`)
    console.log(`Server URL: ${serverURL}`)
})
