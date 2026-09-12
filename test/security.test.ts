import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveUpstreamURL } from '../src/helpers/upstream.js'
import { matchesFreeText, matchesNameCategory, normalizeSearchTerm } from '../src/helpers/search.js'
import { LibraryItem } from '../src/types/library.js'

const ABS = 'http://audiobookshelf.internal:3000'

const item = {
    id: 'i1',
    title: 'a+b (Deluxe)',
    subtitle: '',
    description: 'A story about C++ and other things',
    publisher: 'Acme',
    isbn: '123',
    publishedYear: '2020',
    language: 'en',
    authors: [{ name: 'Tom & Jerry' }],
    narrators: [{ name: 'Reader One' }],
    genres: ['Sci-Fi'],
    tags: ['favourite'],
    format: 'epub',
    series: ['Best Of'],
    addedAt: '2020-01-01'
} as LibraryItem

test('proxy target cannot escape the configured Audiobookshelf origin', () => {
    // A protocol-relative path such as "//evil.example" would otherwise replace
    // the base host entirely. Hostile input is neutralised onto the configured
    // origin (or rejected); it must never resolve to another host.
    const hostile = [
        '//evil.example/steal',
        '///evil.example/steal',
        '\\\\evil.example/steal',
        '/\\evil.example/steal',
        'https://evil.example/steal',
        '//user:pw@evil.example/steal',
        '//evil.example:8080/steal'
    ]

    for (const path of hostile) {
        const target = resolveUpstreamURL(ABS, path)
        assert.notEqual(target?.origin, 'https://evil.example', `${path} escaped the configured origin`)
        assert.ok(target === null || target.origin === ABS, `${path} resolved to ${target?.origin}`)
    }
})

test('proxy target resolves normal paths against the Audiobookshelf origin', () => {
    assert.equal(
        resolveUpstreamURL(ABS, '/api/items/abc/cover?token=x')?.toString(),
        `${ABS}/api/items/abc/cover?token=x`
    )
    // An encoded slash stays encoded and stays on-origin.
    assert.equal(resolveUpstreamURL(ABS, '/%2F%2Fevil.example')?.origin, ABS)
    // A base that carries a path prefix keeps it.
    assert.equal(resolveUpstreamURL('http://h:3000/abs', '/api/x')?.pathname, '/abs/api/x')
})

test('search terms are matched literally, never compiled as a regular expression', () => {
    assert.equal(matchesFreeText(item, normalizeSearchTerm('a+b')!), true, 'literal "a+b" should match the title')
    // As a regex, "a." would match "a+"; as a literal it must not.
    assert.equal(matchesFreeText(item, normalizeSearchTerm('a.b')!), false)
    assert.equal(matchesFreeText(item, normalizeSearchTerm('c++')!), true)
})

test('malformed and catastrophic patterns are inert rather than fatal', () => {
    for (const term of ['[', '(', '*', '(a+)+$', '([a-za-z ]+)+!']) {
        const started = Date.now()
        assert.doesNotThrow(() => matchesFreeText(item, normalizeSearchTerm(term)!))
        assert.ok(Date.now() - started < 250, `"${term}" should not stall the matcher`)
    }
})

test('name-category filters match the right field', () => {
    assert.equal(matchesNameCategory(item, 'authors', 'tom & jerry'), true)
    assert.equal(matchesNameCategory(item, 'narrators', 'tom & jerry'), false)
    assert.equal(matchesNameCategory(item, 'genres', 'favourite'), true, 'tags count as genres')
    assert.equal(matchesNameCategory(item, 'series', 'best of'), true)
})
