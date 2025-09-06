import * as builder from 'xmlbuilder';
import {XMLNode} from "xmlbuilder";
import {Library, LibraryItem} from "../types/library";
import {serverURL} from "../index";
import {InternalUser} from "../types/internal";
import { Request } from 'express';

export function buildOPDSXMLSkeleton(id: string, title: string, entriesXML: XMLNode[], library?: Library, user?: InternalUser, request?: Request, endOfPage?: boolean): string {

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
        // Pagination
        const baseUrl = request.originalUrl.replace(/[?&]page=\d+/, '');
        const separator = baseUrl.includes('?') ? '&' : '?';
        xml.ele('link', {
            'rel': 'start',
            'type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
            'href': baseUrl
        });
        if (request.query.page && parseInt(request.query.page as string) > 0) {
            const prevPage = parseInt(request.query.page as string) - 1;
            xml.ele('link', {
                'rel': 'previous',
                'type': 'application/atom+xml; profile=opds-catalog; kind=acquisition',
                'href': baseUrl + (prevPage >= 1 ? `${separator}page=${prevPage}` : '')
            });
        }
        if (!endOfPage) {
            const nextPage = request.query.page ? parseInt(request.query.page as string) + 1 : 1;
            xml.ele('link', {
                'rel': 'next',
                'type': 'application/atom+xml; profile=opds-catalog; kind=acquisition',
                'href': baseUrl + `${separator}page=${nextPage}`
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
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${library.id}`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', library.id).up()
            .ele('title', `${library.name} (Categories)`).up()
            .ele('updated', new Date().toISOString()).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${library.id}?categories=true`}).up()
    ]);
}

export function buildCategoryEntries(libraryId: string, user: InternalUser): XMLNode[] {
    return [
        builder.create('entry', { headless: true })
            .ele('id', 'authors').up()
            .ele('title', `Authors`).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/authors`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'narrators').up()
            .ele('title', `Narrators`).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/narrators`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'genres').up()
            .ele('title', `Tags/Genres`).up()
            .ele('link', {'type': 'application/atom+xml;profile=opds-catalog', 'rel': 'subsection', 'href': `/opds/libraries/${libraryId}/genres`}).up(),
        builder.create('entry', { headless: true })
            .ele('id', 'series').up()
            .ele('title', `Series`).up()
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
            .ele('link', {'href': `${serverURL}/api/items/${item.id}/download?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/acquisition', 'type': 'application/octet-stream'}).up()
            .ele('link', {'href': `${serverURL}/api/items/${item.id}/ebook?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/acquisition', 'type': typeMap[item.format] || 'application/octet-stream'}).up()
            .ele('link', {'href': `${serverURL}/api/items/${item.id}/cover?token=${user.apiKey}`, 'rel': 'http://opds-spec.org/image'}).up()

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
        .ele('ShortName', 'ABS').up()
        .att('xmlns:atom', 'http://www.w3.org/2005/Atom')
        .ele('LongName', 'Audiobookshelf').up()
        .ele('Description', 'Search for books in Audiobookshelf').up()
        .ele('Url', {
            'type': 'application/atom+xml',
            'template': `/opds/libraries/${id}?q={searchTerms}&amp;author={atom:author}&amp;title={atom:title}`
        }).up()
        .end({ pretty: true });
}