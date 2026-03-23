import { html, render, type TemplateResult } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";

import { Settings } from "@/common/settings";
import type { TrackItem } from "@/common/types";
import {
    CSS,
    ICON_AUDIO,
    ICON_CC,
    ICON_HEART,
    ICON_SETTINGS,
} from "../../constants";
import { sortTrackByFavorite } from "../utils";
import { svgIconTemplate } from "./utils";

// ─── Templates ──────────────────────────────────────────────────────

function headerTemplate(iconPath: string): TemplateResult {
    return html`
        <div class="${CSS.POPUP_HEADER}">
            <div class="${CSS.ICON}">${svgIconTemplate(iconPath)}</div>
            <button
                class="${CSS.POPUP_HEADER_ACTION}"
                title="Open extension options"
                @click=${(e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    browser.runtime.openOptionsPage();
                }}
            >
                ${svgIconTemplate(ICON_SETTINGS, 16)}
            </button>
        </div>
    `;
}

function trackItemTemplate(
    track: TrackItem,
    isFavorite: boolean,
    onToggle: (code: string) => void,
): TemplateResult {
    const itemClasses = {
        [CSS.POPUP_ITEM]: true,
        [CSS.MOD_FAVORITE]: isFavorite,
    };

    const actionClasses = {
        [CSS.POPUP_ITEM_ACTION]: true,
        [CSS.MOD_FAVORITE]: isFavorite,
    };

    return html`
        <div
            class=${classMap(itemClasses)}
            data-language-code="${track.languageCode}"
            @click=${(e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle(track.languageCode);
            }}
        >
            <span class="${CSS.POPUP_ITEM_NAME}">${track.name}</span>
            <div class="${CSS.POPUP_ITEM}-actions">
                <span class="${CSS.POPUP_ITEM_CODE}">
                    ${track.languageCode}
                </span>
                <button
                    class=${classMap(actionClasses)}
                    title=${isFavorite
                        ? "Remove from favorites"
                        : "Add to favorites"}
                >
                    ${svgIconTemplate(ICON_HEART, 14)}
                </button>
            </div>
        </div>
    `;
}

function listTemplate(
    tracks: TrackItem[],
    favoriteLangCodes: string[],
    onToggle: (code: string) => void,
): TemplateResult {
    return html`
        <div class="${CSS.POPUP_LIST}">
            ${tracks.map((track) =>
                trackItemTemplate(
                    track,
                    favoriteLangCodes.includes(track.languageCode),
                    onToggle,
                ),
            )}
        </div>
    `;
}

function popupTemplate(
    type: "cc" | "audio",
    tracks: TrackItem[],
    onToggle: (code: string) => void,
): TemplateResult {
    const iconPath = type === "cc" ? ICON_CC : ICON_AUDIO;
    return html`
        ${headerTemplate(iconPath)}
        ${listTemplate(tracks, Settings.langCodes.get(), onToggle)}
    `;
}

// ─── Positioning ────────────────────────────────────────────────────

function positionPopup(root: HTMLElement, parent: HTMLElement): void {
    const rect = parent.getBoundingClientRect();
    const isBottomHalf = rect.top > window.innerHeight / 2;

    root.classList.add(isBottomHalf ? CSS.MOD_BOTTOM : CSS.MOD_TOP);

    let left = rect.left;
    const rightOverflow = left + root.clientWidth - window.innerWidth + 24;
    if (rightOverflow > 0) left -= rightOverflow;
    root.style.left = `${left}px`;

    if (isBottomHalf) {
        root.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
        root.style.top = `${rect.bottom + 4}px`;
    }
}

// ─── Public API ─────────────────────────────────────────────────────

export function showTrackPopup(
    parent: HTMLElement,
    type: "cc" | "audio",
    tracks: TrackItem[],
): void {
    const existing = document.querySelector(`.${CSS.POPUP}`);
    if (existing) {
        existing.remove();
        return;
    }

    if (tracks.length === 0) return;

    sortTrackByFavorite(tracks);

    const root = document.createElement("div");
    root.className = CSS.POPUP;
    root.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };

    const renderContent = () => {
        render(popupTemplate(type, tracks, toggleFavorite), root);
    };

    const toggleFavorite = (languageCode: string) => {
        if (Settings.langCodes.get().includes(languageCode)) {
            Settings.langCodes.remove(languageCode);
        } else {
            Settings.langCodes.add(languageCode);
        }

        renderContent();
    };

    renderContent();

    root.style.visibility = "hidden";
    document.body.appendChild(root);
    positionPopup(root, parent);
    root.style.visibility = "visible";
}

// ─── Global listeners to close popups ───────────────────────────────

function closePopupOutside(event: Event): void {
    const popup = document.querySelector(`.${CSS.POPUP}`);
    if (popup && !popup.contains(event.target as Node)) {
        popup.remove();
    }
}

document.addEventListener("click", closePopupOutside);
window.addEventListener("scroll", closePopupOutside, true);
