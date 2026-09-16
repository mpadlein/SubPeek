import { Settings } from "@/common/settings";
import type { TrackItem } from "@/common/types";

/** Sorts `tracks` in place: favorite languages first, in favorites order. */
export function sortTrackByFavorite(tracks: TrackItem[]): void {
    const favoriteLangCodes = Settings.langCodes.get();

    tracks.sort((a, b) => {
        let indexA = favoriteLangCodes.indexOf(a.languageCode);
        let indexB = favoriteLangCodes.indexOf(b.languageCode);

        if (indexA === -1) indexA = Infinity;
        if (indexB === -1) indexB = Infinity;

        return indexA - indexB;
    });
}
