import * as builder from 'xmlbuilder';
import {XMLNode} from "xmlbuilder";
import {Library, LibraryItem} from "../types/library";
import {serverURL, useProxy} from "../index";
import {InternalUser} from "../types/internal";
import { Request } from 'express';
import localize from '../i18n/i18n';

export function buildOPDSXMLSkeleton(id: string, title: string, entriesXML: XMLNode[], library?: Library, user?: InternalUser, request?: Request, endOfPage?: boolean, totalItems?: number): string {

    const xml = builder.create('feed', { version: '1.0', encoding: 'UTF-8' })
        .att('xmlns', 'http://www.w3.org/2005/Atom')
        .att('xmlns:opds', 'http://opds-spec.org/2010/catalog')
        .att('xmlns:dcterms', 'http://purl.org/dc/terms/')
        .att('xmlns:opensearch', 'http://a9.com/-/spec/opensearch/1.1/')
        .ele('id', id).up()
        .ele('title', title).up()
        .ele('authentication')
        .ele('type', 'http://opds-spec.org/auth/basic').up()
        .ele('labels')
        .ele('login', 'Card').up()
        .ele('password', 'PW').up().up().up()
        .ele('updated', new Date().toISOString()).up();

    // If there are entries, append them using raw
    if (entriesXML && entriesXML.length > 0) {
        entriesXML.forEach(entry => {
            xml.importDocument(entry);
        });
    }

    if(library && user && request) {
        xml.ele('link', {
            'rel': 'alternate',
            'type': 'text/html',
            'title': 'Web Interface',
            'href': `/library/${library.id}`
        })

        // Search
        xml.ele('link', {
            'rel': 'search',
            'type': 'application/opensearchdescription+xml',
            'title': 'Search this library',
            'href': `/opds/libraries/${library.id}/search-definition`
        })

        // Backfall search? Works with Moonreader
        xml.ele('link', {
            'rel': 'search',
            'type': 'application/atom+xml',
            'title': 'Search this library',
            'href': `/opds/libraries/${library.id}?q={searchTerms}`
        })
        
        // OpenSearch elements for pagination information
        if (totalItems !== undefined) {
            const pageSize = process.env.OPDS_PAGE_SIZE ? parseInt(process.env.OPDS_PAGE_SIZE) : 20;
            const currentPage = parseInt(request.query.page as string) || 0;
            const startIndex = currentPage * pageSize + 1; // 1-based index for OpenSearch
            
            xml.ele('opensearch:totalResults', totalItems.toString()).up();
            xml.ele('opensearch:startIndex', startIndex.toString()).up();
            xml.ele('opensearch:itemsPerPage', Math.min(pageSize, totalItems - (currentPage * pageSize)).toString()).up();
        }
        // Pagination
        const baseUrl = request.originalUrl.replace(/[?&]page=\d+/, '');
        const separator = baseUrl.includes('?') ? '&' : '?';
        const currentPage = parseInt(request.query.page as string) || 0;
        
        let totalPages = 0;
        if (totalItems !== undefined) {
            const pageSize = process.env.OPDS_PAGE_SIZE ? parseInt(process.env.OPDS_PAGE_SIZE) : 20;
            totalPages = Math.ceil(totalItems / pageSize);
        }
        
        // First page link (start)
        xml.ele('link', {
            'rel': 'start',
            'type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
            'href': baseUrl
        });
        
        // First page link for paged feeds
        xml.ele('link', {
            'rel': 'first',
            'type': 'application/atom+xml;profile=opds-catalog;kind=acquisition',
            'href': baseUrl
        });
        
        // Previous page link
        if (currentPage > 0) {
            const prevPage = currentPage - 1;
            xml.ele('link', {
                'rel': 'previous',
                'type': 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                'href': baseUrl + (prevPage > 0 ? `${separator}page=${prevPage}` : '')
            });
        }
        
        // Next page link
        if (!endOfPage) {
            const nextPage = currentPage + 1;
            xml.ele('link', {
                'rel': 'next',
                'type': 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                'href': baseUrl + `${separator}page=${nextPage}`
            });
        }
        
        // Last page link
        if (totalPages > 1) {
            const lastPage = totalPages - 1;
            xml.ele('link', {
                'rel': 'last',
                'type': 'application/atom+xml;profile=opds-catalog;kind=acquisition',
                'href': baseUrl + `${separator}page=${lastPage}`
            });
        }
    }

    return xml.end({ pretty: true });
}

export function buildLibraryEntries(libraries: Library[], user: InternalUser): XMLNode[] {
    // Create entries without XML declaration by using builder options
    return libraries.flatMap(library => [
        builder.create('entry', { headless: true })
            .ele('id', library.id).up()
            .ele('title', library.name).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${library.id}?categories=true`}).up()
    ]);
}

export function buildCategoryEntries(libraryId: string, user: InternalUser, lang?: string): XMLNode[] {
    return [
        builder.create('entry', { headless: true })
            .ele('id', libraryId).up()
            .ele('title', localize("category.all", lang)).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'authors').up()
            .ele('title', localize('category.authors', lang)).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/authors`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'narrators').up()
            .ele('title', localize('category.narrators', lang)).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/narrators`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'genres').up()
            .ele('title', localize('category.genres', lang)).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/genres`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'series').up()
            .ele('title', localize('category.series', lang)).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/series`}).up()
    ]

}

export function buildCardEntries(items: string[], type: string, user: InternalUser, libraryId: string): XMLNode[] {
    return items.map(item => {
        return builder.create('entry', { headless: true })
            .ele('id', item.toLowerCase().replace(' ', '-')).up()
            .ele('title', item).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}?name=${item}&type=${type}`}).up()
    });
}

export function buildCustomCardEntries(items: {item: string, link: string}[], type: string, user: InternalUser, libraryId: string): XMLNode[] {
    return items.map(item => {
        return builder.create('entry', { headless: true })
            .ele('id', item.item.toLowerCase().replace(' ', '-')).up()
            .ele('title', item.item).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': item.link}).up()
    });
}

export function buildItemEntries(libraryItems: LibraryItem[], user: InternalUser): XMLNode[] {

    const typeMap: Record<string, string> = {
        'audiobook': 'audio/mpeg',
        'epub': 'application/epub+zip',
        'pdf': 'application/pdf',
        'mobi': 'application/x-mobipocket-ebook'
    }

    const linkUrl = useProxy ? `/opds/proxy` : `${serverURL}`

    return libraryItems.map(item => {
        const authors = item.authors
        let xml = builder.create('entry', { headless: true })
            .ele('id', `urn:uuid:${item.id}`).up()
            .ele('title', item.title).up()
            .ele('subtitle', item.subtitle).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('content', {'type': 'text'}, item.description).up()
            .ele('publisher', item.publisher).up()
            .ele('isbn', item.isbn).up()
            .ele('published', (item.publishedYear)	).up()
            .ele('language', item.language).up()
            .ele('link', {'href': `${linkUrl}/api/items/${item.id}/download?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/acquisition', 'type': 'application/octet-stream'}).up()
            .ele('link', {'href': `${linkUrl}/api/items/${item.id}/ebook?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/acquisition', 'type': typeMap[item.format] || 'application/octet-stream'}).up()
            .ele('link', {'href': `${linkUrl}/api/items/${item.id}/cover?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/image', 'type': 'image/webp'}).up()
            .ele('link', {'href': `${linkUrl}/api/items/${item.id}/cover?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/image', 'type': 'image/png'}).up()

        for (let author of authors) {
            xml.ele('author').ele('name', author.name).up().up()
        }
        for (let tag of [...item.genres, ...item.tags]) {
            xml.ele('category', {'label': tag, 'term': tag}).up()
        }

        return xml;
    });
}

export function buildSearchDefinition(id: string, user: InternalUser) {
    return builder.create('OpenSearchDescription', { version: '1.0', encoding: 'UTF-8' })
        .att('xmlns', 'http://a9.com/-/spec/opensearch/1.1/')
        .att('xmlns:atom', 'http://www.w3.org/2005/Atom')
        .ele('ShortName', 'ABS').up()
        .ele('LongName', 'Audiobookshelf').up()
        .ele('Description', 'Search for books in Audiobookshelf').up()
        .ele('Url', {
            'type': 'application/atom+xml;profile=opds-catalog;kind=acquisition',
            'template': `/opds/libraries/${id}?q={searchTerms}&amp;author={atom:author}&amp;title={atom:title}`
        }).up()
        .end({ pretty: true });
}