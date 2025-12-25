import { AudioTrack, CaptionTrack, VideoInfo } from "@/common/types";
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { logger } from "@/utils/logger";
import { extractVideoId } from "./utils";
// import { videoCache } from "./cache";
import { EXTENSION_EVENTS } from "@/common/constants";
import pLimit from "p-limit";
import { metricsProxy } from "./debugging";

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

function getCache(videoId: string): Promise<VideoInfo | null> {
    const now = Date.now() / 1000;
    return new Promise((resolve, reject) => {
        browser.runtime.sendMessage(
            {
                event: EXTENSION_EVENTS.getCacheVideoInfo,
                data: {
                    videoId,
                },
            },
            (response) => {
                if (response.videoId === videoId) {
                    if (response.cacheData) {
                        const { data, timestamp } = response.cacheData;
                        const age = now - timestamp;
                        if (age < VIDEO_CACHE_TIMEOUT) {
                            metricsProxy.cacheHit++;
                            resolve(data);
                            return;
                        }
                        metricsProxy.cacheExpired++;
                    }
                }
                resolve(null);
            },
        );
    });
}

function saveCache(videoId: string, data: VideoInfo): Promise<boolean> {
    return new Promise((resolve, reject) => {
        browser.runtime.sendMessage(
            {
                event: EXTENSION_EVENTS.setCacheVideoInfo,
                data: {
                    videoId,
                    data,
                },
            },
            (response) => {
                if (response) {
                    resolve(response.data);
                }
            },
        );
    });
}

const fetchLimit = pLimit(4);
async function fetchData(url: string) {
    const now = Date.now();
    const html = await fetchLimit(async () => {
        const response = await fetch(url);
        const html = await response.text();

        // await sleep(1000);
        return html;
    });
    metricsProxy.fetch++;
    const data = parseVideoResponse(html);
    const t3 = Date.now() - now;
    console.log("fetchData time", t3);
    return data;
}

export async function resolveVideoInfo(url: string): Promise<VideoInfo> {
    // await sleep(500);
    return new Promise(async (resolve, reject) => {
        const videoId = extractVideoId(url);
        if (!videoId) {
            logger.warn("Could not extract video ID from URL: " + url);
            resolve({ captions: [], audioTracks: [] });
            return;
        }

        let cacheData = await getCache(videoId);
        if (cacheData) {
            resolve(cacheData);
            return;
        }

        // Fetch fresh data
        const data = await fetchData(url);

        data.captions.forEach((item) => {
            const { languageCode, name } = item;
            const k = `languageCode:cc:${languageCode}:${name}`;
            browser.storage.local.set({ [k]: { languageCode, name } });
        });
        data.audioTracks.forEach((item) => {
            const { languageCode, name } = item;
            const k = `languageCode:audio:${languageCode}:${name}`;
            browser.storage.local.set({ [k]: { languageCode, name } });
        });

        resolve(data);

        // Update cache
        try {
            await saveCache(videoId, data);
        } catch (error) {
            logger.error("Cache write error:", error);
        }
    });
}

// // Clean expired cache on module load
// videoCache.cleanExpired();
