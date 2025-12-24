import { logger } from "@/utils/logger";
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { VideoInfo, CaptionTrack, AudioTrack } from ".";
import { getVideoIdFromUrl } from "./utils";
import { videoInfoCacheManager } from "./db";
import { metricsProxy } from "./debugging";

function htmlToVideoInfo(html: string): VideoInfo {
	const regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
	const match = html.match(regex);
	if (!match) {
		logger.error("Could not find ytInitialPlayerResponse", html);
		return { captions: [], audioTracks: [] };
	}

	const rawData = JSON.parse(match[1]);

	const captions: CaptionTrack[] =
		rawData.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(
			(track: any) => ({
				languageCode: track.languageCode,
				name: track.name?.simpleText,
				auto: track.kind === "asr",
				url: track.baseUrl,
			})
		) || [];

	let audioTracks: AudioTrack[] =
		rawData.streamingData?.adaptiveFormats?.map((item: any) => {
			const _id = item.audioTrack?.id;
			const lastDot = _id?.lastIndexOf(".");
			const languageCode = _id?.substring(0, lastDot);
			const name: string = item.audioTrack?.displayName;
			const origin = name?.endsWith("original");
			return {
				languageCode,
				name,
				origin,
			};
		}) || [];
	audioTracks = audioTracks.filter(
		(track) => track.name && track.languageCode
	);

	// unique audio tracks by name
	const _map = new Map(audioTracks.map((t) => [t.name, t]));
	audioTracks = Array.from(_map.values());

	return { captions, audioTracks };
}

// Clean expired cache entries on load
videoInfoCacheManager.cleanExpired();

export async function getVideoInfo(url: string): Promise<VideoInfo> {
	const videoId = getVideoIdFromUrl(url);
	if (!videoId) {
		logger.warn("Could not extract video ID from URL: " + url);
		return { captions: [], audioTracks: [] };
	}

	const now = Date.now() / 1000;

	// Try to get from cache
	try {
		const cacheEntry = await videoInfoCacheManager.get(videoId);
		if (cacheEntry) {
			const { data, timestamp } = cacheEntry;
			if (now - timestamp < VIDEO_CACHE_TIMEOUT) {
				const remainCacheTime = VIDEO_CACHE_TIMEOUT - (now - timestamp);
				metricsProxy.cacheHit++;
				logger.debug(
					`Cache hit for video: ${videoId} (${remainCacheTime} seconds left)`
				);
				return data;
			}
			metricsProxy.cacheExpired++;
			logger.debug(`Cache expired for video: ${videoId}`);
		}
	} catch (e: any) {
		logger.error("Cache read error: " + e.message);
	}

	// Fetch fresh data
	const resp = await fetch(url);
	const html = await resp.text();
	metricsProxy.fetch++;

	const data = htmlToVideoInfo(html);

	// Save to cache
	try {
		await videoInfoCacheManager.set(videoId, data);
		logger.debug(`Cached video info: ${videoId}`);
	} catch (e: any) {
		logger.error("Cache write error: " + e.message);
	}

	return data;
}
