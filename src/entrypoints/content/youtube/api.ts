import { logger } from "@/utils/logger";
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { VideoInfo, CaptionTrack, AudioTrack } from ".";

function getVideoIdFromUrl(url: string): string | null {
	const urlObj = new URL(url);
	return urlObj.searchParams.get("v");
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
	const videoId = getVideoIdFromUrl(url);
	if (!videoId) {
		logger.warn("Could not extract video ID from URL: " + url);
		return { captions: [], audioTracks: [] };
	}

	const cacheKey = `cache:video:${videoId}`;
	const now = Date.now() / 1000;

	// Try to get from cache
	try {
		const cached = await browser.storage.session.get(cacheKey);
		const cacheEntry = cached[cacheKey] as
			| { data: VideoInfo; timestamp: number }
			| undefined;
		if (cacheEntry) {
			const { data, timestamp } = cacheEntry;
			if (now - timestamp < VIDEO_CACHE_TIMEOUT) {
				logger.debug(`Cache hit for video: ${videoId}`);
				return data;
			}
			logger.debug(`Cache expired for video: ${videoId}`);
		}
	} catch (e: any) {
		logger.error("Cache read error: " + e.message);
	}

	// Fetch fresh data
	const resp = await fetch(url);
	const html = await resp.text();

	const regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
	const match = html.match(regex);
	if (!match) {
		logger.error("Could not find ytInitialPlayerResponse");
		return { captions: [], audioTracks: [] };
	}

	const rawData = JSON.parse(match[1]);

	const captions: CaptionTrack[] =
		rawData.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map(
			(track: any) => ({
				languageCode: track.languageCode,
				name: track.name?.simpleText,
				auto: track.kind === "asr",
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

	const data: VideoInfo = { captions, audioTracks };
	console.log("Audio tracks >>>", audioTracks);

	// Save to cache
	try {
		await browser.storage.session.set({
			[cacheKey]: { data, timestamp: now },
		});
		logger.debug(`Cached video info: ${videoId}`);
	} catch (e: any) {
		logger.error("Cache write error: " + e.message);
	}

	return data;
}
