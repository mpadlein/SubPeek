// Content script for YouTube caption display
import { userConfig } from "@/utils/config";
import { runObserver } from "./youtube";
import "./youtube/style.scss";

export default defineContentScript({
	matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
	runAt: "document_start",

	main() {
		runObserver();
		// Process existing elements on page load
		// document
		// 	.querySelectorAll("ytd-rich-item-renderer")
		// 	.forEach((element) => {
		// 		renderCaptionCodesChannel(element as HTMLElement);
		// 	});

		// // MutationObserver to detect dynamically loaded elements
		// const observer = new MutationObserver((mutations) => {
		// 	for (const mutation of mutations) {
		// 		if (mutation.type !== "childList") continue;

		// 		for (const node of mutation.addedNodes) {
		// 			if (node.nodeType !== Node.ELEMENT_NODE) continue;

		// 			const element = node as HTMLElement;

		// 			// Check if the added node itself is ytd-rich-item-renderer
		// 			if (element.matches?.("ytd-rich-item-renderer")) {
		// 				renderCaptionCodesChannel(element);
		// 			}

		// 			// Check descendants for ytd-rich-item-renderer
		// 			if (element.querySelectorAll) {
		// 				const elements = element.querySelectorAll(
		// 					"ytd-rich-item-renderer"
		// 				);
		// 				elements.forEach((el) =>
		// 					renderCaptionCodesChannel(el as HTMLElement)
		// 				);
		// 			}
		// 		}
		// 	}
		// });

		// // Start observing the document body for changes
		// observer.observe(document.body, {
		// 	childList: true,
		// 	subtree: true,
		// });
	},
});

// async function renderCaptionCodesChannel(element: HTMLElement) {
// 	// Check if already processed or in-progress (prevents race conditions)
// 	if (element.dataset.captionProcessed) return;
// 	element.dataset.captionProcessed = "true";

// 	const thumbnailElement = element.querySelector(
// 		"a#thumbnail"
// 	) as HTMLAnchorElement | null;
// 	if (!thumbnailElement) return;

// 	const url = thumbnailElement.href;
// 	if (!url) return;

// 	try {
// 		// Double-check after async operation
// 		if (element.querySelector(".caption-codes-container")) return;

// 		const data = await getVideoInfo(url);

// 		// Create a map of available manual captions (filter out auto-generated)
// 		const availableCaptions = new Map();
// 		data.captions
// 			.filter((track) => track.kind !== "asr")
// 			.forEach((track) => {
// 				availableCaptions.set(track.languageCode, track);
// 			});

// 		const container = document.createElement("div");
// 		container.className = "caption-codes-container";

// 		// Add CC label
// 		const label = document.createElement("span");
// 		label.className = "caption-label";
// 		label.textContent = "CC:";
// 		container.appendChild(label);

// 		// Only show captions that exist and match user config
// 		let hasAnyBadge = false;
// 		userConfig.captionCodes.forEach((code) => {
// 			if (availableCaptions.has(code)) {
// 				const track = availableCaptions.get(code);
// 				const badge = document.createElement("span");
// 				badge.className = "caption-badge";
// 				badge.textContent = track.name || code;
// 				container.appendChild(badge);
// 				hasAnyBadge = true;
// 			}
// 		});

// 		// Show 'None' badge if no matching captions
// 		if (!hasAnyBadge) {
// 			const badge = document.createElement("span");
// 			badge.className = "caption-badge no-cc";
// 			badge.textContent = "None";
// 			container.appendChild(badge);
// 		}

// 		// Insert between thumbnail and title (before #details/#meta section)
// 		const dismissible = element.querySelector("#dismissible");
// 		if (dismissible) {
// 			const metadataSection =
// 				dismissible.querySelector("#details, #meta");
// 			if (metadataSection) {
// 				dismissible.insertBefore(container, metadataSection);
// 			} else {
// 				dismissible.appendChild(container);
// 			}
// 		}
// 	} catch (error) {
// 		console.error("Error fetching video info:", error);
// 	}
// }
