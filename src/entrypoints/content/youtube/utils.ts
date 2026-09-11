/**
 * Utility functions for URL parsing and DOM helpers
 */

import { Settings } from "@/common/settings";
import type { TrackItem } from "@/common/types";

/**
 * Extract video ID from a YouTube URL
 * @param url - Full YouTube URL (e.g., https://www.youtube.com/watch?v=abc123)
 * @returns Video ID or null if not found
 */
export function extractVideoId(url: string): string | null {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get("v");
    } catch {
        return null;
    }
}

export function sortTrackByFavorite(tracks: TrackItem[]) {
    const favoriteLangCodes = Settings.langCodes.get();

    tracks.sort((a, b) => {
        let indexA = favoriteLangCodes.indexOf(a.languageCode);
        let indexB = favoriteLangCodes.indexOf(b.languageCode);

        if (indexA === -1) indexA = Infinity;
        if (indexB === -1) indexB = Infinity;

        return indexA - indexB;
    });
}
