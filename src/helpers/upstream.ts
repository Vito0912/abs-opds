/**
 * Resolves a request path against the configured Audiobookshelf server.
 *
 * Returns null when the result would leave that origin. A path such as
 * "//attacker.example" is a protocol-relative URL and would otherwise replace
 * the base host entirely, turning the proxy into an open server-side request
 * forwarder, so leading separators are collapsed and the origin is re-checked.
 *
 * The base is taken as an argument rather than read from module state so this
 * can be exercised directly by tests.
 */
export function resolveUpstreamURL(baseUrl: string, pathAndQuery: string): URL | null {
    let base: URL
    try {
        base = new URL(baseUrl)
    } catch {
        return null
    }

    const basePath = base.pathname.replace(/\/+$/, '')
    const relativePath = '/' + pathAndQuery.replace(/^[/\\]+/, '')

    let target: URL
    try {
        target = new URL(basePath + relativePath, base)
    } catch {
        return null
    }

    return target.origin === base.origin ? target : null
}
