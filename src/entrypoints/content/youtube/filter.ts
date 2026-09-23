import { logoTemplate } from "@/common/icons";
import { Settings } from "@/common/settings";
import type { VideoInfo } from "@/common/types";
import { html, nothing, render } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { CSS, CSS_PREFIX } from "../constants";
import { hasFavoriteTrack } from "./tracks";
import { openOptionsPage } from "./ui/options";
import { rerenderEmbeds } from "./ui/rerender";

// "Only show my languages": a switch in the header of search results
// and channel Videos tabs. While it is on, embed.ts hands every rendered badge
// container to applyCardFilter(), which hides the card when the video has no
// human caption or dub in a favorite language. No lookups of its own: the
// filter only reuses what the badges already fetched, so it costs no extra
// requests. It starts off on every page and resets on SPA navigation.
// main.ts wires startFilter()/stopFilter() into start()/stop() and hands
// every added element to mountFilterIn().
//
// Each card carries one state attribute (STATE_ATTR): "pending" from the
// moment thumbnails.ts tracks its thumbnail, then "shown" or "hidden" once
// the video is known. The states only take effect under the root class
// CSS.FILTERING, which is on the <html> element while the switch is on. A
// pending card is then an invisible placeholder that keeps its space
// (visibility: hidden, so it still scrolls into view and gets its lookup, and
// YouTube still loads more results after it), and content only appears once
// the video is known to match; a non-match collapses before anyone saw it.
// That is what stops cards from flashing and vanishing. A card no thumbnail
// is tracked in (a Short, a playlist) never gets a state and stays visible.

/** Where the switch goes on each kind of page. */
interface Placement {
    path: RegExp;
    /** The element the switch is placed relative to. */
    anchor: string;
    /** Whether the switch goes inside the anchor or right after it. */
    position: "append" | "after";
    /** Modifier class on the wrapper, for the layout in that spot. */
    modifier: string;
}

// The anchors carry Polymer's scope class (`#header.ytd-search`), which tells
// the page header apart from the `#header` divs inside result cards, such as
// the "Summary" box on search results.
const PLACEMENTS: Placement[] = [
    // Search results: the switch is a row of its own after the chip-row
    // header (All, Shorts, ...). Not inside it: YouTube gives `#header` a
    // fixed height, so a second row in there is covered by the results.
    {
        path: /^\/results$/,
        anchor: "ytd-search #header.ytd-search",
        position: "after",
        modifier: CSS.FILTER_HOST_ROW,
    },
    // Channel Videos tab: the chip bar (Latest, Popular, Oldest) is a flex row
    // with free space on the right. The home feed uses the same grid, which
    // is why the path is checked as well.
    {
        path: /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/videos$/,
        anchor: "#header.ytd-rich-grid-renderer > chip-bar-view-model",
        position: "append",
        modifier: CSS.FILTER_HOST_INLINE,
    },
];

// Outermost first: on a channel grid the lockup sits inside a rich item, and
// hiding only the lockup would leave an empty grid cell.
const CARD_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "yt-lockup-view-model",
];

/** Per-card filter state; absent on cards the extension does not track. */
const STATE_ATTR = `data-${CSS_PREFIX}-filter`;
type CardState = "pending" | "shown" | "hidden";
const HIDDEN_SELECTOR = `[${STATE_ATTR}="hidden"]`;

const NAVIGATE_EVENT = "yt-navigate-finish";
const LABEL = "Only show my languages";
const TITLE = "Hide videos without captions or dubbed audio in your languages";
// With no favorite languages there is nothing to filter by (every card would
// hide), so the switch is disabled and a button opens the settings instead.
const DISABLED_TITLE = "Choose your favorite languages first";
const NO_FAVORITES_HINT = "No favorite languages yet.";
const CHOOSE_LABEL = "Choose languages";
const CHOOSE_TITLE = "Open SubPeek settings in a new tab";

/** The wrapper placed into the page: the switch and the hidden count. */
let host: HTMLDivElement | null = null;
/** The element `host` was placed against, to spot a header being reused. */
let anchor: Element | null = null;
let started = false;
let unsubscribeFavorites: (() => void) | null = null;
let filterOn = false;
/** Cards hidden right now, shown next to the switch. */
let hiddenCount = 0;
let countUpdateQueued = false;

function placementFor(pathname: string): Placement | null {
    return PLACEMENTS.find((p) => p.path.test(pathname)) ?? null;
}

function hasFavorites(): boolean {
    return Settings.langCodes.get().length > 0;
}

function cardOf(container: HTMLElement): HTMLElement | null {
    for (const selector of CARD_SELECTORS) {
        const card = container.closest<HTMLElement>(selector);
        if (card) return card;
    }
    return null;
}

function setCardState(card: HTMLElement, state: CardState): void {
    card.setAttribute(STATE_ATTR, state);
}

/**
 * Records whether the card around a badge container is shown or hidden.
 * `info` is what the badges render; null means the video could not be
 * looked up, which shows the card: hiding it would be a guess. The state is
 * written whether or not the switch is on, so a card whose lookup failed
 * (and which therefore has no render listener) is not left as a placeholder
 * when the switch is turned on later.
 */
export function applyCardFilter(
    container: HTMLElement,
    info: VideoInfo | null,
): void {
    const card = cardOf(container);
    if (!card) return;
    const hide =
        filterOn &&
        info !== null &&
        !hasFavoriteTrack(info, Settings.langCodes.get());
    setCardState(card, hide ? "hidden" : "shown");
    queueCountUpdate();
}

/**
 * Marks the card around a tracked thumbnail as "not known yet", a placeholder
 * while the switch is on. thumbnails.ts calls it as soon as it tracks the
 * thumbnail, before that scrolls into view: YouTube renders cards below the
 * fold ahead of time, and one that only became a placeholder when its lookup
 * started would show for a moment first. A card that already has a state
 * keeps it: the state is per card, and a further image tracked in a known
 * card (a hover asset YouTube adds later) is not a new video, so it must not
 * turn the card back into a placeholder, which nothing would resolve if that
 * image never scrolls into view.
 */
export function markCardPending(el: HTMLElement): void {
    const card = cardOf(el);
    if (card && !card.hasAttribute(STATE_ATTR)) setCardState(card, "pending");
}

/**
 * Puts the card back to "not known yet", whatever it was. thumbnails.ts
 * calls it when YouTube recycles a card for another video, since the card
 * must not keep the state of the video it held before.
 */
export function clearCardFilter(container: HTMLElement): void {
    const card = cardOf(container);
    if (card) setCardState(card, "pending");
    queueCountUpdate();
}

function showHiddenCards(): void {
    document
        .querySelectorAll<HTMLElement>(HIDDEN_SELECTOR)
        .forEach((card) => setCardState(card, "shown"));
    queueCountUpdate();
}

function clearAllCards(): void {
    document
        .querySelectorAll(`[${STATE_ATTR}]`)
        .forEach((card) => card.removeAttribute(STATE_ATTR));
    queueCountUpdate();
}

/**
 * Recounts the hidden cards once per microtask: applyCardFilter() runs for
 * every card when the switch is toggled or the favorites change, and a DOM
 * query per card would add up. Counting the DOM rather than keeping a tally
 * also stays right when YouTube drops a hidden card. Nothing to count while
 * the switch is off or absent: the number is shown only while it is on, and
 * cards get their marks on every page, the home feed included.
 */
function queueCountUpdate(): void {
    if (!filterOn || !host || countUpdateQueued) return;
    countUpdateQueued = true;
    queueMicrotask(() => {
        countUpdateQueued = false;
        const count = document.querySelectorAll(HIDDEN_SELECTOR).length;
        if (count === hiddenCount) return;
        hiddenCount = count;
        renderHost();
    });
}

// Every embed re-applies the filter to its card as part of rendering, so a
// toggle is a re-render of every embed (rerenderEmbeds()), not a DOM scan.
// Without favorites the switch is disabled, but the guard here also covers
// a favorites change that arrives while it is on.
function setFilterOn(wanted: boolean): void {
    const on = wanted && hasFavorites();
    if (filterOn === on) return;
    filterOn = on;
    document.documentElement.classList.toggle(CSS.FILTERING, on);
    if (!on) {
        // Nothing stays hidden once the switch is off, and the count is not
        // recomputed while it is off, so the next turn-on starts from zero.
        hiddenCount = 0;
        // A card whose lookup failed has no render listener, so the
        // re-render below cannot reach it; show every hidden card here.
        showHiddenCards();
    }
    renderHost();
    rerenderEmbeds();
}

// Favorites change from the settings popup, another tab or the in-page track
// popup; losing the last one while the switch is on turns it off, and the
// host re-renders either way so the switch is enabled exactly when there is
// something to filter by.
function onFavoritesChange(): void {
    if (!hasFavorites()) setFilterOn(false);
    renderHost();
}

// The checkbox stays in the DOM (visually hidden by the SCSS) so it keeps
// keyboard focus and the role=switch semantics; the track is the visual. The
// count span is always rendered and has text only while the switch is on: a
// live region announces changes, not its own arrival, so it must exist
// before the first "0 hidden". That first value shows as soon as the switch
// is on, so the user can see the filter is active before anything is hidden.
// With no favorites the switch is disabled and a hint plus a button that
// opens the settings page follow it, since the count would never show.
function hostTemplate() {
    const enabled = hasFavorites();
    const onChange = (e: Event) => {
        setFilterOn((e.target as HTMLInputElement).checked);
    };
    const classes = { [CSS.FILTER]: true, [CSS.FILTER_DISABLED]: !enabled };
    return html`
        <label
            class=${classMap(classes)}
            title=${enabled ? TITLE : DISABLED_TITLE}
        >
            <span class="${CSS.FILTER_LOGO}">${logoTemplate(16)}</span>
            <span class="${CSS.FILTER_LABEL}">${LABEL}</span>
            <input
                type="checkbox"
                role="switch"
                class="${CSS.FILTER_INPUT}"
                ?disabled=${!enabled}
                .checked=${filterOn}
                @change=${onChange}
            />
            <span class="${CSS.FILTER_TRACK}"></span>
        </label>
        <span class="${CSS.FILTER_COUNT}" aria-live="polite">
            ${filterOn ? `${hiddenCount} hidden` : nothing}
        </span>
        ${enabled
            ? nothing
            : html`<span class="${CSS.FILTER_HINT}">${NO_FAVORITES_HINT}</span
                  ><button
                      type="button"
                      class="${CSS.FILTER_ACTION}"
                      title=${CHOOSE_TITLE}
                      @click=${openOptionsPage}
                  >
                      ${CHOOSE_LABEL}
                  </button>`}
    `;
}

function renderHost(): void {
    if (host) render(hostTemplate(), host);
}

/**
 * Mounts the switch into the header found in `root` (an element YouTube just
 * added, or the whole document) when the current page is filterable and the
 * switch is not already there. YouTube builds headers asynchronously and
 * re-creates or reuses them across SPA navigations, so this runs from the
 * added-nodes observer as well as on navigation.
 */
export function mountFilterIn(root: ParentNode): void {
    if (!started) return;
    const placement = placementFor(location.pathname);
    if (!placement) return;

    // The added element may be the anchor, sit inside it, or contain it.
    const found =
        (root instanceof Element ? root.closest(placement.anchor) : null) ??
        root.querySelector(placement.anchor);
    if (!found) return;
    if (host?.isConnected && anchor === found) return;

    unmountHost();
    host = document.createElement("div");
    host.classList.add(CSS.FILTER_HOST, placement.modifier);
    renderHost();
    if (placement.position === "after") found.after(host);
    else found.appendChild(host);
    anchor = found;
}

function unmountHost(): void {
    host?.remove();
    host = null;
    anchor = null;
}

// YouTube recycles cards across SPA navigations, so a card hidden on one
// search would come back hidden holding a different video. The switch is
// removed too: ytd-browse is reused between the home feed and a channel, so
// a header that stays in place would otherwise keep the switch on the wrong
// page.
function onNavigate(): void {
    setFilterOn(false);
    unmountHost();
    mountFilterIn(document);
}

// ─── Public API ──────────────────────────────────────────────────────

export function startFilter(): void {
    if (started) return;
    started = true;
    document.addEventListener(NAVIGATE_EVENT, onNavigate);
    unsubscribeFavorites = Settings.langCodes.subscribe(onFavoritesChange);
    onNavigate();
}

export function stopFilter(): void {
    if (!started) return;
    started = false;
    document.removeEventListener(NAVIGATE_EVENT, onNavigate);
    unsubscribeFavorites?.();
    unsubscribeFavorites = null;
    setFilterOn(false);
    clearAllCards();
    unmountHost();
}
