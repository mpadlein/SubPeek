import { VideoInfoContainer } from "./components";

import { VideoInfo } from "./index";

abstract class AbstractVideoCard {
	static readonly TagName: string;
	parent: HTMLElement;
	captionCodesContainer: VideoInfoContainer;

	constructor(parent: HTMLElement) {
		this.parent = parent;

		this.parent.querySelector(".vid_info-container")?.remove();
		this.captionCodesContainer = new VideoInfoContainer();
	}

	getVideoUrl() {
		let e: HTMLAnchorElement | null =
			this.parent.querySelector("a#thumbnail");

		if (!e) {
			e = this.parent.querySelector("a[href^='/watch?v=']");
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

	insertCaptionsDataTest(element: HTMLElement) {
		this.insertCaptionsData(element);
		// const e: HTMLElement = this.container.querySelector(
		// 	"h3,h4"
		// ) as HTMLElement;
		// e.insertBefore(element, e.firstChild);
		// logger.debug("Inserted captions data at", e);
	}
}

class ChannelVideoCard extends AbstractVideoCard {
	static readonly TagName: string = "ytd-rich-item-renderer".toUpperCase();

	async insertCaptionsData(element: HTMLElement) {
		const dismissible = this.parent.querySelector("#dismissible");
		if (dismissible) {
			const metadataSection =
				dismissible.querySelector("#details, #meta");
			if (metadataSection) {
				dismissible.insertBefore(element, metadataSection);
				return;
				// dismissible.appendChild(element);
			}

			dismissible.appendChild(element);
		} else {
			let e = this.parent.querySelector(
				".yt-lockup-metadata-view-model__text-container"
			);
			if (e) {
				// e.insertBefore(element, e.firstChild);
				e.appendChild(element);
				return;
			}
			console.error("Could not find dismissible element");
		}
	}
}

class ChannelHomeVideoCard extends ChannelVideoCard {
	static readonly TagName: string = "ytd-grid-video-renderer".toUpperCase();
}

class SearchResultVideoCard extends AbstractVideoCard {
	static readonly TagName: string = "ytd-video-renderer".toUpperCase();

	async insertCaptionsData(element: HTMLElement) {
		const dismissible = this.parent.querySelector("#dismissible");
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
	static readonly TagName: string = "yt-lockup-view-model".toUpperCase();

	async insertCaptionsData(element: HTMLElement) {
		const target = this.parent.querySelector(
			".yt-lockup-metadata-view-model__text-container"
		);
		target?.appendChild(element);
	}
}
const VideoCardClassesMap = [
	ChannelVideoCard,
	ChannelHomeVideoCard,
	SearchResultVideoCard,
	WatchPageVideoCard,
].reduce((acc, cls) => {
	acc[cls.TagName.toUpperCase()] = cls;
	return acc;
}, {} as { [key: string]: new (element: HTMLElement) => AbstractVideoCard });

export function createVideoCardObj(
	element: HTMLElement
): AbstractVideoCard | null {
	const cls = VideoCardClassesMap[element.tagName];
	if (!cls) {
		return null;
	}
	return new cls(element);
}

export function getVideoCardRoot(element: HTMLElement): HTMLElement | null {
	for (const tagName of Object.keys(VideoCardClassesMap)) {
		const parent = element.closest(tagName) as HTMLElement | null;
		if (parent) {
			return parent;
		}
	}
	return null;
}
