import { hash } from 'crypto'
import { InternalUser } from '../types/internal.js'

export function getLibraryItemsCacheKey(libraryId: string, user: InternalUser): string {
    const principal = user.id ? `abs:${user.id}` : `legacy:${user.name.toLocaleLowerCase()}`
    return `${hash('sha1', principal)}:${libraryId}`
}
