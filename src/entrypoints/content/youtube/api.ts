import { messaging } from "@/common/messaging";
import { Settings } from "@/common/settings";
import type { AudioTrack, CaptionTrack, VideoInfo } from "@/common/types";
import pLimit from "p-limit";
import { metricsProxy } from "../debugging";
import { extractVideoId } from "./video-url";
import { balancedObject, getYtcfg } from "./ytcfg";

// ─── YouTube payload ─────────────────────────────────────────────────

/** The parts of YouTube's player response that SubPeek reads. */
interface PlayerResponse {
    playabilityStatus?: { status?: string };
    captions?: {
        playerCaptionsTracklistRenderer?: {
            captionTracks?: InnerTubeCaptionTrack[];
        };
    };
    streamingData?: { adaptiveFormats?: InnerTubeFormat[] };
}

interface InnerTubeCaptionTrack {
    languageCode: string;
    name?: { simpleText?: string };
    /** "asr" for speech-recognition captions. */
    kind?: string;
}

interface InnerTubeFormat {
    /** Present on the audio formats of videos with more than one audio track. */
    audioTrack?: { id: string; displayName?: string };
}

/**
 * Suffix of `audioTrack.id` for the video's original audio. Observed values:
 * 4 = original, 3 = dubbed by the creator, 10 = auto-dubbed by YouTube.
 */
const ORIGINAL_AUDIO_TRACK_TYPE = "4";

// ─── Fetching ────────────────────────────────────────────────────────

const fetchLimit = pLimit(4);
const FETCH_TIMEOUT_MS = 30_000;

/** Matches up to and including the opening brace of the watch-page player JSON. */
const PLAYER_RESPONSE_ASSIGNMENT = /var ytInitialPlayerResponse\s*=\s*\{/;

/** After a 429 from either source, every fetch short-circuits for this long. */
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
let backoffUntil = 0;

function handleRateLimit(source: string): void {
    backoffUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    metricsProxy.rateLimited++;
    logger.error(
        `${source} rate limited; pausing fetches for ${
            RATE_LIMIT_COOLDOWN_MS / 60_000
        } min`,
    );
}

/**
 * Checked again inside the p-limit task, not just before queueing: a request
 * queued moments before the user turned SubPeek off must not go out.
 */
function shouldSkipFetch(): boolean {
    return Date.now() < backoffUntil || !Settings.enabled.get();
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
    if (shouldSkipFetch()) return null;

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

    // Must be absolute: Firefox content scripts do not resolve relative URLs.
    const endpoint = `${location.origin}/youtubei/v1/player?prettyPrint=false`;

    return fetchLimit(async () => {
        if (shouldSkipFetch()) return null;

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
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        metricsProxy.fetchInnerTube++;

        if (res.status === 429) {
            handleRateLimit("InnerTube");
            return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PlayerResponse;
    });
}

async function fetchPlayerResponseFallback(
    url: string,
): Promise<PlayerResponse | null> {
    return fetchLimit(async () => {
        if (shouldSkipFetch()) return null;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        metricsProxy.fetchFallback++;

        if (res.status === 429) {
            handleRateLimit("Watch page");
            return null;
        }
        if (!res.ok) {
            throw new Error(`Watch page fetch failed (${res.status}): ${url}`);
        }
        const html = await res.text();

        // A lazy regex up to the first "};" would stop inside a string, e.g. a
        // description containing code; scan for the balanced object instead.
        const match = PLAYER_RESPONSE_ASSIGNMENT.exec(html);
        const literal =
            match && balancedObject(html, match.index + match[0].length - 1);

        if (!literal) {
            throw new Error("Could not find ytInitialPlayerResponse");
        }

        try {
            return JSON.parse(literal) as PlayerResponse;
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

// ─── Parsing ─────────────────────────────────────────────────────────

function parseVideoResponse(playerResp: PlayerResponse): VideoInfo {
    const captionTracks =
        playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
        [];
    const captions: CaptionTrack[] = captionTracks.map((track) => ({
        languageCode: track.languageCode,
        name: track.name?.simpleText ?? "",
        isAutoGenerated: track.kind === "asr",
    }));

    // The same audio track comes in several bitrates; keep one per language.
    const audioByLanguage = new Map<string, AudioTrack>();
    for (const format of playerResp.streamingData?.adaptiveFormats ?? []) {
        const track = format.audioTrack;
        if (!track?.id || !track.displayName) continue;

        // id is "<languageCode>.<trackType>", e.g. "es-US.4", "en-US.10"
        const lastDot = track.id.lastIndexOf(".");
        const languageCode = track.id.substring(0, lastDot);
        const trackType = track.id.substring(lastDot + 1);
        if (!languageCode) continue;

        // Neither `displayName` nor `audioIsDefault` identifies the original:
        // the name is localised ("English original", "英語（オリジナル）") and
        // `audioIsDefault` marks the track YouTube auto-plays for the viewer's
        // UI language, which on a Spanish video viewed in English is the
        // English dub. The track type in the id is the only locale-independent
        // signal.
        audioByLanguage.set(languageCode, {
            languageCode,
            name: track.displayName,
            isOriginal: trackType === ORIGINAL_AUDIO_TRACK_TYPE,
        });
    }

    return { captions, audioTracks: Array.from(audioByLanguage.values()) };
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Collapses concurrent lookups for the same video (a video often appears in
 * several thumbnails at once) into a single cache read + fetch.
 */
const inFlight = new Map<string, Promise<VideoInfo | null>>();

/**
 * Resolves the tracks of the video behind a watch URL, or null when they
 * cannot be known: no video id, rate limited, fetch failed, or the video is
 * not playable. Callers must not render null as "0 tracks".
 */
export function resolveVideoInfo(url: string): Promise<VideoInfo | null> {
    const videoId = extractVideoId(url);
    if (!videoId) {
        logger.debug("No video id in URL, skipping: " + url);
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

    // 200 OK with a non-OK status (private, age-gated, region-blocked) carries
    // no tracks, and is not evidence that the video has none.
    if (playerResp.playabilityStatus?.status !== "OK") return null;

    const videoInfo = parseVideoResponse(playerResp);

    // Fire-and-forget: the result is useful even if caching it fails.
    messaging
        .saveVideoInfo(videoId, videoInfo)
        .catch((error) => logger.error("Cache write error:", error));

    return videoInfo;
}

async function getCache(videoId: string): Promise<VideoInfo | null> {
    try {
        // The background script only hands back entries that are still fresh.
        const info = await messaging.getCachedVideoInfo(videoId);
        if (info) metricsProxy.cacheHit++;
        return info ?? null;
    } catch (error) {
        logger.error("Cache read error:", error);
        return null;
    }
}
