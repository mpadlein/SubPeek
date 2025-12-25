/**
 * Utility functions for URL parsing and DOM helpers
 */

import { loadSettings } from "@/common/storage";
import { TrackItem } from "./types";

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

/**
 * Create an SVG element from a path string
 * @param path - SVG path data
 * @param size - Width and height in pixels (default: 18)
 * @returns SVG element
 */
export function createSvgIcon(path: string, size = 18): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));

    const pathEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
    );
    pathEl.setAttribute("d", path);
    pathEl.setAttribute("fill", "currentColor");

    svg.appendChild(pathEl);
    return svg;
}

/**
 * Create a DOM element with optional class and attributes
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    attributes?: Record<string, string>,
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });
    }
    return el;
}

export async function sortTrackByFavorite(tracks: TrackItem[]) {
    const favoriteLangCodes = (await loadSettings()).langCodes;

    tracks.sort((a, b) => {
        let indexA = favoriteLangCodes.indexOf(a.languageCode);
        let indexB = favoriteLangCodes.indexOf(b.languageCode);

        if (indexA === -1) indexA = Infinity;
        if (indexB === -1) indexB = Infinity;

        return indexA - indexB;
    });
}
