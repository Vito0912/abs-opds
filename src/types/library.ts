export type Library = {
    id: string
    name: string
    image: string
}

export type LibraryItem = {
    id: string
    title: string
    subtitle: string
    description: string
    publisher: string
    isbn: string
    publishedYear: string
    language: string
    authors: Author[]
    narrators: Author[]
    genres: string[]
    tags: string[]
    format: string
    series: string[]
}

export type Author = {
    name: string
}
