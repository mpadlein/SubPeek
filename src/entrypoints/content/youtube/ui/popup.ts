import { html, render, type TemplateResult } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";

import {
    ICON_AUDIO,
    ICON_CC,
    ICON_HEART,
    ICON_POWER,
    ICON_SETTINGS,
    logoTemplate,
    svgIconTemplate,
} from "@/common/icons";
import { messaging } from "@/common/messaging";
import { Settings } from "@/common/settings";
import type { TrackItem } from "@/common/types";
import { CSS } from "../../constants";
import { sortTrackByFavorite } from "../tracks";

// ─── Templates ──────────────────────────────────────────────────────

function openOptionsPage(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    // runtime.openOptionsPage() is not exposed to content scripts - the
    // background script opens it for us.
    messaging.openOptionsPage().catch((error) => {
        logger.error("Could not open options page:", error);
    });
}

// This popup only exists while SubPeek is on, so the button can only ever
// turn it off; the toolbar popup is the way back, which the tooltip says.
// The storage listener tears this popup down along with everything else.
const TURN_OFF_LABEL = "Turn off SubPeek (turn back on from the toolbar icon)";
function turnOff(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    Settings.enabled.set(false);
}

function headerTemplate(iconPath: string): TemplateResult {
    return html`
        <div class="${CSS.POPUP_HEADER}">
            <div class="${CSS.POPUP_LOGO}">${logoTemplate(18)}</div>
            <div class="${CSS.ICON}">${svgIconTemplate(iconPath)}</div>
            <div class="${CSS.POPUP_HEADER_ACTIONS}">
                <button
                    type="button"
                    class="${CSS.POPUP_HEADER_ACTION} ${CSS.POPUP_HEADER_ACTION_DANGER}"
                    title=${TURN_OFF_LABEL}
                    aria-label=${TURN_OFF_LABEL}
                    @click=${turnOff}
                >
                    ${svgIconTemplate(ICON_POWER, 16)}
                </button>
                <button
                    type="button"
                    class="${CSS.POPUP_HEADER_ACTION}"
                    title="Open extension options"
                    aria-label="Open extension options"
                    @click=${openOptionsPage}
                >
                    ${svgIconTemplate(ICON_SETTINGS, 16)}
                </button>
            </div>
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

    const label = `${isFavorite ? "Remove" : "Add"} ${
        track.name || track.languageCode
    } ${isFavorite ? "from" : "to"} favorites`;

    const toggle = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(track.languageCode);
    };

    return html`
        <div
            class=${classMap(itemClasses)}
            role="listitem"
            data-language-code="${track.languageCode}"
            @click=${toggle}
        >
            <span class="${CSS.POPUP_ITEM_NAME}">${track.name}</span>
            <div class="${CSS.POPUP_ITEM}-actions">
                <span class="${CSS.POPUP_ITEM_CODE}">
                    ${track.languageCode}
                </span>
                <button
                    type="button"
                    class=${classMap(actionClasses)}
                    title=${label}
                    aria-label=${label}
                    aria-pressed=${isFavorite}
                    @click=${toggle}
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
        <div class="${CSS.POPUP_LIST}" role="list">
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

/** The badge that opened the currently visible popup, if any. */
let activeSource: HTMLElement | null = null;

export function showTrackPopup(
    parent: HTMLElement,
    type: "cc" | "audio",
    tracks: TrackItem[],
): void {
    const existing = document.querySelector(`.${CSS.POPUP}`);
    const wasSameSource = activeSource === parent;

    if (existing) {
        existing.remove();
        activeSource = null;
    }

    // Re-clicking the badge that opened the popup toggles it closed; clicking a
    // different badge switches straight to that one rather than just closing.
    if (wasSameSource) return;

    if (tracks.length === 0) return;

    sortTrackByFavorite(tracks);

    const root = document.createElement("div");
    root.className = CSS.POPUP;
    root.setAttribute("role", "group");
    root.setAttribute(
        "aria-label",
        type === "cc" ? "Subtitle languages" : "Audio languages",
    );
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
    activeSource = parent;
}

// ─── Global listeners to close popups ───────────────────────────────

export function closePopup(): void {
    document.querySelector(`.${CSS.POPUP}`)?.remove();
    activeSource = null;
}

function closePopupOutside(event: Event): void {
    const popup = document.querySelector(`.${CSS.POPUP}`);
    if (popup && !popup.contains(event.target as Node)) {
        closePopup();
    }
}

function closePopupOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    const source = activeSource;
    if (!document.querySelector(`.${CSS.POPUP}`)) return;
    closePopup();
    source?.focus();
}

document.addEventListener("click", closePopupOutside);
document.addEventListener("keydown", closePopupOnEscape);
window.addEventListener("scroll", closePopupOutside, true);
