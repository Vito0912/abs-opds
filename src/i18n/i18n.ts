import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fallbackLanguage = 'en'

type Localizations = Record<string, Record<string, string>>

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
                    return [file.split('.')[0].toLowerCase(), JSON.parse(content)]
                } catch (err) {
                    console.error(`Failed to load ${file}:`, err)
                    return null
                }
            })
    )

    localizations = Object.fromEntries(entries.filter(Boolean) as [string, any][])
}

export default function localize(key: string, lang?: string): string {
    const languageCode = lang?.split('-')[0].toLowerCase() ?? fallbackLanguage
    const language = localizations[languageCode] ? languageCode : fallbackLanguage

    return localizations[language]?.[key] ?? localizations[fallbackLanguage]?.[key] ?? key
}
