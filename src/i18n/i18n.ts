import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localizations = getLocalizations();

export default function localize(key: string, lang?: string): string {
    const fallbackLanguage = 'en';

    const languageCode = lang?.split('-')[0].toLowerCase() ?? fallbackLanguage;
    const language = Object.keys(localizations).includes(languageCode) ? languageCode : fallbackLanguage;
    return localizations[language][key] ?? localizations[fallbackLanguage][key] ?? key;
}

function getLocalizations() {
    const directory = path.join(__dirname, './languages');
    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'));

    return Object.fromEntries(files.map((file) => {
        const filePath = path.join(directory, file);
        const content = fs.readFileSync(filePath, 'utf8');

        return [file.split('.')[0], JSON.parse(content)];
    }))
}