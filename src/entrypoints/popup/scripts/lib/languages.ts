import { Settings } from "@/common/settings";
import ISO6391 from "iso-639-1";
import { LanguageItem } from "../types";
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
    let code = navigator.language;
    if (code in LANG_CODES) {
        return code;
    }

    code = code.split("-")[0];
    if (code in LANG_CODES) {
        return code;
    }

    return "en";
}

function getLanguageList(): LanguageItem[] {
    const browserLang = getBrowserLanguage();
    const recommendedCodes = new Set(["en", browserLang]);

    return Object.entries(LANG_CODES).map(([code, name]) => ({
        code,
        name,
        nativeName: ISO6391.getNativeName(code),
        isRecommended: recommendedCodes.has(code),
        recommendIndex: 0,
        isPopular: POPULAR_LANGUAGES.includes(code),
        popularIndex: POPULAR_LANGUAGES.indexOf(code),
        isFavorited: Settings.langCodes.get().includes(code),
        favoritedIndex: Settings.langCodes.get().indexOf(code),
    }));
}

// sort by: favorited -> recommended -> popular -> alphabetically
function sortLanguages(langs: LanguageItem[]) {
    langs.sort((a, b) => {
        // 1. Favorited Tier
        if (a.isFavorited !== b.isFavorited) {
            return a.isFavorited ? -1 : 1;
        }
        if (a.isFavorited && b.isFavorited) {
            return a.favoritedIndex - b.favoritedIndex;
        }

        // 2. Recommended Tier
        if (a.isRecommended !== b.isRecommended) {
            return a.isRecommended ? -1 : 1;
        }

        // 3. Popular Tier
        if (a.isPopular !== b.isPopular) {
            return a.isPopular ? -1 : 1;
        }
        if (a.isPopular && b.isPopular) {
            return a.popularIndex - b.popularIndex;
        }

        // 4. Alphabetical Fallback
        return a.name.localeCompare(b.name);
    });
}

export function getPopularLanguages(): LanguageItem[] {
    const popular = getLanguageList().filter((lang) => lang.isPopular);
    sortLanguages(popular);
    return popular;
}

export function getLanguagesFilter(filter: string = ""): LanguageItem[] {
    let languages = getLanguageList();
    filter = filter.toLowerCase();

    languages = filter
        ? languages.filter(
              (lang) =>
                  lang.name.toLowerCase().includes(filter) ||
                  lang.nativeName.toLowerCase().includes(filter) ||
                  lang.code.toLowerCase().includes(filter),
          )
        : languages;

    sortLanguages(languages);

    const scoredItems = languages.map((lang) => {
        const fields = [lang.code, lang.name, lang.nativeName].map((f) =>
            f.toLowerCase(),
        );

        let score = 0;
        if (fields.some((f) => f.startsWith(filter))) {
            score = 2;
        } else if (fields.some((f) => f.includes(filter))) {
            score = 1;
        }

        return { lang, score };
    });

    // Sort by match quality only. Array.sort is stable, so within each score
    // bucket the favorited -> recommended -> popular -> alphabetical order
    // established by sortLanguages() above is preserved. Adding a name
    // tiebreak here would flatten those tiers back to plain alphabetical.
    scoredItems.sort((a, b) => b.score - a.score);

    return scoredItems.map((item) => item.lang);
}
export function getNameOfCode(code: string): string {
    return LANG_CODES[code] ?? code;
}
