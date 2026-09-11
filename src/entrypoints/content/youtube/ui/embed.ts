import { Settings } from "@/common/settings";
import type { AudioTrack, CaptionTrack } from "@/common/types";
import { type TrackItem } from "@/common/types";
import { html, nothing, render, type TemplateResult } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { CSS, EVENT, ICON_AUDIO, ICON_CC } from "../../constants";
import { resolveVideoInfo } from "../api";
import { sortTrackByFavorite } from "../utils";
import { showTrackPopup } from "./popup";
import { svgIconTemplate } from "./utils";

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

    const favoriteTracks = tracks.filter((t) =>
        favoriteLangCodes.includes(t.languageCode),
    );
    const remaining = tracks.length - favoriteTracks.length;

    return html`
        ${favoriteTracks.map((t) => badgeTemplate(t))}
        ${favoriteTracks.length > 0 && remaining > 0
            ? html`<span class="${CSS.BADGE} ${CSS.BADGE}--more">
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
        if (!tracks) return;
        const target = (e.currentTarget as HTMLElement).closest(
            `.${CSS.ITEM}`,
        ) as HTMLElement;
        showTrackPopup(target, type, tracks);
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
            const captions = data.captions.filter((t) => !t.auto);
            const audioTracks = data.audioTracks.filter((t) => !t.origin);
            sortTrackByFavorite(captions);
            sortTrackByFavorite(audioTracks);
            state = { kind: "ready", captions, audioTracks };
        } else {
            state = { kind: "unavailable" };
        }
    } catch (e) {
        logger.error("initEmbed failed:", e);
        state = { kind: "unavailable" };
    } finally {
        updateView();
    }

    container.addEventListener(EVENT.RENDER, updateView);
}
function handleUserLangCodesUpdate() {
    document.querySelectorAll(`.${CSS.CONTAINER}`).forEach((el) => {
        el.dispatchEvent(new CustomEvent(EVENT.RENDER));
    });
}

Settings.langCodes.subscribe(() => {
    logger.debug("User language codes updated, re-rendering embeds...");
    handleUserLangCodesUpdate();
});
