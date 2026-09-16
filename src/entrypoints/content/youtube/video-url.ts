/**
 * Extract the video id from a YouTube watch URL.
 * @param url - Full YouTube URL (e.g. https://www.youtube.com/watch?v=abc123)
 * @returns The video id, or null when the URL has none
 */
export function extractVideoId(url: string): string | null {
    try {
        return new URL(url).searchParams.get("v");
    } catch {
        return null;
    }
}
