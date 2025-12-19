// Utility functions for YouTube Extension

function getVideoIdFromUrl(url) {
	const urlObj = new URL(url);
	return urlObj.searchParams.get("v");
}

async function getVideoInfo(url) {
	const videoId = getVideoIdFromUrl(url);
	if (!videoId) {
		logger.warn("Could not extract video ID from URL: " + url);
		return { captions: [] };
	}

	const cacheKey = `cache:video:${videoId}`;
	const now = Date.now() / 1000; // Current time in seconds

	// Try to get from cache
	try {
		const cached = await chrome.storage.session.get(cacheKey);
		if (cached[cacheKey]) {
			const { data, timestamp } = cached[cacheKey];
			if (now - timestamp < VIDEO_CACHE_TIMEOUT) {
				logger.debug(`Cache hit for video: ${videoId}`);
				return data;
			}
			logger.debug(`Cache expired for video: ${videoId}`);
		}
	} catch (e) {
		logger.error("Cache read error: " + e.message);
	}

	// Fetch fresh data
	let resp = await fetch(url);
	let html = await resp.text();

	let regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
	let ytInitialPlayerResponse = html.match(regex)[1];
	let rawData = JSON.parse(ytInitialPlayerResponse);

	let captions =
		rawData.captions?.playerCaptionsTracklistRenderer?.captionTracks.map(
			(track) => {
				return {
					languageCode: track.languageCode,
					name: track.name?.simpleText,
					kind: track.kind,
				};
			}
		) || [];

	const data = { captions };

	// Save to cache
	try {
		await chrome.storage.session.set({
			[cacheKey]: { data, timestamp: now },
		});
		logger.debug(`Cached video info: ${videoId}`);
	} catch (e) {
		logger.error("Cache write error: " + e.message);
	}

	return data;
}
