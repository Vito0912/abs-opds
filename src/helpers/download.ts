const MIME_TYPES_BY_FORMAT: Record<string, string> = {
    azw3: 'application/vnd.amazon.ebook',
    cb7: 'application/x-cb7',
    cbr: 'application/vnd.comicbook-rar',
    cbz: 'application/vnd.comicbook+zip',
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    pdf: 'application/pdf'
}

const FILENAME_EXTENSION_BY_FORMAT: Record<string, string> = {
    azw3: 'azw3',
    cb7: 'cb7',
    cbr: 'cbr',
    cbz: 'cbz',
    epub: 'epub',
    mobi: 'mobi',
    pdf: 'pdf'
}

const fallbackFilename = 'book'

export function normalizeFormat(format?: string): string | undefined {
    const normalizedFormat = format?.trim().toLowerCase()
    return normalizedFormat || undefined
}

export function getDownloadMimeType(format?: string): string {
    const normalizedFormat = normalizeFormat(format)

    return normalizedFormat
        ? MIME_TYPES_BY_FORMAT[normalizedFormat] || 'application/octet-stream'
        : 'application/octet-stream'
}

export function getDownloadExtension(format?: string): string {
    const normalizedFormat = normalizeFormat(format)
    return normalizedFormat ? FILENAME_EXTENSION_BY_FORMAT[normalizedFormat] || normalizedFormat : 'bin'
}

export function sanitizeFilenameBase(value?: string): string {
    const sanitizedValue = (value || fallbackFilename)
        .replace(/[\x00-\x1F<>:"/\\|?*]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')

    return (sanitizedValue || fallbackFilename).slice(0, 180)
}

export function buildDownloadFilename(title: string, format?: string): string {
    const extension = getDownloadExtension(format)
    const filenameBase = sanitizeFilenameBase(title)

    if (filenameBase.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
        return filenameBase
    }

    return `${filenameBase}.${extension}`
}

export function buildContentDisposition(filename: string): string {
    const fallback = filename
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[\\"]/g, '_')
        .trim()

    const asciiFilename = fallback || `${fallbackFilename}.${getDownloadExtension()}`
    const encodedFilename = encodeURIComponent(filename)
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A')

    return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
}
