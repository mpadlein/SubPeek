/**
 * Language Utilities
 * Handles language data retrieval and sorting
 */

import { loadSettings } from "@/common/storage";
import ISO6391 from "iso-639-1";
import { LanguageItem } from "./types";
/**
 * Popular languages to show first when no filter is applied
 * Order matters - these appear in this order
 */
const POPULAR_LANGUAGES = [
    // Tier 1: Most common on YouTube
    "en", // English
    "es", // Spanish
    "pt", // Portuguese
    "ru", // Russian
    "ja", // Japanese
    "de", // German
    "fr", // French
    "ko", // Korean
    "it", // Italian
    "zh", // Chinese
    "ar", // Arabic
    "hi", // Hindi
    "id", // Indonesian
    "tr", // Turkish
    "vi", // Vietnamese
    "th", // Thai
    "pl", // Polish
    "nl", // Dutch
];

/**
 * Get the user's browser language code
 */
function getBrowserLanguage(): string {
    const lang = navigator.language.split("-")[0].toLowerCase();
    return ISO6391.validate(lang) ? lang : "en";
}

/**
 * Get all available languages with metadata
 */
async function getAllLanguages(): Promise<LanguageItem[]> {
    const browserLang = getBrowserLanguage();
    const favoritedCodes = (await loadSettings()).langCodes.map((s) =>
        s.toLowerCase(),
    );
    const recommendedCodes = new Set(["en", browserLang]);

    return ISO6391.getAllCodes().map((code) => ({
        code,
        name: ISO6391.getName(code),
        nativeName: ISO6391.getNativeName(code),
        isRecommended: recommendedCodes.has(code),
        recommendIndex: 0,
        isPopular: POPULAR_LANGUAGES.includes(code),
        popularIndex: POPULAR_LANGUAGES.indexOf(code),
        isFavorited: favoritedCodes.includes(code),
        favoritedIndex: favoritedCodes.indexOf(code),
    }));
}

// sort by favorited -> recommended -> popular -> alphabetically
async function sortLanguages(langs: LanguageItem[]): Promise<LanguageItem[]> {
    const favoritedCodes = (await loadSettings()).langCodes.map((s) =>
        s.toLowerCase(),
    );

    function getScore(lang: LanguageItem): number {
        if (lang.isFavorited) {
            return 3 + (1 - lang.favoritedIndex / favoritedCodes.length);
        }
        if (lang.isRecommended) {
            return 2;
        }
        if (lang.isPopular) {
            return 1 + (1 - lang.popularIndex / POPULAR_LANGUAGES.length);
        }

        return 0;
    }

    return langs.sort((a, b) => {
        let scoreA = getScore(a);
        let scoreB = getScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
    });
}

export async function getPopularLanguages(): Promise<LanguageItem[]> {
    const langItems = await getAllLanguages();
    const result = await sortLanguages(
        langItems.filter((lang) => lang.isPopular),
    );
    console.log(result);
    return result;
}

/**
 * Get filtered and sorted languages
 * Recommended languages appear first, then sorted alphabetically
 */
export async function getLanguagesFilter(
    filter: string = "",
): Promise<LanguageItem[]> {
    let languages = await getAllLanguages();
    filter = filter.toLowerCase();

    const filtered = filter
        ? languages.filter(
              (lang) =>
                  lang.name.toLowerCase().includes(filter) ||
                  lang.nativeName.toLowerCase().includes(filter) ||
                  lang.code.toLowerCase().includes(filter),
          )
        : languages;

    languages = await sortLanguages(filtered);

    function getScore(lang: LanguageItem): number {
        let code = lang.code.toLowerCase();
        let name = lang.name.toLowerCase();
        let nativeName = lang.nativeName.toLowerCase();

        if (code.startsWith(filter)) return 2;
        if (name.startsWith(filter)) return 2;
        if (nativeName.startsWith(filter)) return 2;

        if (code.includes(filter)) return 1;
        if (name.includes(filter)) return 1;
        if (nativeName.includes(filter)) return 1;

        return 0;
    }

    languages = languages.sort((a, b) => {
        let scoreA = getScore(a);
        let scoreB = getScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
    });

    return languages;
}

const IntlObj = new Intl.DisplayNames("en", {
    type: "language",
    languageDisplay: "standard",
    fallback: "code",
});

export function getNativeName(code: string): string {
    // return ISO6391.getNativeName(code) || code;
    return IntlObj.of(code) || code;
}
