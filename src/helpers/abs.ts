import * as builder from 'xmlbuilder'
import { XMLNode } from 'xmlbuilder'
import { Library, LibraryItem } from '../types/library.js'
import { pageSize, serverURL, useProxy } from '../config.js'
import { OPDS_CATEGORY_TYPES, type OpdsCategory } from '../types/opds.js'
import { InternalUser } from '../types/internal.js'
import { Request } from 'express'
import localize from '../i18n/i18n.js'
import { buildDownloadFilename, getDownloadMimeType } from './download.js'
import { buildPageHref } from './paging.js'

function entryBase(id: string, title: string): XMLNode {
    // Atom requires id, title and updated on every entry (RFC 4287 section 4.1.2).
    return builder
        .create('entry', { headless: true })
        .ele('id', id)
        .up()
        .ele('title', title)
        .up()
        .ele('updated', new Date().toISOString())
        .up()
}

function navigationEntry(id: string, title: string, href: string): XMLNode {
    return entryBase(id, title)
        .ele('link', {
            type: 'application/atom+xml;profile=opds-catalog',
            rel: 'subsection',
            href
        })
        .up()
}

function slugify(value: string): string {
    return value.toLowerCase().replace(/\s+/g, '-')
}

export function buildOPDSXMLSkeleton(
    id: string,
    title: string,
    entriesXML: XMLNode[],
    library?: Library,
    user?: InternalUser,
    request?: Request,
    endOfPage?: boolean,
    totalItems?: number
): string {
    const xml = builder
        .create('feed', { version: '1.0', encoding: 'UTF-8' })
        .att('xmlns', 'http://www.w3.org/2005/Atom')
        .att('xmlns:opds', 'http://opds-spec.org/2010/catalog')
        .att('xmlns:dcterms', 'http://purl.org/dc/terms/')
        .att('xmlns:opensearch', 'http://a9.com/-/spec/opensearch/1.1/')
        .ele('id', id)
        .up()
        .ele('title', title)
        .up()
        .ele('authentication')
        .ele('type', 'http://opds-spec.org/auth/basic')
        .up()
        .ele('labels')
        .ele('login', 'Card')
        .up()
        .ele('password', 'PW')
        .up()
        .up()
        .up()
        .ele('updated', new Date().toISOString())
        .up()

    // If there are entries, append them using raw
    if (entriesXML && entriesXML.length > 0) {
        entriesXML.forEach((entry) => {
            xml.importDocument(entry)
        })
    }

    if (library && user && request) {
        xml.ele('link', {
            rel: 'alternate',
            type: 'text/html',
            title: 'Web Interface',
            href: `/library/${library.id}`
        })

        // Search
        xml.ele('link', {
            rel: 'search',
            type: 'application/opensearchdescription+xml',
            title: 'Search this library',
            href: `/opds/libraries/${library.id}/search-definition`
        })

        // Backfall search? Works with Moonreader
        xml.ele('link', {
            rel: 'search',
            type: 'application/atom+xml',
            title: 'Search this library',
            href: `/opds/libraries/${library.id}?q={searchTerms}`
        })

        const currentPage = Math.max(0, parseInt(request.query.page as string) || 0)

        // OpenSearch elements for pagination information
        if (totalItems !== undefined) {
            const startIndex = currentPage * pageSize + 1 // 1-based index for OpenSearch
            const itemsOnPage = Math.max(0, Math.min(pageSize, totalItems - currentPage * pageSize))

            xml.ele('opensearch:totalResults', totalItems.toString()).up()
            xml.ele('opensearch:startIndex', startIndex.toString()).up()
            xml.ele('opensearch:itemsPerPage', itemsOnPage.toString()).up()
        }

        const totalPages = totalItems !== undefined ? Math.ceil(totalItems / pageSize) : 0

        // First page link (start)
        xml.ele('link', {
            rel: 'start',
            type: 'application/atom+xml;profile=opds-catalog;kind=navigation',
            href: buildPageHref(request.originalUrl, 0)
        })

        // First page link for paged feeds
        xml.ele('link', {
            rel: 'first',
            type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
            href: buildPageHref(request.originalUrl, 0)
        })

        // Previous page link
        if (currentPage > 0) {
            xml.ele('link', {
                rel: 'previous',
                type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                href: buildPageHref(request.originalUrl, currentPage - 1)
            })
        }

        // Next page link
        if (!endOfPage) {
            xml.ele('link', {
                rel: 'next',
                type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                href: buildPageHref(request.originalUrl, currentPage + 1)
            })
        }

        // Last page link
        if (totalPages > 1) {
            xml.ele('link', {
                rel: 'last',
                type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                href: buildPageHref(request.originalUrl, totalPages - 1)
            })
        }
    }

    return xml.end({ pretty: true })
}

export function buildLibraryEntries(libraries: Library[], user: InternalUser): XMLNode[] {
    return libraries.map((library) =>
        navigationEntry(library.id, library.name, `/opds/libraries/${encodeURIComponent(library.id)}?categories=true`)
    )
}

export function buildCategoryEntries(
    libraryId: string,
    user: InternalUser,
    lang?: string | string[],
    enabledCategories: readonly OpdsCategory[] = OPDS_CATEGORY_TYPES
): XMLNode[] {
    const libraryPath = `/opds/libraries/${encodeURIComponent(libraryId)}`

    const entries: Record<OpdsCategory, () => XMLNode> = {
        all: () => navigationEntry(libraryId, localize('category.all', lang), libraryPath),
        recent: () => navigationEntry('recent', localize('category.recent', lang), `${libraryPath}?sort=recent`),
        authors: () => navigationEntry('authors', localize('category.authors', lang), `${libraryPath}/authors`),
        narrators: () => navigationEntry('narrators', localize('category.narrators', lang), `${libraryPath}/narrators`),
        genres: () => navigationEntry('genres', localize('category.genres', lang), `${libraryPath}/genres`),
        series: () => navigationEntry('series', localize('category.series', lang), `${libraryPath}/series`)
    }

    return enabledCategories.map((category) => entries[category]())
}

export function buildCardEntries(items: string[], type: string, user: InternalUser, libraryId: string): XMLNode[] {
    const libraryPath = `/opds/libraries/${encodeURIComponent(libraryId)}`

    return items.map((item) => {
        // encodeURIComponent, not encodeURI: names containing & # / + ? would
        // otherwise survive into the query string and be parsed as syntax.
        const query = new URLSearchParams({ name: item, type })
        return navigationEntry(slugify(item), item, `${libraryPath}?${query.toString()}`)
    })
}

export function buildCustomCardEntries(items: { item: string; link: string }[]): XMLNode[] {
    return items.map((item) => navigationEntry(slugify(item.item), item.item, item.link))
}

function buildEbookDownloadUrl(item: LibraryItem, user: InternalUser): string {
    if (!useProxy) {
        return `${serverURL}/api/items/${encodeURIComponent(item.id)}/ebook?token=${encodeURIComponent(user.apiKey)}`
    }

    const query = new URLSearchParams({
        format: item.format,
        token: user.apiKey
    })

    const filename = encodeURIComponent(buildDownloadFilename(item.title, item.format))

    return `/opds/proxy/download/${encodeURIComponent(item.id)}/${filename}?${query.toString()}`
}

export function buildItemEntries(libraryItems: LibraryItem[], user: InternalUser): XMLNode[] {
    const linkUrl = useProxy ? `/opds/proxy` : `${serverURL}`

    return libraryItems.map((item) => {
        const authors = item.authors
        const downloadUrl = item.format
            ? buildEbookDownloadUrl(item, user)
            : `${linkUrl}/api/items/${encodeURIComponent(item.id)}/download?token=${encodeURIComponent(user.apiKey)}`
        const coverUrl = `${linkUrl}/api/items/${encodeURIComponent(item.id)}/cover?token=${encodeURIComponent(user.apiKey)}`

        let xml = builder
            .create('entry', { headless: true })
            .ele('id', `urn:uuid:${item.id}`)
            .up()
            .ele('title', item.title)
            .up()
            .ele('subtitle', item.subtitle)
            .up()
            .ele('updated', new Date().toISOString())
            .up()
            .ele('content', { type: 'text' }, item.description)
            .up()
            .ele('publisher', item.publisher)
            .up()
            .ele('isbn', item.isbn)
            .up()
            .ele('published', item.publishedYear)
            .up()
            .ele('language', item.language)
            .up()
            .ele('link', {
                href: downloadUrl,
                rel: 'http://opds-spec.org/acquisition',
                type: item.format ? getDownloadMimeType(item.format) : 'application/octet-stream'
            })
            .up()
            .ele('link', {
                href: coverUrl,
                rel: 'http://opds-spec.org/image',
                type: 'image/webp'
            })
            .up()
            .ele('link', {
                href: coverUrl,
                rel: 'http://opds-spec.org/image',
                type: 'image/png'
            })
            .up()

        for (let author of authors) {
            xml.ele('author').ele('name', author.name).up().up()
        }
        for (let tag of [...item.genres, ...item.tags]) {
            xml.ele('category', { label: tag, term: tag }).up()
        }

        return xml
    })
}

export function buildSearchDefinition(id: string, user: InternalUser) {
    return builder
        .create('OpenSearchDescription', { version: '1.0', encoding: 'UTF-8' })
        .att('xmlns', 'http://a9.com/-/spec/opensearch/1.1/')
        .att('xmlns:atom', 'http://www.w3.org/2005/Atom')
        .ele('ShortName', 'ABS')
        .up()
        .ele('LongName', 'Audiobookshelf')
        .up()
        .ele('Description', 'Search for books in Audiobookshelf')
        .up()
        .ele('Url', {
            type: 'application/atom+xml;profile=opds-catalog;kind=acquisition',
            template: `/opds/libraries/${encodeURIComponent(id)}?q={searchTerms}&amp;author={atom:author}&amp;title={atom:title}`
        })
        .up()
        .end({ pretty: true })
}
