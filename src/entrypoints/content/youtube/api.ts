import { CACHE_TTL_SECONDS, EXTENSION_EVENTS } from "@/common/constants";
import type { AudioTrack, CaptionTrack, VideoInfo } from "@/common/types";
import pLimit from "p-limit";
import { metricsProxy } from "../debugging";
import { extractVideoId } from "./utils";
import { getYtcfg } from "./ytcfg";

interface PlayerResponse {
    playabilityStatus?: { status?: string };
    captions?: any;
    streamingData?: any;
}

const fetchLimit = pLimit(4);

// handle 429
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
let backoffUntil = 0;

function isBackingOff(): boolean {
    return Date.now() < backoffUntil;
}

function startBackoff(source: string): void {
    backoffUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    logger.error(
        `${source} rate limited; pausing fetches for ${
            RATE_LIMIT_COOLDOWN_MS / 60_000
        } min`,
    );
}

function handle429(source: string): void {
    startBackoff(source);
    metricsProxy.rateLimited++;
}

/**
 * Fetch the player response over InnerTube.
 *
 * Returns `null` to mean "stop, do not escalate" (rate limited). Throws to mean
 * "this route failed, the caller may try the watch-page fallback".
 */
async function fetchPlayerResponseInnerTube(
    videoId: string,
): Promise<PlayerResponse | null> {
    if (isBackingOff()) return null;

    const cfg = getYtcfg();
    if (!cfg) throw new Error("ytcfg unavailable");
    const ctx = cfg.context;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": String(cfg.clientName ?? 1),
        "X-Youtube-Client-Version": ctx.client.clientVersion,
        "X-Youtube-Bootstrap-Logged-In": String(cfg.loggedIn),
    };

    if (ctx.client.visitorData) {
        headers["X-Goog-Visitor-Id"] = ctx.client.visitorData;
    }

    // Must be absolute: Firefox content scripts do not resolve relative
    const endpoint = `${location.origin}/youtubei/v1/player?prettyPrint=false`;

    return fetchLimit(async () => {
        if (isBackingOff()) return null;

        const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                context: ctx,
                videoId,

                playbackContext: {
                    contentPlaybackContext: {
                        signatureTimestamp: cfg.sts,
                        referer: location.href,
                        vis: 0,
                    },
                },
            }),
            signal: AbortSignal.timeout(30_000),
        });

        metricsProxy.fetchInnerTube++;

        if (res.status === 429) {
            handle429("InnerTube");
            return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    });
}

async function fetchPlayerResponseFallback(
    url: string,
): Promise<PlayerResponse | null> {
    return fetchLimit(async () => {
        if (isBackingOff()) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        metricsProxy.fetchFallback++;

        if (res.status === 429) {
            handle429("Watch page");
            return null;
        }
        if (!res.ok) {
            throw new Error(`Watch page fetch failed (${res.status}): ${url}`);
        }
        const html = await res.text();

        const regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
        const match = html.match(regex);

        if (!match) {
            throw new Error("Could not find ytInitialPlayerResponse");
        }

        try {
            return JSON.parse(match[1] as string);
        } catch (error) {
            throw new Error("Could not parse ytInitialPlayerResponse:", {
                cause: error,
            });
        }
    });
}

async function fetchPlayerResponse(
    url: string,
    videoId: string,
): Promise<PlayerResponse | null> {
    try {
        return await fetchPlayerResponseInnerTube(videoId);
    } catch (error) {
        logger.error("fetch PlayerResponseInnerTube error:", error);
    }
    try {
        return await fetchPlayerResponseFallback(url);
    } catch (error) {
        logger.error("fetch PlayerResponseFallback error:", error);
    }
    return null;
}

function parseVideoResponse(playerResp: PlayerResponse): VideoInfo {
    // Extract caption tracks
    const captions: CaptionTrack[] =
        playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(
            (track: any) => ({
                languageCode: track.languageCode,
                name: track.name?.simpleText,
                auto: track.kind === "asr",
                url: track.baseUrl,
            }),
        ) || [];

    // Extract audio tracks
    let audioTracks: AudioTrack[] =
        playerResp.streamingData?.adaptiveFormats
            ?.map((item: any) => {
                const id = item.audioTrack?.id;
                if (!id) return null;

                const lastDot = id.lastIndexOf(".");
                const languageCode = id.substring(0, lastDot);
                const name: string = item.audioTrack?.displayName;

                // `name?.endsWith("original")` is locale-dependent, use `audioIsDefault` instead.
                const origin = item.audioTrack?.audioIsDefault;

                return { languageCode, name, origin };
            })
            .filter((t: any) => t?.name && t?.languageCode) || [];

    const uniqueAudioMap = new Map(audioTracks.map((t) => [t.languageCode, t]));
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
            if (age < CACHE_TTL_SECONDS) {
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

/**
 * Collapses concurrent lookups for the same video (a video often appears in
 * several thumbnails at once) into a single cache read + fetch.
 */
const inFlight = new Map<string, Promise<VideoInfo | null>>();

export function resolveVideoInfo(url: string): Promise<VideoInfo | null> {
    const videoId = extractVideoId(url);
    if (!videoId) {
        logger.warn("Could not extract video ID from URL: " + url);
        return Promise.resolve(null);
    }

    const pending = inFlight.get(videoId);
    if (pending) return pending;

    const request = doResolveVideoInfo(url, videoId).finally(() => {
        inFlight.delete(videoId);
    });
    inFlight.set(videoId, request);
    return request;
}

async function doResolveVideoInfo(
    url: string,
    videoId: string,
): Promise<VideoInfo | null> {
    const cached = await getCache(videoId);
    if (cached) return cached;

    const playerResp = await fetchPlayerResponse(url, videoId);
    if (!playerResp) return null;

    // 200 OK with a non-OK status (private, age-gated, region-blocked) carries no tracks, and is not evidence that the video has none
    const status = playerResp.playabilityStatus?.status;
    if (status !== "OK") return null;

    const videoInfo = parseVideoResponse(playerResp);

    // Update cache (fire-and-forget)
    saveCache(videoId, videoInfo).catch((e) =>
        logger.error("Cache write error:", e),
    );

    return videoInfo;
}
