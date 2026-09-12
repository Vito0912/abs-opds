import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { LocalizationEntry, Localizations, LocalizedStrings } from '../types/i18n.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fallbackLanguage = 'en'

let localizations: Localizations = {}

export async function loadLocalizations() {
    console.log('Loading localizations...')
    const directory = path.join(__dirname, './languages')
    const files = await fs.promises.readdir(directory)

    const entries = await Promise.all(
        files
            .filter((file) => file.toLowerCase().endsWith('.json'))
            .map(async (file) => {
                const filePath = path.join(directory, file)
                try {
                    const content = await fs.promises.readFile(filePath, 'utf8')
                    return [file.split('.')[0].toLowerCase(), JSON.parse(content) as LocalizedStrings] as LocalizationEntry
                } catch (err) {
                    console.error(`Failed to load ${file}:`, err)
                    return null
                }
            })
    )

    localizations = Object.fromEntries(entries.filter(Boolean) as LocalizationEntry[])
}

export default function localize(key: string, lang?: string | string[]): string {
    const requestedLanguage = Array.isArray(lang) ? lang[0] : lang
    const languageCode = requestedLanguage?.split('-')[0].toLowerCase() ?? fallbackLanguage
    const language = localizations[languageCode] ? languageCode : fallbackLanguage

    return localizations[language]?.[key] ?? localizations[fallbackLanguage]?.[key] ?? key
}
