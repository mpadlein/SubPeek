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
    if (Settings.renderCodeInsteadOfName.get()) {
        return html`
            <span class="${CSS.BADGE} ${CSS.TOOLTIP}">
                ${track.languageCode.toUpperCase()}
                <span class="${CSS.TOOLTIP_TEXT}">
                    ${track.name || track.languageCode}
                </span>
            </span>
        `;
    }
    return html`
        <span class="${CSS.BADGE}"> ${track.name || track.languageCode} </span>
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
    if (!Settings.renderEmpty.get() && tracks !== null && tracks.length === 0) {
        return html``;
    }

    const hasFavorite =
        tracks?.some((t) => favoriteLangCodes.includes(t.languageCode)) ??
        false;

    const iconClasses = {
        [CSS.ICON]: true,
        [CSS.ICON_ACTIVE]: hasFavorite,
    };

    const open = (e: Event) => {
        if (!tracks) return;
        e.preventDefault();
        e.stopPropagation();
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
        ${Settings.renderAudio.get()
            ? sectionTemplate(audioTracks, ICON_AUDIO, "audio", favCodes)
            : nothing}
    `;
}

// ─── Public API ──────────────────────────────────────────────────────

export async function initEmbed(
    container: HTMLElement,
    videoUrl: string,
): Promise<void> {
    let captionTracks: CaptionTrack[] | null = null;
    let audioTracks: AudioTrack[] | null = null;

    const updateView = () => {
        render(embedTemplate(captionTracks, audioTracks), container);
    };

    try {
        const data = await resolveVideoInfo(videoUrl);
        captionTracks = data.captions.filter((t) => !t.auto);
        audioTracks = data.audioTracks.filter((t) => !t.origin);
        sortTrackByFavorite(captionTracks);
        sortTrackByFavorite(audioTracks);
    } catch (e) {
        logger.error("initEmbed failed:", e);
        captionTracks = [];
        audioTracks = [];
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
Settings.renderAudio.subscribe(() => {
    handleUserLangCodesUpdate();
});
Settings.renderEmpty.subscribe(() => {
    handleUserLangCodesUpdate();
});
