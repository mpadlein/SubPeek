import { ICON_AUDIO, ICON_CC, svgIconTemplate } from "@/common/icons";
import { Settings } from "@/common/settings";
import type { AudioTrack, CaptionTrack, TrackItem } from "@/common/types";
import { html, nothing, render, type TemplateResult } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { CSS, EVENT } from "../../constants";
import { resolveVideoInfo } from "../api";
import { sortByFavorite } from "../tracks";
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
    tracks: TrackItem[] | null,
    favoriteLangCodes: string[],
): TemplateResult {
    if (tracks === null) {
        return html`<div class="${CSS.LOADING_SPINNER}"></div>`;
    }

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
    tracks: TrackItem[] | null,
    icon: string,
    type: "cc" | "audio",
    favoriteLangCodes: string[],
): TemplateResult {
    const hasFavorite =
        tracks?.some((t) => favoriteLangCodes.includes(t.languageCode)) ??
        false;

    const iconClasses = {
        [CSS.ICON]: true,
        [CSS.ICON_ACTIVE]: hasFavorite,
    };

    const open = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.currentTarget;
        if (!tracks || !(item instanceof HTMLElement)) return;
        showTrackPopup(item, type, tracks);
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        open(e);
    };

    // The badge is a div (the SCSS styles it as a flex row), so it needs the
    // button semantics and keyboard handling spelled out by hand.
    const typeLabel = type === "cc" ? "Subtitle" : "Audio";
    const isInteractive = tracks !== null && tracks.length > 0;
    const label =
        tracks === null
            ? `${typeLabel} tracks, loading`
            : `${typeLabel} tracks: ${tracks.length}`;

    return html`
        <div
            class="${CSS.ITEM}"
            role="button"
            tabindex=${isInteractive ? "0" : "-1"}
            aria-label=${label}
            aria-busy=${tracks === null}
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

function embedTemplate(
    captions: TrackItem[] | null,
    audioTracks: TrackItem[] | null,
): TemplateResult {
    const favCodes = Settings.langCodes.get();

    return html`
        ${sectionTemplate(captions, ICON_CC, "cc", favCodes)}
        ${sectionTemplate(audioTracks, ICON_AUDIO, "audio", favCodes)}
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
 * `loading` shows the spinner, `ready` shows the badges, and `unavailable`
 * shows nothing at all: the lookup failed (no video id, rate limited, fetch
 * error, video not playable), so drawing "0 tracks" would be a lie that looks
 * identical to a video with no captions.
 */
type EmbedState =
    | { kind: "loading" }
    | { kind: "unavailable" }
    | { kind: "ready"; captions: CaptionTrack[]; audioTracks: AudioTrack[] };

export async function initEmbed(
    container: HTMLElement,
    videoUrl: string,
): Promise<void> {
    let state: EmbedState = { kind: "loading" };

    const updateView = () => {
        switch (state.kind) {
            case "unavailable":
                render(nothing, container);
                break;
            case "loading":
                render(embedTemplate(null, null), container);
                break;
            case "ready":
                render(
                    embedTemplate(state.captions, state.audioTracks),
                    container,
                );
                break;
        }
    };

    try {
        const data = await resolveVideoInfo(videoUrl);
        if (data) {
            const captions = data.captions.filter((t) => !t.isAutoGenerated);
            const audioTracks = data.audioTracks.filter((t) => !t.isOriginal);
            state = { kind: "ready", captions, audioTracks };
        } else {
            state = { kind: "unavailable" };
        }
    } catch (e) {
        logger.error("initEmbed failed:", e);
        state = { kind: "unavailable" };
    }

    // The container may have been torn down while the lookup was pending
    // (stop(), or YouTube dropping the card); nothing to draw into then.
    if (!container.isConnected) return;

    updateView();
    container.addEventListener(EVENT.RENDER, updateView);
}

/** Redraws every mounted embed; main.ts calls it when the favorites change. */
export function rerenderEmbeds(): void {
    logger.debug("Favorites changed, re-rendering embeds");
    document.querySelectorAll(`.${CSS.CONTAINER}`).forEach((el) => {
        el.dispatchEvent(new CustomEvent(EVENT.RENDER));
    });
}
