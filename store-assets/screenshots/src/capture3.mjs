// Capture of the "Only show my languages" switch turned on, for the filter
// slide: the switch with its hidden count and the cards that stay. Also
// usable as a plain page check: on a page without the switch it saves the
// full page and reports the badge count.
// Usage: node capture3.mjs <outDir> [favorites] [url] [key] [masthead]
// With "masthead" as the sixth argument the clip starts at the top of the
// page and keeps YouTube's search box, while the controls around it (menu
// button, left rail, country code, mic, the buttons on the right) are made
// invisible in place, so the box stays where YouTube centres it, and the
// chip row under it and any ad slots are removed so the switch row and the
// results move up.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = "C:/workspace/projects/ytb/.output/chrome-mv3";
const OUT = path.resolve(process.argv[2] || "captures");
const FAVORITES = (process.argv[3] || "en,es,fr").split(",");
const URL_ = process.argv[4] || "https://www.youtube.com/results?search_query=mrbeast+reaction";
const KEY = process.argv[5] || "filter";
const MASTHEAD = process.argv[6] === "masthead";
const MASTHEAD_INVISIBLE = [
    "#guide-button",
    "ytd-mini-guide-renderer",
    "#country-code",
    "#voice-search-button",
    "ytd-masthead #end",
];
const MASTHEAD_REMOVE = ["#header.ytd-search", "ytd-ad-slot-renderer"];
const PORT = 9336;
const PROFILE = path.join(OUT, "profile3");
const VIEW_W = 1280;
const VIEW_H = 2200; // tall so nothing needs scrolling: page coords == viewport coords
// How far below the switch the clip reaches, in css px; only whole cards are kept.
const CLIP_MAX_H = 900;
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
    constructor(ws) {
        this.ws = ws; this.nextId = 0; this.pending = new Map();
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (!m.id) return;
            const p = this.pending.get(m.id); this.pending.delete(m.id);
            if (!p) return;
            m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        };
    }
    send(method, params = {}, sessionId) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
}
async function connect() {
    for (let i = 0; i < 60; i++) {
        try {
            const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
            const ws = new WebSocket(info.webSocketDebuggerUrl);
            await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
            return new CDP(ws);
        } catch { await sleep(500); }
    }
    throw new Error("no debugging port");
}

const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    `--user-data-dir=${PROFILE}`, `--window-size=${VIEW_W},${VIEW_H}`, "--no-first-run",
    "--no-default-browser-check", "--lang=en-US", "--hide-scrollbars", "--force-dark-mode", "about:blank",
], { stdio: "ignore" });

try {
    const cdp = await connect();
    let extId = null, pageTarget = null;
    for (let i = 0; i < 40 && !(extId && pageTarget); i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        for (const t of targetInfos) {
            if (t.url.startsWith("chrome-extension://") && t.url.endsWith("/background.js")) extId = new URL(t.url).host;
            if (t.type === "page" && !pageTarget) pageTarget = t.targetId;
        }
        if (!(extId && pageTarget)) await sleep(500);
    }
    if (!extId) throw new Error("SubPeek background.js target not found");
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: pageTarget, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
        return r.result.value;
    };
    const waitFor = async (expression, timeoutMs, every = 500) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await evaluate(expression)) return true;
            await sleep(every);
        }
        return false;
    };
    const shot = async (file, clip, scale) => {
        const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale } });
        fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
        console.log("saved", file, JSON.stringify(clip), "x" + scale);
    };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url: `chrome-extension://${extId}/popup.html` });
    await sleep(1200);
    await evaluate(`chrome.storage.local.set({ "SETTINGS:langCodes": ${JSON.stringify(FAVORITES)} })`);
    await sleep(300);

    console.log("url:", URL_, "favorites:", FAVORITES.join(","));
    await send("Page.navigate", { url: URL_ });
    const RENDERED = `document.querySelectorAll('.ytbext-embed-container:not(:empty)').length`;
    const ready = await waitFor(`${RENDERED} >= 4`, 60000);
    console.log("badges ready:", ready, "rendered:", await evaluate(RENDERED));
    await sleep(2000);

    const hasSwitch = await waitFor(`!!document.querySelector('.ytbext-filter__input')`, 15000);
    if (!hasSwitch) {
        console.log("no switch on this page; saving the full page for a look");
        await shot(`${KEY}-full.png`, { x: 0, y: 0, width: VIEW_W, height: VIEW_H }, 1);
        throw new Error("done");
    }

    if (MASTHEAD) {
        // Inline styles through the CSSOM, which YouTube's CSP does not block.
        await evaluate(`(() => {
            for (const sel of ${JSON.stringify(MASTHEAD_INVISIBLE)}) {
                document.querySelectorAll(sel).forEach((el) => { el.style.visibility = 'hidden'; });
            }
            for (const sel of ${JSON.stringify(MASTHEAD_REMOVE)}) {
                document.querySelectorAll(sel).forEach((el) => { el.style.display = 'none'; });
            }
        })()`);
        await sleep(500);
    }
    await evaluate(`document.querySelector('.ytbext-filter__input').click()`);
    // Hidden cards collapse, YouTube loads more results into the freed space
    // and those get looked up in turn. Wait until nothing in view is pending
    // and the count has held still for a few seconds.
    const STATE = `(() => {
        const count = document.querySelector('.ytbext-filter__count')?.textContent.trim() || '';
        const pending = [...document.querySelectorAll('[data-ytbext-filter="pending"]')]
            .filter(c => c.getBoundingClientRect().top < innerHeight).length;
        const shown = document.querySelectorAll('[data-ytbext-filter="shown"]').length;
        return { count, pending, shown };
    })()`;
    let last = null, stable = 0;
    for (let i = 0; i < 90 && stable < 5; i++) {
        await sleep(1000);
        const s = await evaluate(STATE);
        stable = last && s.count === last.count && s.pending === 0 ? stable + 1 : 0;
        last = s;
    }
    console.log("settled:", JSON.stringify(last));

    // Saved before the clip is worked out, so a page whose layout defeats the
    // clip still leaves a picture to look at.
    await shot(`${KEY}-full.png`, { x: 0, y: 0, width: VIEW_W, height: VIEW_H }, 1);

    const geo = await evaluate(`(() => {
        const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; };
        const host = document.querySelector('.ytbext-filter-host');
        const logo = document.querySelector('ytd-masthead #logo');
        // Outermost shown cards only: on a channel grid the lockup sits inside the rich item.
        const cards = [...document.querySelectorAll('[data-ytbext-filter="shown"]')]
            .filter(c => !c.parentElement.closest('[data-ytbext-filter]'))
            .map(R).filter(r => r.width > 100 && r.height > 60).sort((a, b) => a.y - b.y || a.x - b.x);
        return { host: R(host), logo: logo ? R(logo) : null, cards };
    })()`);
    fs.writeFileSync(path.join(OUT, `${KEY}-geometry.json`), JSON.stringify(geo, null, 2));

    // Clip: from just above the switch row down to the last whole card that
    // fits in CLIP_MAX_H, as wide as the switch row and those cards together.
    const pad = 12;
    const top = MASTHEAD ? 0 : geo.host.y - pad;
    const rows = geo.cards.filter((c) => c.y > geo.host.y && c.y + c.height <= top + CLIP_MAX_H);
    if (rows.length === 0) throw new Error("no shown card fits under the switch");
    const all = [geo.host, ...rows, ...(MASTHEAD && geo.logo ? [geo.logo] : [])];
    const x1 = Math.min(...all.map((r) => r.x)) - pad;
    const x2 = Math.max(...all.map((r) => r.x + r.width)) + pad;
    const y2 = Math.max(...rows.map((r) => r.y + r.height)) + pad;
    await shot(`${KEY}-on.png`, { x: x1, y: top, width: x2 - x1, height: y2 - top }, 2);
    console.log("RESULT", KEY, last.count, "cards in clip:", rows.length);
} catch (e) {
    if (e.message !== "done") { console.error("FAILED", e); process.exitCode = 1; }
} finally {
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], { stdio: "ignore" });
}
