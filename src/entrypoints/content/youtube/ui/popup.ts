import { EXTENSION_EVENTS } from "@/common/constants";
import { loadSettings, saveSettings } from "@/common/storage";
import {
    CSS,
    ICON_AUDIO,
    ICON_CC,
    ICON_HEART,
    ICON_SETTINGS,
} from "../constants";
import type { AudioTrack, CaptionTrack } from "../types";
import { createElement, createSvgIcon, sortTrackByFavorite } from "../utils";

type TrackItem = CaptionTrack | AudioTrack;

export class TrackPopup {
    private root: HTMLElement;
    private parent: HTMLElement;

    constructor(parent: HTMLElement) {
        this.parent = parent;
        this.root = createElement("div", CSS.POPUP);

        this.root.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
        };
    }

    async show(type: "cc" | "audio", tracks: TrackItem[]): Promise<void> {
        const existing = document.querySelector(`.${CSS.POPUP}`);
        if (existing) {
            existing.remove();
            return;
        }

        if (tracks.length === 0) return;

        this.renderHeader(type);
        await this.renderList(tracks);

        this.root.style.visibility = "hidden";
        document.body.appendChild(this.root);
        this.positionPopup();
        this.root.style.visibility = "visible";
    }

    private renderHeader(type: "cc" | "audio"): void {
        const header = createElement("div", CSS.POPUP_HEADER);
        const iconPath = type === "cc" ? ICON_CC : ICON_AUDIO;

        const iconContainer = createElement("div", CSS.ICON);
        iconContainer.appendChild(createSvgIcon(iconPath));

        // Options button
        const optionsBtn = createElement("button", CSS.POPUP_HEADER_ACTION);
        optionsBtn.appendChild(createSvgIcon(ICON_SETTINGS, 16));
        optionsBtn.title = "Open extension options";
        optionsBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            browser.runtime.openOptionsPage();
        };

        header.appendChild(iconContainer);
        header.appendChild(optionsBtn);
        this.root.appendChild(header);
    }

    private async renderList(tracks: TrackItem[]): Promise<void> {
        const list = createElement("div", CSS.POPUP_LIST);

        await sortTrackByFavorite(tracks);
        const favoriteLangCodes = (await loadSettings()).langCodes;

        tracks.forEach((track) => {
            list.appendChild(
                this.createTrackItem(
                    track,
                    favoriteLangCodes.includes(track.languageCode),
                ),
            );
        });

        this.root.appendChild(list);
    }

    private createTrackItem(
        track: TrackItem,
        isFavorite: boolean,
    ): HTMLElement {
        const item = createElement("div", CSS.POPUP_ITEM);
        item.dataset.languageCode = track.languageCode;
        if (isFavorite) item.classList.add(CSS.MOD_FAVORITE);

        // Name
        const name = createElement("span", CSS.POPUP_ITEM_NAME);
        name.textContent = track.name;

        // Actions container
        const actions = createElement("div", `${CSS.POPUP_ITEM}-actions`);

        // Language code badge
        const code = createElement("span", CSS.POPUP_ITEM_CODE);
        code.textContent = track.languageCode;

        // Favorite button
        const favBtn = createElement("button", CSS.POPUP_ITEM_ACTION);
        if (isFavorite) favBtn.classList.add(CSS.MOD_FAVORITE);
        favBtn.appendChild(createSvgIcon(ICON_HEART, 14));
        favBtn.title = isFavorite
            ? "Remove from favorites"
            : "Add to favorites";

        // Click handler for entire item
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFavorite(item, favBtn, track.languageCode);
        };

        actions.appendChild(code);
        actions.appendChild(favBtn);
        item.appendChild(name);
        item.appendChild(actions);

        return item;
    }

    private async toggleFavorite(
        item: HTMLElement,
        button: HTMLElement,
        languageCode: string,
    ): Promise<void> {
        const isFavorite = item.classList.contains(CSS.MOD_FAVORITE);
        let favoriteLangCodes = (await loadSettings()).langCodes;
        if (isFavorite) {
            favoriteLangCodes = favoriteLangCodes.filter(
                (code) => code !== languageCode,
            );
            item.classList.remove(CSS.MOD_FAVORITE);
            button.classList.remove(CSS.MOD_FAVORITE);
            button.title = "Add to favorites";
        } else {
            item.classList.add(CSS.MOD_FAVORITE);
            button.classList.add(CSS.MOD_FAVORITE);
            button.title = "Remove from favorites";
            if (!favoriteLangCodes.includes(languageCode)) {
                favoriteLangCodes.push(languageCode);
            }
        }
        await saveSettings({ langCodes: favoriteLangCodes });
        window.dispatchEvent(
            new CustomEvent(EXTENSION_EVENTS.langCodesUpdated),
        );
    }

    private positionPopup(): void {
        const rect = this.parent.getBoundingClientRect();
        const isBottomHalf = rect.top > window.innerHeight / 2;

        this.root.classList.add(isBottomHalf ? CSS.MOD_BOTTOM : CSS.MOD_TOP);

        // Calculate horizontal position
        let left = rect.left;
        const width = this.root.clientWidth;
        const rightOverflow = left + width - window.innerWidth + 24;
        if (rightOverflow > 0) {
            left -= rightOverflow;
        }
        this.root.style.left = `${left}px`;

        // Calculate vertical position
        if (isBottomHalf) {
            // Show above parent
            this.root.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        } else {
            // Show below parent
            this.root.style.top = `${rect.bottom + 4}px`;
        }
    }
}

// Global click handler to close popups
document.addEventListener("click", (event: MouseEvent) => {
    const popup = document.querySelector(`.${CSS.POPUP}`);
    if (popup && !popup.contains(event.target as Node)) {
        popup.remove();
    }
});

// Close popup on scroll (but not when scrolling inside the popup)
window.addEventListener(
    "scroll",
    (event: Event) => {
        const popup = document.querySelector(`.${CSS.POPUP}`);
        if (popup && !popup.contains(event.target as Node)) {
            popup.remove();
        }
    },
    true,
);
