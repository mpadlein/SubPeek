import { CaptionTrack, AudioTrack, VideoInfo, reRenderBadges } from ".";
import { userConfig } from "@/utils/config";
import { SVG_PATH_CC, SVG_PATH_AUDIO, SVG_PATH_HEART } from "./svgStrings";

// Popup class for displaying track details
export class VideoInfoPopup {
	private root: HTMLElement;
	private parentElement: HTMLElement;

	constructor(parentElement: HTMLElement) {
		this.parentElement = parentElement;
		this.root = document.createElement("div");
		this.root.className = "vid_info-popup";
	}

	show(name: string, data: CaptionTrack[] | AudioTrack[]) {
		// Remove existing popup
		const existingPopup = document.querySelector(".vid_info-popup");
		if (existingPopup) {
			existingPopup.remove();
			return;
		}

		if (data.length === 0) {
			return;
		}

		// Build popup
		this.root = document.createElement("div");
		this.root.className = "vid_info-popup";

		this.renderHeader(name);
		this.renderList(data);
		this.positionPopup();

		// this.parentElement.appendChild(this.root);
		this.parentElement
			.closest(".vid_info-container")
			?.appendChild(this.root);
	}

	private renderHeader(name: string) {
		const header = document.createElement("div");
		header.className = "vid_info-popup-header";

		const svgPath = name === "cc" ? SVG_PATH_CC : SVG_PATH_AUDIO;
		header.innerHTML = `
			<div class="vid_info-svg-container">
				<svg viewBox="0 0 24 24">
					<path d="${svgPath}" fill="white"></path>
				</svg>
			</div>
			<span class="vid_info-badges"></span>
		`;

		this.root.appendChild(header);
	}

	private renderList(data: CaptionTrack[] | AudioTrack[]) {
		const list = document.createElement("div");
		list.className = "vid_info-popup-list";

		const sortedData = this.sortData(data);
		sortedData.forEach((track) => {
			const item = this.createItem(track);
			list.appendChild(item);
		});

		this.root.appendChild(list);
	}

	private sortData(data: CaptionTrack[] | AudioTrack[]) {
		return [...data].sort((a, b) => {
			// sort by favorite first, also sort by index in userConfig.captionCodes
			let indexA = userConfig.captionCodes.indexOf(a.languageCode);
			let indexB = userConfig.captionCodes.indexOf(b.languageCode);

			indexA === -1 && (indexA = Infinity);
			indexB === -1 && (indexB = Infinity);

			if (indexA < indexB) return -1;
			if (indexA > indexB) return 1;
			return 0;
		});
	}

	private createItem(track: CaptionTrack | AudioTrack): HTMLElement {
		let isFavorite = userConfig.captionCodes.includes(track.languageCode);

		const item = document.createElement("div");
		item.dataset.languageCode = track.languageCode;
		item.className =
			"vid_info-popup-item" + (isFavorite ? " is-favorite" : "");

		// Name
		const nameElement = document.createElement("span");
		nameElement.className = "vid_info-popup-item-name";
		nameElement.textContent = track.name;

		// Actions container
		const actionsElement = document.createElement("div");
		actionsElement.className = "vid_info-popup-item-actions";

		// Code badge
		const code = document.createElement("span");
		code.className = "vid_info-popup-item-code";
		code.textContent = track.languageCode;

		// Favorite button
		const favoriteButton = document.createElement("button");
		favoriteButton.className =
			"vid_info-popup-item-add" + (isFavorite ? " is-favorite" : "");
		favoriteButton.innerHTML = `<svg viewBox="0 0 24 24"><path d="${SVG_PATH_HEART}" fill="currentColor"></path></svg>`;
		item.title = isFavorite
			? `Remove "${track.name}" from favorites`
			: `Add "${track.name}" to favorites`;
		item.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleFavorite(item, favoriteButton, isFavorite);
			isFavorite = !isFavorite;
		};

		actionsElement.appendChild(code);
		actionsElement.appendChild(favoriteButton);
		item.appendChild(nameElement);
		item.appendChild(actionsElement);

		return item;
	}

	private toggleFavorite(
		item: HTMLElement,
		button: HTMLElement,
		currentState: boolean
	) {
		if (currentState) {
			item.classList.remove("is-favorite");
			button.classList.remove("is-favorite");
			button.title = "Add to favorites";
		} else {
			item.classList.add("is-favorite");
			button.classList.add("is-favorite");
			button.title = "Remove from favorites";
		}

		const newState = !currentState;
		const langCode = item.dataset.languageCode;
		if (!langCode) return;

		if (newState) {
			userConfig.captionCodes.push(langCode);
		} else {
			userConfig.captionCodes = userConfig.captionCodes.filter(
				(code) => code !== langCode
			);
		}
		reRenderBadges();
	}

	private positionPopup() {
		const rect = this.parentElement.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const isInBottomHalf = rect.top > viewportHeight / 2;

		this.root.classList.add(
			isInBottomHalf ? "vid_info-popup-bottom" : "vid_info-popup-top"
		);
	}

	static closeAll() {
		const popup = document.querySelector(".vid_info-popup");
		if (popup) popup.remove();
	}
}

// Main container class for video info badges
export class VideoInfoContainer {
	root: HTMLElement;
	captionCodes: CaptionTrack[] = [];
	audioTracks: AudioTrack[] = [];

	constructor() {
		this.root = document.createElement("div");
		this.root.className = "vid_info-container";
		(this.root as any)._videoInfoContainer = this;

		this.root.onmousedown = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};
	}

	setData(data: VideoInfo) {
		this.captionCodes = data.captions;
		this.audioTracks = data.audioTracks;

		this.renderBadges(this.captionCodes, "cc", SVG_PATH_CC);
		this.renderBadges(this.audioTracks, "audio", SVG_PATH_AUDIO);
	}

	reRender() {
		this.root.querySelectorAll(".vid_info-item").forEach((e) => e.remove());
		this.renderBadges(this.captionCodes, "cc", SVG_PATH_CC);
		this.renderBadges(this.audioTracks, "audio", SVG_PATH_AUDIO);
	}

	private renderBadges(
		data: CaptionTrack[] | AudioTrack[],
		name: string,
		svgPath: string
	) {
		if (!systemConfig.renderEmpty && data.length <= 0) {
			return;
		}

		const container = document.createElement("div");
		container.className = "vid_info-item vid_info-" + name;
		container.innerHTML = `
			<div class="vid_info-svg-container">
				<svg viewBox="0 0 24 24">
					<path d="${svgPath}" fill="white"></path>
				</svg>
			</div>
			<span class="vid_info-badges"></span>
		`;
		this.root.appendChild(container);

		const badgesContainer = container.querySelector(
			".vid_info-badges"
		) as HTMLElement;

		let badgeCount = 0;
		data.forEach((track) => {
			if (userConfig.captionCodes.includes(track.languageCode)) {
				const badge = document.createElement("span");
				badge.className = "vid_info-badge vid_info-tooltip";
				badge.textContent = track.name || track.languageCode;
				if (userConfig.renderCodeInsteadOfName) {
					badge.textContent = track.languageCode.toUpperCase();

					const toolTipElement = document.createElement("span");
					toolTipElement.className = "vid_info-tooltiptext";
					toolTipElement.textContent =
						track.name || track.languageCode;
					badge.appendChild(toolTipElement);
				}
				badgesContainer.appendChild(badge);
				badgeCount++;
			}
		});

		if (badgeCount <= 0) {
			const badge = document.createElement("span");
			badge.className = "vid_info-badge vid_info-no_items";
			badge.textContent = "None";
			badgesContainer.appendChild(badge);
		}

		if (badgeCount > 0) {
			const remain = data.length - badgeCount;
			if (remain > 0) {
				const badge = document.createElement("span");
				badge.className = "vid_info-badge vid_info-remain";
				badge.textContent = `+${remain}`;
				badgesContainer.appendChild(badge);
			}
		}

		// Popup on click
		const popup = new VideoInfoPopup(this.root);
		container.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			popup.show(name, data);
		};
	}

	cleanCaptionCodes() {
		this.root.querySelectorAll(".vid_info-badge").forEach((badge) => {
			badge.remove();
		});
	}
}

// Close popup when clicking outside
document.addEventListener("click", (event: MouseEvent) => {
	const popup = document.querySelector(".vid_info-popup");
	if (popup && !popup.contains(event.target as Node)) {
		popup.remove();
	}
});
