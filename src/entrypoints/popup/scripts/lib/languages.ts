import { Settings } from "@/common/settings";
import ISO6391 from "iso-639-1";
import { type LanguageItem } from "../types";
import { LANG_CODES } from "./lang-codes";

const POPULAR_LANGUAGES = [
    "en",
    "es",
    "pt",
    "ru",
    "ja",
    "de",
    "fr",
    "ko",
    "it",
    "zh",
    "ar",
    "hi",
    "id",
    "tr",
    "vi",
    "th",
    "pl",
    "nl",
];

function getBrowserLanguage(): string {
    const language = navigator.language;
    if (language in LANG_CODES) return language;

    const [base] = language.split("-");
    if (base && base in LANG_CODES) return base;

    return "en";
}

function getLanguageList(): LanguageItem[] {
    const browserLang = getBrowserLanguage();
    const recommendedCodes = new Set(["en", browserLang]);
    const favorites = Settings.langCodes.get();

    return Object.entries(LANG_CODES).map(([code, name]) => ({
        code,
        name,
        nativeName: ISO6391.getNativeName(code),
        isRecommended: recommendedCodes.has(code),
        isPopular: POPULAR_LANGUAGES.includes(code),
        popularIndex: POPULAR_LANGUAGES.indexOf(code),
        isFavorited: favorites.includes(code),
        favoritedIndex: favorites.indexOf(code),
    }));
}

/** Sort order: favorited -> recommended -> popular -> alphabetical. */
function compareLanguages(a: LanguageItem, b: LanguageItem): number {
    // 1. Favorites, in the user's order
    if (a.isFavorited !== b.isFavorited) {
        return a.isFavorited ? -1 : 1;
    }
    if (a.isFavorited && b.isFavorited) {
        return a.favoritedIndex - b.favoritedIndex;
    }

    // 2. Recommended
    if (a.isRecommended !== b.isRecommended) {
        return a.isRecommended ? -1 : 1;
    }

    // 3. Popular, in list order
    if (a.isPopular !== b.isPopular) {
        return a.isPopular ? -1 : 1;
    }
    if (a.isPopular && b.isPopular) {
        return a.popularIndex - b.popularIndex;
    }

    // 4. Alphabetical
    return a.name.localeCompare(b.name);
}

export function getPopularLanguages(): LanguageItem[] {
    return getLanguageList()
        .filter((lang) => lang.isPopular)
        .sort(compareLanguages);
}

/** 2 when a field starts with the lower-cased query, 1 when one contains it. */
function matchScore(lang: LanguageItem, query: string): number {
    const fields = [lang.code, lang.name, lang.nativeName].map((f) =>
        f.toLowerCase(),
    );
    if (fields.some((f) => f.startsWith(query))) return 2;
    if (fields.some((f) => f.includes(query))) return 1;
    return 0;
}

/**
 * Languages whose code, name or native name contains `query`, case-insensitive.
 * Prefix matches come first; within a match tier the usual favorited ->
 * recommended -> popular -> alphabetical order applies.
 */
export function searchLanguages(query: string): LanguageItem[] {
    const needle = query.toLowerCase();
    return getLanguageList()
        .map((lang) => ({ lang, score: matchScore(lang, needle) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || compareLanguages(a.lang, b.lang))
        .map((item) => item.lang);
}

export function languageName(code: string): string {
    return LANG_CODES[code] ?? code;
}
