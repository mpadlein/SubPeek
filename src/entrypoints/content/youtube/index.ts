import { getVideoInfo } from "./api";
import { VideoInfoContainer } from "./components";
import { metricsProxy } from "./debugging";
import { getVideoIdFromUrl } from "./utils";
import { createVideoCardObj, getVideoCardRoot } from "./videoCard";

export interface CaptionTrack {
	languageCode: string;
	name: string;
	auto: boolean;
	url: string;
}

export interface AudioTrack {
	languageCode: string;
	name: string;
	origin: boolean;
}

export interface VideoInfo {
	captions: CaptionTrack[];
	audioTracks: AudioTrack[];
}

async function handleVideoCardVisible(element: HTMLElement) {
	const videoCard = createVideoCardObj(element);
	if (!videoCard) {
		logger.error(
			"Could not find video card class for element",
			element.tagName,
			element
		);
		return;
	}
	const videoUrl = videoCard.getVideoUrl();
	videoCard.insertCaptionsDataTest(videoCard.captionCodesContainer.root);
	getVideoInfo(videoUrl).then((data) => {
		videoCard.renderCaptionsData(data);
	});
}

let itsCount = 0;
const intersectionObserver = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		if (entry.isIntersecting) {
			itsCount++;
			const link = entry.target as HTMLAnchorElement;
			handleVideoCardVisible(link);
			metricsProxy.itsOsv++;
			console.log(`Intersecting ${itsCount}`, entry);
			intersectionObserver.unobserve(entry.target);
		}
	}
});

async function handleObserverMatch(anchor: HTMLAnchorElement) {
	if (!anchor.getAttribute("href")?.startsWith("/watch?")) return;
	if (anchor.closest("h3,h4")) return;
	const videoCardRoot = getVideoCardRoot(anchor);
	if (!videoCardRoot) return;

	// for case multiple anchor elements in the same video card
	const videoId = getVideoIdFromUrl(anchor.href);
	if (!videoId) return;
	if (videoCardRoot.dataset.video_id == videoId) return;
	videoCardRoot.dataset.video_id = videoId;

	metricsProxy.itsOsvMatch++;
	intersectionObserver.observe(videoCardRoot);
	videoCardRoot.style.border = "2px solid red";
	videoCardRoot.style.boxSizing = "border-box";
}

const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		if (
			mutation.type === "attributes" &&
			mutation.target.nodeName === "A"
		) {
			handleObserverMatch(mutation.target as HTMLAnchorElement);
		}

		if (mutation.type === "childList") {
			mutation.addedNodes.forEach((node) => {
				if (node.nodeType !== Node.ELEMENT_NODE) {
					return;
				}
				let element = node as HTMLElement;
				element.querySelectorAll?.("a").forEach((e) => {
					handleObserverMatch(e);
				});
				if (element.nodeName === "A") {
					handleObserverMatch(element as HTMLAnchorElement);
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

export function reRenderBadges() {
	const elements = document.querySelectorAll(".vid_info-container");
	elements.forEach((element) => {
		const videoInfoContainer: VideoInfoContainer = (element as any)
			._videoInfoContainer;
		videoInfoContainer.reRender();
	});
}
