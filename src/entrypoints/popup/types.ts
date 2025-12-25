/**
 * Popup Settings Types
 */

export interface Settings {
    captionCodes: string[];
    cacheTTL: number;
    renderEmpty: boolean;
}

export interface LanguageItem {
    code: string;
    name: string;
    nativeName: string;

    isRecommended: boolean;
    recommendIndex: number;

    isPopular: boolean;
    popularIndex: number;

    isFavorited: boolean;
    favoritedIndex: number;
}

export const DEFAULT_SETTINGS: Settings = {
    captionCodes: ["en", "vi"],
    cacheTTL: 3600,
    renderEmpty: true,
};
