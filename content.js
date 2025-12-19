const VIDEO_CACHE_TIMEOUT = 60 * 60;

const logger = {
	log(msg, level) {
		console.log(`[YouTube Extension] ${level}: ${msg}`);
	},
	info(msg) {
		this.log(msg, "INFO");
	},
	warn(msg) {
		this.log(msg, "WARN");
	},
	error(msg) {
		this.log(msg, "ERROR");
	},
	debug(msg) {
		this.log(msg, "DEBUG");
	},
};

const userConfig = {
	captionCodes: ["en", "vi"],
};

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

async function renderCaptionCodesChannel(element) {
	// injectStyles();

	// Check if already processed or in-progress (prevents race conditions)
	if (element.dataset.captionProcessed) return;
	element.dataset.captionProcessed = "true";

	let thumbnailElement = element.querySelector("a#thumbnail");
	if (!thumbnailElement) return;

	let url = thumbnailElement.href;
	if (!url) return;

	try {
		// Double-check after async operation
		if (element.querySelector(".caption-codes-container")) return;

		let data = await getVideoInfo(url);

		// Create a map of available manual captions (filter out auto-generated)
		const availableCaptions = new Map();
		data.captions
			.filter((track) => track.kind !== "asr")
			.forEach((track) => {
				availableCaptions.set(track.languageCode, track);
			});

		const container = document.createElement("div");
		container.className = "caption-codes-container";

		// Add CC label
		const label = document.createElement("span");
		label.className = "caption-label";
		label.textContent = "CC:";
		container.appendChild(label);

		// Only show captions that exist and match user config
		let hasAnyBadge = false;
		userConfig.captionCodes.forEach((code) => {
			if (availableCaptions.has(code)) {
				const track = availableCaptions.get(code);
				const badge = document.createElement("span");
				badge.className = "caption-badge";
				badge.textContent = track.name || code;
				container.appendChild(badge);
				hasAnyBadge = true;
			}
		});

		// TODO: TEST
		if (hasAnyBadge) {
			for (let i = 0; i < Math.floor(Math.random() * 5) + 1; i++) {
				const badge = document.createElement("span");
				badge.className = "caption-badge";
				badge.textContent = "TestLang";
				container.appendChild(badge);
			}
		}

		// Show 'None' badge if no matching captions
		if (!hasAnyBadge) {
			const badge = document.createElement("span");
			badge.className = "caption-badge no-cc";
			badge.textContent = "None";
			container.appendChild(badge);
		}

		// Insert between thumbnail and title (before #details/#meta section)
		const dismissible = element.querySelector("#dismissible");
		if (dismissible) {
			const metadataSection =
				dismissible.querySelector("#details, #meta");
			if (metadataSection) {
				// Insert container before the metadata section
				dismissible.insertBefore(container, metadataSection);
			} else {
				dismissible.appendChild(container);
			}
		}
	} catch (error) {
		console.error("Error fetching video info:", error);
	}
}

// MutationObserver to detect dynamically loaded ytd-rich-item-renderer elements
const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		if (mutation.type !== "childList") continue;

		for (const node of mutation.addedNodes) {
			if (node.nodeType !== Node.ELEMENT_NODE) continue;

			// Check if the added node itself is ytd-rich-item-renderer
			if (node.matches?.("ytd-rich-item-renderer")) {
				renderCaptionCodesChannel(node);
			}

			// Check descendants for ytd-rich-item-renderer
			if (node.querySelectorAll) {
				const elements = node.querySelectorAll(
					"ytd-rich-item-renderer"
				);
				elements.forEach((element) =>
					renderCaptionCodesChannel(element)
				);
			}
		}
	}
});

// Start observing the document body for changes
observer.observe(document.body, {
	childList: true,
	subtree: true,
});

// Process existing elements on page load
document.querySelectorAll("ytd-rich-item-renderer").forEach((element) => {
	renderCaptionCodesChannel(element);
});
