import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPageHref } from '../src/helpers/paging.js'

test('page links preserve sibling query parameters whatever their order', () => {
    // Stripping /[?&]page=\d+/ removed the "?" when page came first, producing
    // "/opds/libraries/L1&sort=recent?page=3".
    const first = buildPageHref('/opds/libraries/L1?page=2&sort=recent', 3)
    const parsed = new URL(first, 'http://x.invalid')
    assert.equal(parsed.pathname, '/opds/libraries/L1')
    assert.equal(parsed.searchParams.get('page'), '3')
    assert.equal(parsed.searchParams.get('sort'), 'recent')

    const last = buildPageHref('/opds/libraries/L1?q=foo&page=2', 3)
    assert.equal(new URL(last, 'http://x.invalid').searchParams.get('q'), 'foo')
})

test('page 0 drops the parameter rather than emitting page=0', () => {
    assert.equal(buildPageHref('/opds/libraries/L1?page=2&sort=recent', 0), '/opds/libraries/L1?sort=recent')
    assert.equal(buildPageHref('/opds/libraries/L1?page=2', 0), '/opds/libraries/L1')
    assert.equal(buildPageHref('/opds/libraries/L1', 0), '/opds/libraries/L1')
})

test('names containing query-string syntax survive a round trip through the link', () => {
    for (const name of ['Tom & Jerry', 'AC/DC', 'Alice #1', 'C++ Primer', 'a?b=c']) {
        const query = new URLSearchParams({ name, type: 'authors' })
        const parsed = new URL(`/opds/libraries/L1?${query}`, 'http://x.invalid')
        assert.deepEqual([...parsed.searchParams.keys()].sort(), ['name', 'type'])
        assert.equal(parsed.searchParams.get('name'), name)
    }
})

// The config module reads the environment at import time, so set it before the
// modules under test are pulled in. Now that config is separate from index.ts,
// importing a helper no longer starts the HTTP server.
process.env.ABS_URL = 'http://audiobookshelf.internal:3000'

const { buildCardEntries, buildOPDSXMLSkeleton, buildCategoryEntries } = await import('../src/helpers/abs.js')

test('every entry carries the <updated> element Atom requires', () => {
    const entries = buildCategoryEntries('L1', { name: 'u', apiKey: 'k' })
    assert.equal(entries.length, 6)
    for (const entry of entries) {
        assert.match(entry.end(), /<updated>/, 'category entry is missing <updated>')
    }
})

test('card links encode names that contain query-string syntax', () => {
    const xml = buildCardEntries(['Tom & Jerry', 'AC/DC', 'Alice #1'], 'authors', { name: 'u', apiKey: 'k' }, 'L1')
    // Attribute values are XML-escaped on the way out; decode before parsing.
    const hrefs = xml.map((entry) => (/href="([^"]+)"/.exec(entry.end())?.[1] ?? '').replace(/&amp;/g, '&'))

    for (const href of hrefs) {
        const parsed = new URL(href, 'http://x.invalid')
        assert.deepEqual([...parsed.searchParams.keys()].sort(), ['name', 'type'])
        assert.equal(parsed.searchParams.get('type'), 'authors')
    }
    assert.equal(new URL(hrefs[0], 'http://x.invalid').searchParams.get('name'), 'Tom & Jerry')
    assert.equal(new URL(hrefs[1], 'http://x.invalid').searchParams.get('name'), 'AC/DC')
    assert.equal(new URL(hrefs[2], 'http://x.invalid').searchParams.get('name'), 'Alice #1')
})

test('pagination links in a rendered feed keep sibling parameters', () => {
    const feed = buildOPDSXMLSkeleton(
        'id',
        'title',
        [],
        { id: 'L1', name: 'Books', icon: 'book' },
        { name: 'u', apiKey: 'k' },
        { originalUrl: '/opds/libraries/L1?page=2&sort=recent', query: { page: '2' } } as any,
        false,
        100
    )

    const next = (/rel="next"[^>]*href="([^"]+)"/.exec(feed)?.[1] ?? '').replace(/&amp;/g, '&')
    const parsed = new URL(next, 'http://x.invalid')
    assert.equal(parsed.pathname, '/opds/libraries/L1')
    assert.equal(parsed.searchParams.get('page'), '3')
    assert.equal(parsed.searchParams.get('sort'), 'recent')
})
