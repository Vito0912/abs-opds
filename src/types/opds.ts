export const OPDS_CATEGORY_TYPES = ['all', 'recent', 'authors', 'narrators', 'genres', 'series'] as const
export type OpdsCategory = (typeof OPDS_CATEGORY_TYPES)[number]

export type CustomCard = {
    item: string
    link: string
}
