/** Only used to resolve relative request URLs; never emitted. */
const URL_RESOLUTION_BASE = 'http://opds.invalid'

/**
 * Rewrites a request URL to point at the given page, preserving every other
 * query parameter.
 *
 * Parsing the URL rather than pattern-matching "page=N" keeps the remaining
 * parameters intact regardless of their order: stripping /[?&]page=\d+/ removed
 * the "?" along with the parameter whenever page came first, turning
 * "?page=2&sort=recent" into the malformed "&sort=recent".
 */
export function buildPageHref(originalUrl: string, page: number): string {
    let url: URL
    try {
        url = new URL(originalUrl, URL_RESOLUTION_BASE)
    } catch {
        return originalUrl
    }

    if (page > 0) {
        url.searchParams.set('page', String(page))
    } else {
        url.searchParams.delete('page')
    }

    const query = url.searchParams.toString()
    return url.pathname + (query ? `?${query}` : '')
}
