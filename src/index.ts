import express, { Request, Response, NextFunction } from 'express'
import { InternalUser } from './types/internal'
import 'dotenv/config'
import {
    buildCardEntries,
    buildCategoryEntries,
    buildCustomCardEntries,
    buildItemEntries,
    buildLibraryEntries,
    buildOPDSXMLSkeleton,
    buildSearchDefinition
} from './helpers/abs'
import { apiCall, loginToAudiobookshelf, proxyToAudiobookshelf } from './helpers/api'
import { Library, LibraryItem } from './types/library'
import { hash } from 'crypto'
import { loadLocalizations } from './i18n/i18n'

const app = express()
const port = process.env.PORT || 3010
export const useProxy = process.env.USE_PROXY === 'true' || false
export const serverURL = process.env.ABS_URL || 'http://localhost:3000'
const internalUsersString = process.env.OPDS_USERS || ''
const showAudioBooks = process.env.SHOW_AUDIOBOOKS === 'true' || false
const showCharCards = process.env.SHOW_CHAR_CARDS === 'true' || false
await loadLocalizations()

const internalUsers: InternalUser[] = internalUsersString.split(',').map((user) => {
    const [name, apiKey, password] = user.split(':')
    return { name, apiKey, password }
})

interface CacheEntry {
    timestamp: number
    data: any
}
const libraryItemsCache: Record<string, CacheEntry> = {}
const CACHE_EXPIRATION = 60 * 60 * 1000 // 1 hour in milliseconds

async function authenticateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization

    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] Auth attempt for ${req.method} ${req.path}`)
        console.log(`[DEBUG] Auth header present: ${!!authHeader}`)
    }

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        if (process.env.NODE_ENV === 'development') {
            console.log('[DEBUG] No valid Basic Auth header found')
        }
        res.set('WWW-Authenticate', 'Basic realm="OPDS"')
        res.status(401).send('Authentication required')
        return
    }

    try {
        const base64Credentials = authHeader.split(' ')[1]
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
        const [username, password] = credentials.split(':')

        if (!username || !password) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[DEBUG] Invalid credentials format')
            }
            res.set('WWW-Authenticate', 'Basic realm="OPDS"')
            res.status(401).send('Invalid credentials format')
            return
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Attempting authentication for user: ${username}`)
        }

        // First try internal users (for backwards compatibility)
        const internalUser = internalUsers.find(
            (u) => u.name.toLowerCase() === username.toLowerCase() && u.password === password
        )

        if (internalUser) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEBUG] Internal user authenticated: ${username}`)
            }
            req.user = internalUser
            next()
            return
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Trying Audiobookshelf authentication for: ${username}`)
        }

        const user = await loginToAudiobookshelf(username, password)
        if (user) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEBUG] Audiobookshelf user authenticated: ${username}`)
            }
            req.user = user
            next()
            return
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Authentication failed for user: ${username}`)
        }
        res.set('WWW-Authenticate', 'Basic realm="OPDS"')
        res.status(401).send('Invalid username or password')
        return
    } catch (error) {
        console.error('Authentication error:', error)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] Authentication exception: ${error}`)
        }
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

app.get('/opds/proxy/{*any}', (req, res) => proxyToAudiobookshelf(req, res))

const parseItems = (items: any): LibraryItem[] =>
    items.results
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
            format: item.media.ebookFormat
        }))
        .filter((item: LibraryItem) => item.format !== undefined || showAudioBooks)

app.get('/opds', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!

    const libraries = await apiCall(`/libraries`, user)
    const parsedLibaries: Library[] = libraries.libraries.map((library: any) => ({
        id: library.id,
        name: library.name,
        icon: library.icon
    }))

    //Skip listing libraries and redirect to the first library if only a single library is configured
    if (parsedLibaries.length === 1) {
        return res.redirect(`/opds/libraries/${parsedLibaries[0].id}?categories=true`)
    }

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            hash('sha1', user.name),
            `${user.name}'s Libraries`,
            buildLibraryEntries(parsedLibaries, user)
        )
    )
})

app.get('/opds/libraries/:libraryId', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!
    const lang = req.headers['accept-language']

    if (req.query.categories) {
        res.type('application/xml').send(
            buildOPDSXMLSkeleton(
                `urn:uuid:${req.params.libraryId}`,
                `Categories`,
                buildCategoryEntries(req.params.libraryId, user, lang)
            )
        )
        return
    }

    const cacheKey = `${req.params.libraryId}`
    let items

    if (libraryItemsCache[cacheKey] && Date.now() - libraryItemsCache[cacheKey].timestamp < CACHE_EXPIRATION) {
        items = libraryItemsCache[cacheKey].data
    } else {
        items = await apiCall(`/libraries/${req.params.libraryId}/items`, user)
        libraryItemsCache[cacheKey] = { timestamp: Date.now(), data: items }
    }

    const library: Library = await apiCall(`/libraries/${req.params.libraryId}`, user)

    let parsedItems: LibraryItem[] = parseItems(items)

    // Filter based on query, author, or title if provided
    if (req.query.q || req.query.type) {
        const query = req.query.q as string
        const search = new RegExp(query, 'i')
        parsedItems = parsedItems.filter((item: LibraryItem) => {
            if (req.query.type === 'authors') {
                return (
                    item.authors &&
                    item.authors.some((author: any) => author.name.match(new RegExp(req.query.name as string, 'i')))
                )
            } else if (req.query.type === 'narrators') {
                return (
                    item.narrators &&
                    item.narrators.some((author: any) => author.name.match(new RegExp(req.query.name as string, 'i')))
                )
            } else if (req.query.type === 'genres') {
                return (
                    (item.genres &&
                        item.genres.some((genre: any) => genre.match(new RegExp(req.query.name as string, 'i')))) ||
                    (item.tags && item.tags.some((tag: any) => tag.match(new RegExp(req.query.name as string, 'i'))))
                )
            } else if (req.query.type === 'series') {
                return (
                    item.series &&
                    item.series.some((series: any) => series.match(new RegExp(req.query.name as string, 'i')))
                )
            } else {
                return (
                    (item.title && item.title.match(search)) ||
                    (item.subtitle && item.subtitle.match(search)) ||
                    (item.description && item.description.match(search)) ||
                    (item.publisher && item.publisher.match(search)) ||
                    (item.isbn && item.isbn.match(search)) ||
                    (item.language && item.language.match(search)) ||
                    (item.publishedYear && item.publishedYear.match(search)) ||
                    (item.authors && item.authors.some((author: any) => author.name.match(search))) ||
                    (item.genres && item.genres.some((genre: any) => genre.match(search))) ||
                    (item.tags && item.tags.some((tag: any) => tag.match(search)))
                )
            }
        })
    }
    if (req.query.author) {
        const author = req.query.author as string
        const search = new RegExp(author, 'i')
        parsedItems = parsedItems.filter(
            (item: LibraryItem) => item.authors && item.authors.some((a: any) => a.name.match(search))
        )
    }
    if (req.query.title) {
        const title = req.query.title as string
        const search = new RegExp(title, 'i')
        parsedItems = parsedItems.filter(
            (item: LibraryItem) =>
                (item.title && item.title.match(search)) || (item.subtitle && item.subtitle.match(search))
        )
    }

    // Pagination
    const page = parseInt(req.query.page as string) || 0
    const pageSize = process.env.OPDS_PAGE_SIZE ? parseInt(process.env.OPDS_PAGE_SIZE) : 20
    const startIndex = page * pageSize
    const endIndex = Math.min(startIndex + pageSize, parsedItems.length)
    const paginatedItems = parsedItems.slice(startIndex, endIndex)
    const endOfPage = endIndex >= parsedItems.length

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            `urn:uuid:${req.params.libraryId}`,
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

    res.type('application/xml').send(buildSearchDefinition(req.params.libraryId, user))
})

app.get('/opds/libraries/:libraryId/:type', authenticateUser, async (req: Request, res: Response) => {
    const user = req.user!

    if (
        req.params.type !== 'authors' &&
        req.params.type !== 'narrators' &&
        req.params.type !== 'genres' &&
        req.params.type !== 'series'
    ) {
        res.status(400).send('Invalid type')
        return
    }

    const cacheKey = `${req.params.libraryId}`
    let items

    if (libraryItemsCache[cacheKey] && Date.now() - libraryItemsCache[cacheKey].timestamp < CACHE_EXPIRATION) {
        items = libraryItemsCache[cacheKey].data
    } else {
        items = await apiCall(`/libraries/${req.params.libraryId}/items`, user)
        libraryItemsCache[cacheKey] = { timestamp: Date.now(), data: items }
    }

    const library: Library = await apiCall(`/libraries/${req.params.libraryId}`, user)

    let parsedItems: LibraryItem[] = parseItems(items)

    let distinctType = new Set<string>()
    parsedItems.forEach((item: LibraryItem) => {
        if (req.params.type === 'authors') {
            item.authors.forEach((author: any) => {
                distinctType.add(author.name.trim())
            })
        }
        if (req.params.type === 'narrators') {
            item.narrators.forEach((narrator: any) => {
                distinctType.add(narrator.name.trim())
            })
        }
        if (req.params.type === 'genres') {
            item.genres.forEach((genre: any) => {
                distinctType.add(genre.trim())
            })
            item.tags.forEach((tag: any) => {
                distinctType.add(tag.trim())
            })
        }
        if (req.params.type === 'series') {
            item.series.forEach((series: any) => {
                distinctType.add(series.trim())
            })
        }
    })

    let distinctTypeArray = Array.from(distinctType)

    // Sort authors alphabetically
    distinctTypeArray.sort((a, b) => a.localeCompare(b))

    //Group by normalized first letter, discard empty entries
    const countByStartLetter: Record<string, number> = Object.fromEntries(
        Object.entries(
            Object.groupBy(distinctTypeArray, (item) => {
                const startLetter = item.charAt(0).toUpperCase()
                const normalizedStartLetter = startLetter.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
                link: `/opds/libraries/${library.id}/${req.params.type}?start=${letter.toLowerCase()}`
            })
        )

        res.type('application/xml').send(
            buildOPDSXMLSkeleton(
                `urn:uuid:${req.params.libraryId}`,
                `${library.name}`,
                buildCustomCardEntries(itemCards, req.params.type, user, req.params.libraryId)
            )
        )
        return
    }
    if (showCharCards) {
        distinctTypeArray = distinctTypeArray.filter((item: string) => {
            const startLetter = item.charAt(0).toLowerCase()
            const normalizedStartLetter = startLetter.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            return normalizedStartLetter === req.query.start
        })
    }

    res.type('application/xml').send(
        buildOPDSXMLSkeleton(
            `urn:uuid:${req.params.libraryId}`,
            `${library.name}`,
            buildCardEntries(distinctTypeArray, req.params.type, user, req.params.libraryId)
        )
    )
})

app.listen(port, () => {
    console.log(`OPDS server running at http://localhost:${port}/opds`)
    console.log(`OPDS authentication: HTTP Basic Auth`)
    console.log(`Server URL: ${serverURL}`)
})
