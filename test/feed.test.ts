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
