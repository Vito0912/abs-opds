export type ABSItemMetadata = {
    title: string
    subtitle: string
    description: string
    genres?: string[]
    tags?: string[]
    publisher: string
    isbn: string
    language: string
    publishedYear: string
    authorName?: string
    narratorName?: string
    seriesName?: string
}

export type ABSItem = {
    id: string
    media: {
        metadata: ABSItemMetadata
        ebookFormat?: string
    }
    addedAt: string
}

export type ABSItemsResponse = {
    results: ABSItem[]
}

export type ABSLibrarySummary = {
    id: string
    name: string
    icon: string
}

export type ABSLibrariesResponse = {
    libraries: ABSLibrarySummary[]
}

export type ABSLoginUser = {
    id?: string
    username: string
    accessToken: string
}

export type ABSLoginResponse = {
    user?: ABSLoginUser
}
