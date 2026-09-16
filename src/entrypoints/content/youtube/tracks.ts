import type { TrackItem } from "@/common/types";

/**
 * Copy of `tracks` with the favorite languages first, in the order of
 * `favoriteLangCodes`; the remaining tracks keep their relative order.
 */
export function sortByFavorite<T extends TrackItem>(
    tracks: readonly T[],
    favoriteLangCodes: readonly string[],
): T[] {
    const rank = (track: T) => {
        const index = favoriteLangCodes.indexOf(track.languageCode);
        return index === -1 ? Infinity : index;
    };
    return [...tracks].sort((a, b) => rank(a) - rank(b));
}
