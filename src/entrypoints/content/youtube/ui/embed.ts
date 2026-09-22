import { ICON_AUDIO, ICON_CC, svgIconTemplate } from "@/common/icons";
import { Settings } from "@/common/settings";
import type { TrackItem, VideoInfo } from "@/common/types";
import { html, nothing, render, type TemplateResult } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { CSS, EVENT } from "../../constants";
import { resolveVideoInfo } from "../api";
import { applyCardFilter, clearCardFilter } from "../filter";
import { badgeTracks, sortByFavorite } from "../tracks";
import { showTrackPopup } from "./popup";

function badgeTemplate(track: TrackItem): TemplateResult {
    return html`
        <span class="${CSS.BADGE} ${CSS.TOOLTIP}">
            ${track.languageCode.toUpperCase()}
            <span class="${CSS.TOOLTIP_TEXT}">
                ${track.name || track.languageCode}
            </span>
        </span>
    `;
}

function badgeListTemplate(
    tracks: TrackItem[],
    favoriteLangCodes: string[],
): TemplateResult {
    const favoriteTracks = sortByFavorite(
        tracks.filter((t) => favoriteLangCodes.includes(t.languageCode)),
        favoriteLangCodes,
    );
    const remaining = tracks.length - favoriteTracks.length;

    return html`
        ${favoriteTracks.map((t) => badgeTemplate(t))}
        ${favoriteTracks.length > 0 && remaining > 0
            ? html`<span class="${CSS.BADGE} ${CSS.BADGE_MORE}">
                  +${remaining}
              </span>`
            : nothing}
    `;
}

function sectionTemplate(
    tracks: TrackItem[],
    icon: string,
    type: "cc" | "audio",
    favoriteLangCodes: string[],
): TemplateResult {
    const hasFavorite = tracks.some((t) =>
        favoriteLangCodes.includes(t.languageCode),
    );

    const iconClasses = {
        [CSS.ICON]: true,
        [CSS.ICON_ACTIVE]: hasFavorite,
    };

    const open = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.currentTarget;
        if (item instanceof HTMLElement) showTrackPopup(item, type, tracks);
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        open(e);
    };

    // The badge is a div (the SCSS styles it as a flex row), so it needs the
    // button semantics and keyboard handling spelled out by hand.
    const typeLabel = type === "cc" ? "Subtitle" : "Audio";
    const label = `${typeLabel} tracks: ${tracks.length}`;

    return html`
        <div
            class="${CSS.ITEM}"
            role="button"
            tabindex=${tracks.length > 0 ? "0" : "-1"}
            aria-label=${label}
            @click=${open}
            @keydown=${handleKeydown}
        >
            <div class=${classMap(iconClasses)}>${svgIconTemplate(icon)}</div>
            <span class="${CSS.BADGES}">
                ${badgeListTemplate(tracks, favoriteLangCodes)}
            </span>
        </div>
    `;
}

function embedTemplate(info: VideoInfo): TemplateResult {
    const favCodes = Settings.langCodes.get();

    return html`
        ${sectionTemplate(info.captions, ICON_CC, "cc", favCodes)}
        ${sectionTemplate(info.audioTracks, ICON_AUDIO, "audio", favCodes)}
    `;
}

// ─── Public API ──────────────────────────────────────────────────────

/** The element the badges render into; `data-href` records which video. */
export function createEmbedContainer(videoUrl: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add(
        CSS.CONTAINER,
        CSS.CONTAINER_THUMBNAIL,
        CSS.CORNER_BOTTOM_LEFT,
    );
    container.dataset.href = videoUrl;
    // Keep mousedown from reaching the card underneath (focus, drag start and
    // YouTube's own handlers).
    container.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    return container;
}

/**
 * The tracks worth a badge: human captions and dubs, without auto-generated
 * captions and the original audio. Null when the lookup failed (no video id,
 * rate limited, fetch error, video not playable).
 */
async function lookupTracks(
    container: HTMLElement,
    videoUrl: string,
): Promise<VideoInfo | null> {
    try {
        // A container torn down while the lookup waits its turn (a recycled
        // card, or stop()) has no use for the result; spare the request.
        const info = await resolveVideoInfo(
            videoUrl,
            () => container.isConnected,
        );
        return info ? badgeTracks(info) : null;
    } catch (e) {
        logger.error("initEmbed failed:", e);
        return null;
    }
}

/**
 * Renders the badges once the lookup resolves; there is no loading state. An
 * unavailable video renders nothing at all: drawing "0 tracks" would be a lie
 * that looks identical to a video with no captions.
 *
 * The language filter rides along: the card is a placeholder while the
 * lookup is pending, and every render hands it to applyCardFilter(), which
 * hides it while the filter is on and the video has no favorite track.
 */
export async function initEmbed(
    container: HTMLElement,
    videoUrl: string,
): Promise<void> {
    // A recycled card may still carry the state of the video it held before.
    clearCardFilter(container);

    const info = await lookupTracks(container, videoUrl);

    // The container may have been torn down while the lookup was pending
    // (stop(), or YouTube dropping the card); nothing to draw into then.
    if (!container.isConnected) return;
    if (!info) {
        applyCardFilter(container, null);
        return;
    }

    const updateView = () => {
        render(embedTemplate(info), container);
        applyCardFilter(container, info);
    };
    updateView();
    container.addEventListener(EVENT.RENDER, updateView);
}
