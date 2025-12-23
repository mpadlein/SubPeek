// YouTube video utilities
import { logger } from "@/utils/logger";
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { sleep } from "@/utils";

export interface CaptionTrack {
	languageCode: string;
	name?: string;
	kind?: string;
}

export interface AudioTrack {
	languageCode: string;
	name?: string;
}

export interface VideoInfo {
	captions: CaptionTrack[];
	audioTracks: AudioTrack[];
}

class VideoInfoContainer {
	root: HTMLElement;
	label: HTMLElement;
	captionCodes: CaptionTrack[] = [];
	audioTracks: AudioTrack[] = [];

	constructor() {
		this.root = document.createElement("div");
		this.root.className = "caption-codes-container";

		this.label = document.createElement("span");
		this.label.className = "caption-label";
		this.label.textContent = "CC:";
		this.root.appendChild(this.label);

		this.root.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showPopup();
		});

		(this.root as any)._objectManager = this;
	}

	setCaptions(captions: CaptionTrack[]) {
		this.captionCodes = captions;

		const availableCaptions = new Map();
		captions.forEach((track) => {
			availableCaptions.set(track.languageCode, track);
		});

		let hasAnyBadge = false;
		userConfig.captionCodes.forEach((code) => {
			if (availableCaptions.has(code)) {
				const badge = document.createElement("span");
				badge.className = "caption-badge";
				badge.textContent = availableCaptions.get(code)?.name || code;
				this.root.appendChild(badge);
				hasAnyBadge = true;
			}
		});

		if (!hasAnyBadge) {
			const badge = document.createElement("span");
			badge.className = "caption-badge no-cc";
			badge.textContent = "None";
			this.root.appendChild(badge);
		}
	}

	cleanCaptionCodes() {
		this.root.querySelectorAll(".caption-badge").forEach((badge) => {
			badge.remove();
		});
	}

	showPopup() {
		const existingPopup = document.querySelector(".captions-popup");
		if (existingPopup) {
			existingPopup.remove();
		}

		if (this.captionCodes.length === 0) {
			return;
		}

		// Create popup
		const popup = document.createElement("div");
		popup.className = "captions-popup";

		// Header
		const header = document.createElement("div");
		header.className = "captions-popup-header";
		header.textContent = `All Captions (${this.captionCodes.length})`;
		popup.appendChild(header);

		// Caption list
		const list = document.createElement("div");
		list.className = "captions-popup-list";

		this.captionCodes.forEach((track) => {
			const item = document.createElement("div");
			item.className = "captions-popup-item";

			const name = document.createElement("span");
			name.className = "caption-name";
			name.textContent = track.name || track.languageCode;

			const code = document.createElement("span");
			code.className = "caption-code";
			code.textContent = track.languageCode;

			item.appendChild(name);
			item.appendChild(code);
			list.appendChild(item);
		});

		popup.appendChild(list);

		// Make container positioned for absolute popup
		this.root.style.position = "relative";

		// Position popup below the container
		popup.style.position = "absolute";
		popup.style.top = "100%";
		popup.style.left = "0";
		popup.style.marginTop = "4px";

		this.root.appendChild(popup);

		// Close popup when clicking outside
		const closePopup = (e: MouseEvent) => {
			if (
				!popup.contains(e.target as Node) &&
				!this.root.contains(e.target as Node)
			) {
				popup.remove();
				document.removeEventListener("click", closePopup);
			}
		};

		// Delay adding the listener to avoid immediate close
		setTimeout(() => {
			document.addEventListener("click", closePopup);
		}, 0);
	}
}

abstract class AbstractVideoCard {
	static readonly TagName: string;
	container: HTMLElement;
	captionCodesContainer: VideoInfoContainer;

	constructor(container: HTMLElement) {
		this.container = container;

		let el = this.container.querySelector(".caption-codes-container");
		if (el) {
			this.captionCodesContainer = (el as any)._objectManager;
			this.captionCodesContainer.cleanCaptionCodes();
		} else {
			this.captionCodesContainer = new VideoInfoContainer();
		}
	}

	getVideoUrl() {
		let e: HTMLAnchorElement | null =
			this.container.querySelector("a#thumbnail");

		if (!e) {
			e = this.container.querySelector("a[href^='/watch?v=']");
		}
		if (!e) {
			throw new Error("Could not find thumbnail element");
		}
		return e.href;
	}

	renderCaptionsData(data: VideoInfo): VideoInfoContainer | null {
		let container = this.captionCodesContainer;

		const allCaptions = data.captions.filter(
			(track) => track.kind !== "asr"
		);

		container.setCaptions(allCaptions);

		return container;
	}

	abstract insertCaptionsData(element: HTMLElement): void;
}

class ChannelVideoCard extends AbstractVideoCard {
	static readonly TagName: string = "ytd-rich-item-renderer";

	async insertCaptionsData(element: HTMLElement) {
		const dismissible = this.container.querySelector("#dismissible");
		if (dismissible) {
			const metadataSection =
				dismissible.querySelector("#details, #meta");
			if (metadataSection) {
				dismissible.insertBefore(element, metadataSection);
			} else {
				dismissible.appendChild(element);
			}
		} else {
			console.error("Could not find dismissible element");
		}
	}
}

class ChannelHomeVideoCard extends ChannelVideoCard {
	static readonly TagName: string = "ytd-grid-video-renderer";
}

class SearchResultVideoCard extends AbstractVideoCard {
	static readonly TagName: string = "ytd-video-renderer";

	async insertCaptionsData(element: HTMLElement) {
		const dismissible = this.container.querySelector("#dismissible");
		if (dismissible) {
			const metadataSection =
				dismissible.querySelector("#details, #meta");
			metadataSection?.appendChild(element);
		} else {
			console.error("Could not find dismissible element");
		}
	}
}

class WatchPageVideoCard extends AbstractVideoCard {
	static readonly TagName: string = "yt-lockup-view-model";

	async insertCaptionsData(element: HTMLElement) {
		const target = this.container.querySelector(
			".yt-lockup-metadata-view-model__text-container"
		);
		target?.appendChild(element);
	}
}
const videoCardClasses = [
	ChannelVideoCard,
	ChannelHomeVideoCard,
	SearchResultVideoCard,
	WatchPageVideoCard,
];
function getVideoIdFromUrl(url: string): string | null {
	const urlObj = new URL(url);
	return urlObj.searchParams.get("v");
}

async function getVideoInfo(url: string): Promise<VideoInfo> {
	// await sleep(2000);

	const videoId = getVideoIdFromUrl(url);
	if (!videoId) {
		logger.warn("Could not extract video ID from URL: " + url);
		return { captions: [], audioTracks: [] };
	}

	const cacheKey = `cache:video:${videoId}`;
	const now = Date.now() / 1000; // Current time in seconds

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
				kind: track.kind,
			})
		) || [];

	let audioTracks: AudioTrack[] =
		rawData.streamingData?.adaptiveFormats?.map((item: any) => {
			return {
				languageCode: item.audioTrack.id,
				name: item.audioTrack.displayName,
			};
		}) || [];

	// unique audio tracks by name
	const _map = new Map(audioTracks.map((t) => [t.name, t]));
	audioTracks = Array.from(_map.values());

	const data: VideoInfo = { captions, audioTracks };

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

async function handleLink(link: HTMLAnchorElement) {
	if (!link.getAttribute("href")?.startsWith("/watch?")) return;

	let videoCard: AbstractVideoCard;
	for (const VideoCard of videoCardClasses) {
		let parent: HTMLElement | null = link.closest(VideoCard.TagName);
		if (parent) {
			const videoId = getVideoIdFromUrl(link.href);
			if (!videoId) return;

			if (parent.dataset.video_id == videoId) return;
			parent.dataset.video_id = videoId;

			videoCard = new VideoCard(parent as HTMLElement);
			const videoUrl = link.href;
			getVideoInfo(videoUrl).then((data) => {
				const container = videoCard.renderCaptionsData(data);
				if (container) {
					videoCard.insertCaptionsData(container.root);
				}
			});
			break;
		}
	}
}

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		// Case 1: The href attribute was modified
		if (
			mutation.type === "attributes" &&
			mutation.target.nodeName === "A"
		) {
			handleLink(mutation.target as HTMLAnchorElement);
		}

		// Case 2: New elements were added to the DOM
		if (mutation.type === "childList") {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType !== Node.ELEMENT_NODE) {
					return;
				}
				let element = node as HTMLElement;
				element.querySelectorAll?.("a").forEach(handleLink);
				if (element.nodeName === "A") {
					handleLink(element as HTMLAnchorElement);
				}
			});
		}
	}
});

export function runObserver() {
	observer.observe(document.documentElement, {
		childList: true,
		attributes: true,
		subtree: true,
		attributeFilter: ["href"],
	});
}
