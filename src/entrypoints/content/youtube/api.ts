import { EXTENSION_EVENTS } from "@/common/constants";
import { Settings } from "@/common/settings";
import { AudioTrack, CaptionTrack, VideoInfo } from "@/common/types";
import { logger } from "@/utils/logger";
import pLimit from "p-limit";
import { metricsProxy } from "../debugging";
import { extractVideoId } from "./utils";

function parseVideoResponse(html: string): VideoInfo {
    const regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
    const match = html.match(regex);

    if (!match) {
        logger.error("Could not find ytInitialPlayerResponse");
        return { captions: [], audioTracks: [] };
    }

    const rawData = JSON.parse(match[1]);

    // Extract caption tracks
    const captions: CaptionTrack[] =
        rawData.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(
            (track: any) => ({
                languageCode: track.languageCode,
                name: track.name?.simpleText,
                auto: track.kind === "asr",
                url: track.baseUrl,
            }),
        ) || [];

    // Extract audio tracks
    let audioTracks: AudioTrack[] =
        rawData.streamingData?.adaptiveFormats
            ?.map((item: any) => {
                const id = item.audioTrack?.id;
                if (!id) return null;

                const lastDot = id.lastIndexOf(".");
                const languageCode = id.substring(0, lastDot);
                const name: string = item.audioTrack?.displayName;
                const origin = name?.endsWith("original");

                return { languageCode, name, origin };
            })
            .filter((t: any) => t?.name && t?.languageCode) || [];

    // Deduplicate audio tracks by name
    const uniqueAudioMap = new Map(audioTracks.map((t) => [t.name, t]));
    audioTracks = Array.from(uniqueAudioMap.values());

    return { captions, audioTracks };
}

async function getCache(videoId: string): Promise<VideoInfo | null> {
    try {
        const now = Date.now() / 1000;
        const response = await browser.runtime.sendMessage({
            event: EXTENSION_EVENTS.getCacheVideoInfo,
            data: { videoId },
        });

        if (response?.videoId === videoId && response.cacheData) {
            const { data, timestamp } = response.cacheData;
            const age = now - timestamp;
            if (age < Settings.cacheTTL.get()) {
                metricsProxy.cacheHit++;
                return data;
            }
            metricsProxy.cacheExpired++;
        }
        return null;
    } catch (error) {
        logger.error("Cache read error:", error);
        return null;
    }
}

async function saveCache(videoId: string, data: VideoInfo): Promise<void> {
    await browser.runtime.sendMessage({
        event: EXTENSION_EVENTS.setCacheVideoInfo,
        data: { videoId, data },
    });
}

const fetchLimit = pLimit(4);
async function fetchData(url: string) {
    const html = await fetchLimit(async () => {
        const response = await fetch(url);
        const html = await response.text();

        return html;
    });
    metricsProxy.fetch++;
    const data = parseVideoResponse(html);
    return data;
}

export async function resolveVideoInfo(url: string): Promise<VideoInfo> {
    const videoId = extractVideoId(url);
    if (!videoId) {
        logger.warn("Could not extract video ID from URL: " + url);
        return { captions: [], audioTracks: [] };
    }

    const cacheData = await getCache(videoId);
    if (cacheData) return cacheData;

    // Fetch fresh data
    const data = await fetchData(url);

    // Update cache (fire-and-forget)
    saveCache(videoId, data).catch((e) => logger.error("Cache write error:", e));

    return data;
}
