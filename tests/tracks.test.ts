import type { CaptionTrack } from "@/common/types";
import { sortByFavorite } from "@/entrypoints/content/youtube/tracks";
import { describe, expect, it } from "vitest";

const track = (languageCode: string): CaptionTrack => ({
    languageCode,
    name: languageCode,
    auto: false,
});
const codes = (tracks: CaptionTrack[]) => tracks.map((t) => t.languageCode);

describe("sortByFavorite", () => {
    it("puts favorites first in favorites order and keeps the rest in place", () => {
        const tracks = ["de", "en", "ja", "fr", "es"].map(track);

        expect(codes(sortByFavorite(tracks, ["fr", "en"]))).toEqual([
            "fr",
            "en",
            "de",
            "ja",
            "es",
        ]);
    });

    it("leaves the order alone when nothing is a favorite", () => {
        const tracks = ["de", "en", "ja"].map(track);

        expect(codes(sortByFavorite(tracks, ["zz"]))).toEqual([
            "de",
            "en",
            "ja",
        ]);
    });

    it("does not mutate its input", () => {
        const tracks = ["de", "en"].map(track);

        sortByFavorite(tracks, ["en"]);

        expect(codes(tracks)).toEqual(["de", "en"]);
    });
});
