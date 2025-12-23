import { getVideoInfo } from "./api";
import { VideoInfoContainer } from "./components";
export interface CaptionTrack {
	languageCode: string;
	name?: string;
	auto: boolean;
}

export interface AudioTrack {
	languageCode: string;
	name?: string;
	origin: boolean;
}

export interface VideoInfo {
	captions: CaptionTrack[];
	audioTracks: AudioTrack[];
}

abstract class AbstractVideoCard {
	static readonly TagName: string;
	container: HTMLElement;
	captionCodesContainer: VideoInfoContainer;

	constructor(container: HTMLElement) {
		this.container = container;

		this.container.querySelector(".vid_info-container")?.remove();
		this.captionCodesContainer = new VideoInfoContainer();
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

	renderCaptionsData(data: VideoInfo) {
		data.captions = data.captions.filter((track) => !track.auto);
		data.audioTracks = data.audioTracks.filter((track) => !track.origin);
		this.captionCodesContainer.setData(data);
	}

	abstract insertCaptionsData(element: HTMLElement): void;

	// insertCaptionsDataInThumbImg(element: HTMLElement) {
	// 	const img = this.container.querySelector(
	// 		"img"
	// 		// 'img[src^="https://i.ytimg.com/"]'
	// 	);
	// 	// make "element" appear in top left corner of "img"
	// 	if (img) {
	// 		// const container = document.createElement("div");
	// 		// container.style.position = "absolute";
	// 		// container.style.top = "0";
	// 		// container.style.left = "0";
	// 		// container.appendChild(element);
	// 		const anchor: HTMLElement = this.container.querySelector(
	// 			"a[href^='/watch?v=']"
	// 		);
	// 		if (!anchor) return;
	// 		anchor.appendChild(element);
	// 		anchor.style.display = "block";
	// 	} else {
	// 		console.log("Cannot find img for element", this.container);
	// 	}
	// }
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
			videoCard.insertCaptionsData(videoCard.captionCodesContainer.root);
			// videoCard.insertCaptionsDataInThumbImg(
			// 	videoCard.captionCodesContainer.root
			// );
			getVideoInfo(videoUrl).then((data) => {
				videoCard.renderCaptionsData(data);
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
