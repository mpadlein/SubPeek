import { CaptionTrack, AudioTrack, VideoInfo } from ".";
import { userConfig } from "@/utils/config";
import { SVG_PATH_CC, SVG_PATH_AUDIO } from "./svgStrings";
export class VideoInfoContainer {
	root: HTMLElement;
	captionCodes: CaptionTrack[] = [];
	audioTracks: AudioTrack[] = [];

	constructor() {
		this.root = document.createElement("div");
		this.root.className = "vid_info-container";
	}

	setData(data: VideoInfo) {
		this.captionCodes = data.captions;
		this.audioTracks = data.audioTracks;

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
                    <path
                        d="${svgPath}"
                        fill="white"></path>
                </svg>
            </div>
            <span class="vid_info-badges"></span>
        `;
		this.root.appendChild(container);

		const badgesContainer = container.querySelector(
			".vid_info-badges"
		) as HTMLElement;

		let hasAnyBadge = false;
		let userConfigCodes = new Set(userConfig.captionCodes);
		let badgeCount = 0;
		data.forEach((track) => {
			if (userConfigCodes.has(track.languageCode)) {
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
				hasAnyBadge = true;
				badgeCount++;
			}
		});

		if (!hasAnyBadge) {
			const badge = document.createElement("span");
			badge.className = "vid_info-badge vid_info-no_items";
			badge.textContent = "None";
			badgesContainer.appendChild(badge);
		}

		if (badgeCount > 0) {
			let remain = data.length - badgeCount;
			if (remain > 0) {
				const badge = document.createElement("span");
				badge.className = "vid_info-badge vid_info-remain";
				badge.textContent = `+${remain}`;
				badgesContainer.appendChild(badge);
			}
		}

		container.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showPopup(name, data);
		});
	}

	cleanCaptionCodes() {
		this.root.querySelectorAll(".vid_info-badge").forEach((badge) => {
			badge.remove();
		});
	}

	showPopup(name: string, data: CaptionTrack[] | AudioTrack[]) {
		const existingPopup = document.querySelector(".vid_info-popup");
		if (existingPopup) {
			existingPopup.remove();
			return;
		}

		if (data.length === 0) {
			return;
		}

		// Create popup
		const popup = document.createElement("div");
		popup.className = "vid_info-popup";

		// Header
		const header = document.createElement("div");
		header.className = "vid_info-popup-header";
		header.textContent = `All ${name} (${data.length})`;
		popup.appendChild(header);

		// Caption list
		const list = document.createElement("div");
		list.className = "vid_info-popup-list";

		data.forEach((track) => {
			const item = document.createElement("div");
			item.className = "vid_info-popup-item";

			const name = document.createElement("span");
			name.className = "vid_info-popup-item-name";
			name.textContent = track.name || track.languageCode;

			const code = document.createElement("span");
			code.className = "vid_info-popup-item-code";
			code.textContent = track.languageCode;

			item.appendChild(name);
			item.appendChild(code);
			list.appendChild(item);
		});

		popup.appendChild(list);

		// Make container positioned for absolute popup
		this.root.style.position = "relative";

		// Position popup based on element's position on screen
		const rect = this.root.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const isInBottomHalf = rect.top > viewportHeight / 2;

		popup.style.position = "absolute";
		popup.style.left = "0";

		if (isInBottomHalf) {
			// Element is in bottom half of screen, show popup above
			popup.style.bottom = "100%";
			popup.style.top = "auto";
			popup.style.marginBottom = "4px";
		} else {
			// Element is in top half of screen, show popup below
			popup.style.top = "100%";
			popup.style.bottom = "auto";
			popup.style.marginTop = "4px";
		}

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

		// test
		console.log("Popup data >>>", data);

		// Delay adding the listener to avoid immediate close
		setTimeout(() => {
			document.addEventListener("click", closePopup);
		}, 0);
	}
}
