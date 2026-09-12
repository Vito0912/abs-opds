export type LocalizedStrings = Record<string, string>
export type Localizations = Record<string, LocalizedStrings>
export type LocalizationEntry = [language: string, translations: LocalizedStrings]
