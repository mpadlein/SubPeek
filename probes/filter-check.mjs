// Pass/fail check for the language filter: on a search page the "Only show
// my languages" switch must sit in a row after the chip header, start off, hide
// exactly the cards whose badges show no favorite track, keep every card
// whose video is not known yet as an invisible placeholder (so nothing flashes
// and vanishes) while YouTube still loads more results, keep doing so for
// cards loaded while scrolling, show everything again when turned off, reset
// on YouTube's SPA navigation, and disappear on a watch page. On a channel
// Videos tab it must sit in the chip bar and work the same way. It also
// checks that the content script's player requests stay within the token
// bucket (40 at once, then three per second), that the switch is legible in
// YouTube's dark and light themes, and saves screenshots of both placements
// (and the light-theme search page) to .temp/filter-check-*.png for a
// visual check.
//
// Usage: node probes/filter-check.mjs [url] [langCode]
// The defaults search "mrbeast reaction" with Thai as the favorite: MrBeast
// dubs his videos into Thai, the reaction channels in the same results do
// not, and YouTube does not auto-dub into it, so the page splits both ways.
// (A plain "mrbeast" search is all his own videos, and any language YouTube
// auto-dubs into, such as "ko", is on every card.)
// Exit 0 = pass, 1 = fail, 2 = could not run (no badges).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const URL_ =
    process.argv[2] ||
    "https://www.youtube.com/results?search_query=mrbeast+reaction";
const LANG = process.argv[3] || "th";
const PORT = 9341;
const PROFILE = path.resolve(".temp/filter-check-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirrors BUCKET_CAPACITY / REFILL_PER_MS in content/youtube/api.ts.
const BUCKET_CAPACITY = 40;
const REFILL_PER_SECOND = 3;

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (!m.id) {
                this.listeners.forEach((l) => l(m));
                return;
            }
            const p = this.pending.get(m.id);
            this.pending.delete(m.id);
            if (!p) return;
            if (m.error) p.reject(new Error(m.error.message));
            else p.resolve(m.result);
        };
    }
    send(method, params = {}, sessionId) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    on(listener) {
        this.listeners.push(listener);
    }
}
async function connect() {
    for (let i = 0; i < 60; i++) {
        try {
            const info = await (
                await fetch(`http://127.0.0.1:${PORT}/json/version`)
            ).json();
            const ws = new WebSocket(info.webSocketDebuggerUrl);
            await new Promise((res, rej) => {
                ws.onopen = res;
                ws.onerror = rej;
            });
            return new CDP(ws);
        } catch {
            await sleep(500);
        }
    }
    throw new Error("no debugging port");
}

const edge = spawn(
    EDGE,
    [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        `--user-data-dir=${PROFILE}`,
        "--window-size=1280,1400",
        "--no-first-run",
        "--no-default-browser-check",
        "--lang=en-US",
        "--hide-scrollbars",
        "about:blank",
    ],
    { stdio: "ignore" },
);

const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(
        `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`,
    );
};

// The filter state and, per outermost video card, whether it is hidden and
// whether its badges show a favorite track. `mismatches` counts cards whose
// hidden state disagrees with the rule: hide iff the filter is on, the badges
// have rendered and none of them is a favorite (the "+N" badge does not
// count). A card whose lookup failed has an empty container and must be
// shown; one whose lookup is still pending is marked "pending" and, while
// the filter is on, must be an invisible placeholder that keeps its space
// (`badPlaceholders` counts cards whose computed visibility disagrees).
// A card is tracked when it holds a processed thumbnail; every tracked card
// must carry a state and no untracked one (a Short, a playlist) may, or it
// would be a placeholder that never resolves (`wrongState` counts both).
const FILTER_SNAPSHOT = `(() => {
    const control = document.querySelector('.ytbext-filter');
    const on = !!control?.querySelector('.ytbext-filter__input')?.checked;
    const filtering = document.documentElement.classList.contains('ytbext-filtering');
    // The label sits in a wrapper (.ytbext-filter-host) that does the layout.
    const name = (el) => el ? el.tagName.toLowerCase() + '#' + el.id : 'none';
    const wrapper = control?.parentElement;
    const host = name(wrapper?.parentElement);
    const after = name(wrapper?.previousElementSibling);
    // The count span is always there and empty while the switch is off.
    const count = document.querySelector('.ytbext-filter__count')?.textContent.trim() || null;
    const all = [...document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model')];
    const cards = all.filter(c => !all.some(o => o !== c && o.contains(c)));
    let hidden = 0, rendered = 0, withFavorite = 0, mismatches = 0, placeholders = 0, badPlaceholders = 0, untracked = 0, wrongState = 0;
    for (const card of cards) {
        const container = card.querySelector('.ytbext-embed-container');
        const isRendered = !!container && container.childElementCount > 0;
        const hasFavorite = !!container?.querySelector('.ytbext-badge:not(.ytbext-badge--more)');
        const state = card.getAttribute('data-ytbext-filter');
        const isHidden = state === 'hidden';
        const tracked = !!card.querySelector('img[data-ytbext-processed]');
        if (isHidden) hidden++;
        if (isRendered) rendered++;
        if (hasFavorite) withFavorite++;
        if (isHidden !== (on && isRendered && !hasFavorite)) mismatches++;
        if (state === 'pending') placeholders++;
        if (!tracked) untracked++;
        if (tracked !== (state !== null)) wrongState++;
        if (!isHidden) {
            const invisible = getComputedStyle(card).visibility === 'hidden';
            if (invisible !== (on && state === 'pending')) badPlaceholders++;
        }
    }
    return { control: !!control, host, after, on, filtering, count, cards: cards.length, hidden, rendered, withFavorite, mismatches, placeholders, badPlaceholders, untracked, wrongState, path: location.pathname + location.search };
})()`;

// The switch sits on YouTube's own surface (the badge and the popup paint
// their own dark backdrop), so its colours have to follow YouTube's theme:
// a `dark` attribute on <html>, set from prefers-color-scheme while signed
// out. `bg` is the first opaque background behind the switch, `text` the
// label's colour; the two are checked for WCAG AA contrast.
const THEME_SNAPSHOT = `(() => {
    const control = document.querySelector('.ytbext-filter');
    const label = control.querySelector('.ytbext-filter__label');
    let el = control.parentElement, bg = null;
    while (el && !bg) {
        const c = getComputedStyle(el).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') bg = c;
        el = el.parentElement;
    }
    return { dark: document.documentElement.hasAttribute('dark'), text: getComputedStyle(label).color, bg };
})()`;
const luminance = (css) => {
    const channel = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = css
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = ({ text, bg }) => {
    if (!text || !bg) return 0;
    const [hi, lo] = [luminance(text), luminance(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
};
const MIN_CONTRAST = 4.5;

try {
    const cdp = await connect();

    let pageTarget = null;
    for (let i = 0; i < 40 && !pageTarget; i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        pageTarget = targetInfos.find((t) => t.type === "page")?.targetId;
        if (!pageTarget) await sleep(300);
    }
    const { sessionId } = await cdp.send("Target.attachToTarget", {
        targetId: pageTarget,
        flatten: true,
    });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression, sid = sessionId) => {
        const r = await cdp.send(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            sid,
        );
        if (r.exceptionDetails) {
            throw new Error(
                r.exceptionDetails.text +
                    " " +
                    (r.exceptionDetails.exception?.description || ""),
            );
        }
        return r.result.value;
    };
    const mouse = (type, x, y, extra = {}) =>
        send("Input.dispatchMouseEvent", { type, x, y, ...extra });
    const clickAt = async ({ x, y }) => {
        await mouse("mouseMoved", x, y);
        await sleep(100);
        await mouse("mousePressed", x, y, { button: "left", clickCount: 1 });
        await mouse("mouseReleased", x, y, { button: "left", clickCount: 1 });
    };
    // A real click on the label, so the switch is proven to be on top and
    // clickable, not just toggled through the DOM.
    const clickFilterSwitch = async () => {
        await evaluate(
            `document.querySelector('.ytbext-filter').scrollIntoView({ block: 'center' })`,
        );
        await sleep(300);
        const pt = await evaluate(`(() => {
            const r = document.querySelector('.ytbext-filter').getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`);
        await clickAt(pt);
    };
    const screenshot = async (name) => {
        const { data } = await send("Page.captureScreenshot", {
            format: "png",
        });
        const file = path.resolve(`.temp/filter-check-${name}.png`);
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.log("screenshot:", file);
    };
    const snapshot = async (label) => {
        const s = await evaluate(FILTER_SNAPSHOT);
        console.log(`${label}:`, JSON.stringify(s));
        return s;
    };
    const pressKey = async (key, windowsVirtualKeyCode) => {
        for (const type of ["keyDown", "keyUp"]) {
            await send("Input.dispatchKeyEvent", {
                type,
                key,
                code: key,
                windowsVirtualKeyCode,
            });
        }
    };
    const waitFor = async (expression, timeoutMs) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
            if (await evaluate(expression)) return true;
            await sleep(500);
        }
        return false;
    };

    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
    });
    // Pinned rather than left to the machine's setting; the light theme
    // gets a page load of its own at the end.
    const setTheme = (value) =>
        send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-color-scheme", value }],
        });
    await setTheme("dark");

    // Timestamps of the player requests the content script makes (initiator
    // stack in the extension bundle), for the token-bucket check. A full page
    // load starts a fresh content script with a full bucket, so the series is
    // split there; YouTube's SPA navigations keep the same script.
    let requestTimes = [];
    const requestSeries = [requestTimes];
    cdp.on((m) => {
        if (m.sessionId !== sessionId) return;
        if (m.method === "Page.frameNavigated" && !m.params.frame.parentId) {
            requestTimes = [];
            requestSeries.push(requestTimes);
            return;
        }
        if (m.method !== "Network.requestWillBeSent") return;
        const url = m.params.request.url;
        if (!url.includes("/youtubei/v1/player") && !url.includes("/watch?v="))
            return;
        const frames = m.params.initiator?.stack?.callFrames || [];
        if (frames.some((f) => f.url.startsWith("chrome-extension://")))
            requestTimes.push(m.params.wallTime * 1000);
    });

    // Favorites: only LANG, set through the extension's own storage so the
    // results split into cards with and without a favorite track.
    const { targetInfos } = await cdp.send("Target.getTargets");
    const bg = targetInfos.find(
        (t) =>
            t.url.startsWith("chrome-extension://") &&
            t.url.endsWith("/background.js"),
    );
    if (!bg) throw new Error("extension background target not found");
    const { sessionId: bgSession } = await cdp.send("Target.attachToTarget", {
        targetId: bg.targetId,
        flatten: true,
    });
    await cdp.send("Runtime.enable", {}, bgSession);
    await evaluate(
        `chrome.storage.local.set({ "SETTINGS:langCodes": ${JSON.stringify([LANG])} })`,
        bgSession,
    );

    console.log("url:", URL_, "favorite:", LANG);
    await send("Page.navigate", { url: URL_ });
    const RENDERED = `document.querySelectorAll('.ytbext-embed-container:not(:empty)').length`;
    // The headless viewport shows only two or three cards at first.
    if (!(await waitFor(`${RENDERED} >= 2`, 60000))) {
        console.log(
            "page state:",
            JSON.stringify(
                await evaluate(`({
                    url: location.href,
                    title: document.title,
                    thumbs: document.querySelectorAll('a[href^="/watch?"] img').length,
                    wrappers: document.querySelectorAll('.ytbext-thumbnail-wrapper').length,
                    containers: document.querySelectorAll('.ytbext-embed-container').length,
                })`),
            ),
        );
        console.log("SKIP  no badges rendered");
        process.exitCode = 2;
        throw new Error("no badges");
    }
    const scrollScreens = async (n) => {
        for (let i = 0; i < n; i++) {
            await evaluate(`window.scrollBy(0, 900)`);
            await sleep(1200);
        }
        await sleep(4000);
    };
    // Collect a few screens of cards before touching the button.
    await scrollScreens(3);

    // ── Off by default ───────────────────────────────────────────────
    const initial = await snapshot("initial");
    check(
        "switch is present and off on page load",
        initial.control && !initial.on,
    );
    check(
        "search: switch is a row right after the chip header",
        initial.after === "div#header",
        `after ${initial.after} in ${initial.host}`,
    );
    check(
        "nothing hidden while off, and no count shown",
        initial.hidden === 0 && initial.count === null,
    );
    const dark = await evaluate(THEME_SNAPSHOT);
    check(
        "dark theme: the label is legible on the page",
        dark.dark && contrast(dark) >= MIN_CONTRAST,
        `${dark.text} on ${dark.bg}, ${contrast(dark).toFixed(1)}:1`,
    );
    if (
        initial.withFavorite === 0 ||
        initial.withFavorite === initial.rendered
    ) {
        const verb = initial.withFavorite === 0 ? "lacks" : "has";
        console.log(
            `NOTE  every rendered card ${verb} a "${LANG}" track; the hide checks are weak, try another language`,
        );
    }

    // ── On: hides exactly the non-matching cards ─────────────────────
    // Hiding cards pulls the next ones into view, and those get looked up
    // as usual, so the request count is reported but not asserted.
    const requestsBeforeToggle = requestTimes.length;
    await clickFilterSwitch();
    await sleep(1000);
    const on = await snapshot("on");
    check("click turns the filter on", on.on && on.filtering);
    check(
        "on: unknown cards are invisible placeholders, known cards are visible",
        on.badPlaceholders === 0,
        `placeholders=${on.placeholders} bad=${on.badPlaceholders}`,
    );
    check(
        "on: every tracked card has a state and no untracked card does",
        on.wrongState === 0,
        `untracked=${on.untracked} wrongState=${on.wrongState}`,
    );
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(500);
    await screenshot("search");

    // On a wide screen YouTube centres the header and the results column
    // (max-width + auto margins); the switch row must line up with them.
    await send("Emulation.setDeviceMetricsOverride", {
        width: 2400,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await sleep(1500);
    const wide = await evaluate(`(() => {
        const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        return { header: left('#header.ytd-search'), row: left('.ytbext-filter-host'), results: left('ytd-two-column-search-results-renderer #primary') };
    })()`);
    check(
        "search: on a wide screen the row lines up with the header and results",
        wide.row === wide.header && wide.row === wide.results && wide.row > 300,
        JSON.stringify(wide),
    );
    await screenshot("search-wide");
    await send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await sleep(1500);
    check(
        "on: hidden cards are exactly the rendered ones without a favorite",
        on.mismatches === 0 && on.hidden === on.rendered - on.withFavorite,
        `hidden=${on.hidden} rendered=${on.rendered} withFavorite=${on.withFavorite} mismatches=${on.mismatches}`,
    );
    console.log(
        `requests after toggling on: ${requestTimes.length - requestsBeforeToggle} new (cards scrolled into view)`,
    );

    // ── Scrolling: newly loaded cards are filtered as they render ────
    await scrollScreens(4);
    const scrolled = await snapshot("after scroll");
    check(
        "scroll: more cards rendered",
        scrolled.rendered > on.rendered,
        `${scrolled.rendered} vs ${on.rendered}`,
    );
    check(
        "scroll: every card still agrees with the rule",
        scrolled.mismatches === 0 &&
            scrolled.badPlaceholders === 0 &&
            scrolled.wrongState === 0,
        `mismatches=${scrolled.mismatches} hidden=${scrolled.hidden} badPlaceholders=${scrolled.badPlaceholders} untracked=${scrolled.untracked} wrongState=${scrolled.wrongState}`,
    );
    // Placeholders keep their space, so YouTube's continuation sentinel sits
    // where it always does and more results load while the filter is on.
    // Screens of 900px do not reach the end of the first batch; go there.
    for (let i = 0; i < 3; i++) {
        await evaluate(
            `window.scrollTo(0, document.documentElement.scrollHeight)`,
        );
        await sleep(2000);
    }
    const bottom = await snapshot("at the bottom");
    check(
        "scroll: YouTube kept loading results while the filter was on",
        bottom.cards > on.cards &&
            bottom.badPlaceholders === 0 &&
            bottom.wrongState === 0,
        `${bottom.cards} vs ${on.cards} cards, badPlaceholders=${bottom.badPlaceholders} wrongState=${bottom.wrongState}`,
    );
    check(
        "scroll: the count next to the switch matches the hidden cards",
        scrolled.count === `${scrolled.hidden} hidden`,
        `count="${scrolled.count}" hidden=${scrolled.hidden}`,
    );

    // ── Off again: everything visible ────────────────────────────────
    await clickFilterSwitch();
    await sleep(500);
    const off = await snapshot("off");
    check("off: button reports off", !off.on && !off.filtering);
    check(
        "off: no hidden or invisible cards and no count",
        off.hidden === 0 && off.badPlaceholders === 0 && off.count === null,
        `hidden=${off.hidden} bad=${off.badPlaceholders} count="${off.count}"`,
    );

    // ── On again: re-applied at once from what the badges already know ──
    const requestsBeforeSecondToggle = requestTimes.length;
    await clickFilterSwitch();
    await sleep(500);
    const onAgain = await snapshot("on again");
    check(
        "on again: hidden set restored immediately",
        onAgain.on && onAgain.mismatches === 0 && onAgain.hidden > 0,
        `hidden=${onAgain.hidden} newRequests=${requestTimes.length - requestsBeforeSecondToggle}`,
    );

    // ── SPA navigation to another search resets the filter ───────────
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(500);
    const searchBox = await evaluate(`(() => {
        const input = document.querySelector('input[name="search_query"]');
        const r = input.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await clickAt(searchBox);
    await sleep(300);
    await evaluate(
        `(() => { const i = document.querySelector('input[name="search_query"]'); i.focus(); i.select(); })()`,
    );
    await send("Input.insertText", { text: "veritasium" });
    await sleep(300);
    await pressKey("Enter", 13);
    const navigated = await waitFor(
        `location.search.includes('veritasium') && ${RENDERED} >= 2`,
        20000,
    );
    await sleep(1500);
    const afterNav = await snapshot("after SPA search");
    check("SPA search: landed on the new results", navigated, afterNav.path);
    check(
        "SPA search: filter is off again and nothing is hidden",
        afterNav.control && !afterNav.on && afterNav.hidden === 0,
        `on=${afterNav.on} hidden=${afterNav.hidden}`,
    );

    // ── SPA navigation to a watch page removes the button ────────────
    await evaluate(
        `document.querySelector('ytd-video-renderer a#video-title, ytd-video-renderer a[href^="/watch?"]').click()`,
    );
    const onWatch = await waitFor(`location.pathname === '/watch'`, 20000);
    await sleep(1000);
    const watch = await snapshot("watch page");
    check("watch page: reached", onWatch, watch.path);
    check("watch page: no switch", !watch.control);

    // ── Channel Videos tab: switch in the chip bar, same behaviour ───
    // Reached the way a user does: the channel link under the video, then
    // the Videos tab. Both are SPA navigations inside the same ytd-browse.
    await evaluate(
        `document.querySelector('ytd-video-owner-renderer a[href^="/@"], ytd-video-owner-renderer a[href^="/channel/"]').click()`,
    );
    const onChannelHome = await waitFor(
        `/^[/](@[^/]+|channel[/][^/]+)$/.test(location.pathname) && !!document.querySelector('yt-tab-shape[tab-title="Videos"]')`,
        20000,
    );
    check(
        "channel: reached the channel page",
        onChannelHome,
        await evaluate("location.pathname"),
    );
    await evaluate(
        `document.querySelector('yt-tab-shape[tab-title="Videos"]').click()`,
    );
    const onChannel = await waitFor(
        `location.pathname.endsWith('/videos') && !!document.querySelector('.ytbext-filter') && ${RENDERED} >= 2`,
        30000,
    );
    await scrollScreens(2);
    const channel = await snapshot("channel");
    check("channel: reached with the switch mounted", onChannel, channel.path);
    check(
        "channel: switch sits in the chip bar",
        channel.host === "chip-bar-view-model#",
        `in ${channel.host}`,
    );
    check("channel: off on arrival", !channel.on && channel.hidden === 0);
    await clickFilterSwitch();
    await sleep(1000);
    const channelOn = await snapshot("channel on");
    check(
        "channel: hidden cards follow the rule and the count matches",
        channelOn.on &&
            channelOn.mismatches === 0 &&
            channelOn.count === `${channelOn.hidden} hidden`,
        `hidden=${channelOn.hidden} count="${channelOn.count}" rendered=${channelOn.rendered} withFavorite=${channelOn.withFavorite}`,
    );
    await screenshot("channel");

    // ── Light theme: a fresh page load with the switch on a white header ──
    await setTheme("light");
    await send("Page.navigate", { url: URL_ });
    const lightReady = await waitFor(
        `!!document.querySelector('.ytbext-filter') && !document.documentElement.hasAttribute('dark')`,
        30000,
    );
    await sleep(1000);
    const light = lightReady ? await evaluate(THEME_SNAPSHOT) : {};
    check("light theme: page loaded in the light theme", lightReady);
    check(
        "light theme: the label is legible on the page",
        contrast(light) >= MIN_CONTRAST,
        `${light.text} on ${light.bg}, ${contrast(light).toFixed(1)}:1`,
    );
    await screenshot("search-light");

    // ── Token bucket: at most capacity + refill in any 10-second window ──
    const WINDOW_MS = 10_000;
    const allowed = BUCKET_CAPACITY + (WINDOW_MS / 1000) * REFILL_PER_SECOND;
    let maxInWindow = 0;
    let total = 0;
    for (const times of requestSeries) {
        total += times.length;
        for (let i = 0; i < times.length; i++) {
            let n = 0;
            for (let j = i; j >= 0 && times[i] - times[j] <= WINDOW_MS; j--) {
                n++;
            }
            maxInWindow = Math.max(maxInWindow, n);
        }
    }
    check(
        `requests: at most ${allowed} in any ${WINDOW_MS / 1000}s window`,
        maxInWindow <= allowed,
        `max ${maxInWindow} of ${total} total over ${requestSeries.length} page load(s)`,
    );
} catch (e) {
    if (process.exitCode !== 2) {
        console.error("ERROR", e.message);
        process.exitCode = 1;
    }
} finally {
    if (process.exitCode === undefined)
        process.exitCode = results.every(Boolean) ? 0 : 1;
    console.log(
        process.exitCode === 0
            ? "RESULT: PASS"
            : process.exitCode === 2
              ? "RESULT: SKIP"
              : "RESULT: FAIL",
    );
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], {
        stdio: "ignore",
    });
}
