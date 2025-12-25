import { EXTENSION_EVENTS } from "@/common/constants";
import { onExtensionMessage } from "@/common/messaging";
import { loadSettings } from "@/common/storage";
import { userConfig } from "@/utils/config";
import { CSS, EVENT, ICON_AUDIO, ICON_CC } from "../constants";
import type { AudioTrack, CaptionTrack, VideoInfo } from "../types";
import { createElement, createSvgIcon, sortTrackByFavorite } from "../utils";
import { TrackPopup } from "./popup";

type TrackItem = CaptionTrack | AudioTrack;

export class EmbedComponent {
    readonly root: HTMLElement;
    private captions: CaptionTrack[] = [];
    private audioTracks: AudioTrack[] = [];
    private ccElement: HTMLElement;
    private audioElement: HTMLElement;

    constructor() {
        this.root = createElement("div", CSS.CONTAINER);
        this.root.innerHTML = `
            <div class="${CSS.ITEM} ${CSS.ITEM}--cc hidden">
                <div class="${CSS.ICON}"></div>
                <span class="${CSS.BADGES}"></span>
            </div>
            <div class="${CSS.ITEM} ${CSS.ITEM}--audio hidden">
                <div class="${CSS.ICON}"></div>
                <span class="${CSS.BADGES}"></span>
            </div>
        `;

        this.ccElement = this.root.querySelector(
            `.${CSS.ITEM}--cc`,
        ) as HTMLElement;
        this.audioElement = this.root.querySelector(
            `.${CSS.ITEM}--audio`,
        ) as HTMLElement;

        this.ccElement
            .querySelector(`.${CSS.ICON}`)
            ?.appendChild(createSvgIcon(ICON_CC));
        this.audioElement
            .querySelector(`.${CSS.ICON}`)
            ?.appendChild(createSvgIcon(ICON_AUDIO));

        this.ccElement.onclick = (e) => {
            const popup = new TrackPopup(this.ccElement);
            e.preventDefault();
            e.stopPropagation();
            popup.show("cc", this.captions);
        };

        this.audioElement.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const popup = new TrackPopup(this.audioElement);
            console.log("popup", popup);
            popup.show("audio", this.audioTracks);
        };

        this.root.addEventListener(EVENT.RENDER, () => {
            this.render();
        });

        this.root.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
    }

    setData(data: VideoInfo): void {
        this.captions = data.captions;
        this.audioTracks = data.audioTracks;
    }

    setLoading() {
        [this.ccElement, this.audioElement].forEach((el) => {
            el.classList.remove("hidden");

            const badges = el.querySelector(`.${CSS.BADGES}`) as HTMLElement;
            if (badges) {
                badges.innerHTML = `
					<div class="${CSS.LOADING_SPINNER}"></div>
				`;
            }
        });
    }

    render(): void {
        this.renderSection(this.ccElement, this.captions);
        this.renderSection(this.audioElement, this.audioTracks);
    }

    private async renderSection(
        element: HTMLElement,
        tracks: TrackItem[],
    ): Promise<void> {
        const badges = element.querySelector(`.${CSS.BADGES}`) as HTMLElement;

        badges.innerHTML = "";

        const favoriteLangCodes = (await loadSettings()).langCodes;

        // Render matching badges
        let badgeCount = 0;

        await sortTrackByFavorite(tracks);
        tracks.forEach((track) => {
            if (favoriteLangCodes.includes(track.languageCode)) {
                badges.appendChild(this.createBadge(track));
                badgeCount++;
            }
        });

        // Show "None" if no matches
        if (badgeCount === 0) {
            const none = createElement(
                "span",
                `${CSS.BADGE} ${CSS.BADGE}--muted`,
            );
            none.textContent = "None";
            badges.appendChild(none);
        }

        // Show remaining count
        const remaining = tracks.length - badgeCount;
        if (badgeCount > 0 && remaining > 0) {
            const more = createElement(
                "span",
                `${CSS.BADGE} ${CSS.BADGE}--more`,
            );
            more.textContent = `+${remaining}`;
            badges.appendChild(more);
        }

        element.classList.remove("hidden");
    }

    private createBadge(track: TrackItem): HTMLElement {
        const badge = createElement("span", CSS.BADGE);

        if (userConfig.renderCodeInsteadOfName) {
            badge.textContent = track.languageCode.toUpperCase();
            badge.classList.add(CSS.TOOLTIP);

            const tooltip = createElement("span", CSS.TOOLTIP_TEXT);
            tooltip.textContent = track.name || track.languageCode;
            badge.appendChild(tooltip);
        } else {
            badge.textContent = track.name || track.languageCode;
        }

        return badge;
    }
}

function handleUserLangCodesUpdate() {
    document.querySelectorAll(`.${CSS.CONTAINER}`).forEach((el) => {
        el.dispatchEvent(new CustomEvent(EVENT.RENDER));
    });
}

onExtensionMessage((message) => {
    if (message.event === EXTENSION_EVENTS.langCodesUpdated) {
        handleUserLangCodesUpdate();
    }
});

window.addEventListener(EXTENSION_EVENTS.langCodesUpdated, () => {
    handleUserLangCodesUpdate();
});
