export interface LanguageItem {
    code: string;
    name: string;
    nativeName: string;

    isRecommended: boolean;

    isPopular: boolean;
    popularIndex: number;

    isFavorited: boolean;
    favoritedIndex: number;
}
