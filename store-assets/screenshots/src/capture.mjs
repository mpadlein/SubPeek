// Live capture of the SubPeek UI from headless Edge with the built extension
// loaded. Produces crisp (3x) crops of thumbnail cards with badges, the
// in-page track popup, and the settings page, plus a manifest.json describing
// what was captured.
//
// Usage: node capture.mjs <outDir> [favorites, comma separated]

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = "C:/workspace/projects/ytb/.output/chrome-mv3";
const OUT = path.resolve(process.argv[2] || "captures");
const FAVORITES = (process.argv[3] || "en,es,fr").split(",");
const PORT = 9333;
const PROFILE = path.join(OUT, "profile");
const VIEW_W = 1280;
const VIEW_H = 2200; // tall so nothing needs scrolling: page coords == viewport coords

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CDP client
class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.id) {
                const p = this.pending.get(m.id);
                this.pending.delete(m.id);
                if (!p) return;
                m.error
                    ? p.reject(new Error(`${m.error.message} (${m.error.code})`))
                    : p.resolve(m.result);
            } else {
                for (const l of this.listeners) l(m);
            }
        };
    }
    send(method, params = {}, sessionId) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params, sessionId }));
        });
    }
    on(fn) {
        this.listeners.push(fn);
    }
}

async function connect() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            const info = await res.json();
            const ws = new WebSocket(info.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => {
                ws.onopen = resolve;
                ws.onerror = reject;
            });
            return new CDP(ws);
        } catch {
            await sleep(500);
        }
    }
    throw new Error("Edge did not expose the debugging port");
}

// ---------------------------------------------------------------- helpers
function makePage(cdp, sessionId) {
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression, { awaitPromise = true } = {}) => {
        const r = await send("Runtime.evaluate", {
            expression,
            awaitPromise,
            returnByValue: true,
        });
        if (r.exceptionDetails) {
            throw new Error(
                "evaluate failed: " +
                    (r.exceptionDetails.exception?.description ||
                        r.exceptionDetails.text),
            );
        }
        return r.result.value;
    };
    const navigate = async (url) => {
        await send("Page.navigate", { url });
        await sleep(1500);
    };
    const waitFor = async (expression, timeoutMs = 45000, every = 500) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await evaluate(expression)) return true;
            await sleep(every);
        }
        return false;
    };
    const shot = async (file, clip, scale = 3) => {
        const params = { format: "png" };
        if (clip) params.clip = { ...clip, scale };
        const r = await send("Page.captureScreenshot", params);
        fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
        console.log("saved", file, clip ? JSON.stringify(clip) : "");
    };
    const rect = async (selectorExpr) =>
        evaluate(`(() => {
            const el = ${selectorExpr};
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
        })()`);
    const setViewport = (width, height, dpr = 1) =>
        send("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor: dpr,
            mobile: false,
        });
    return { send, evaluate, navigate, waitFor, shot, rect, setViewport };
}

function union(a, b, pad = 0) {
    const x1 = Math.min(a.x, b.x) - pad;
    const y1 = Math.min(a.y, b.y) - pad;
    const x2 = Math.max(a.x + a.width, b.x + b.width) + pad;
    const y2 = Math.max(a.y + a.height, b.y + b.height) + pad;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// ---------------------------------------------------------------- main
const edge = spawn(
    EDGE,
    [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        `--user-data-dir=${PROFILE}`,
        `--window-size=${VIEW_W},${VIEW_H}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--lang=en-US",
        "--hide-scrollbars",
        "--force-dark-mode",
        "about:blank",
    ],
    { stdio: "ignore" },
);

const manifest = { favorites: FAVORITES, pages: {} };
const logs = [];

try {
    const cdp = await connect();

    // Find the extension id and the blank page target.
    let extId = null;
    let pageTarget = null;
    for (let i = 0; i < 40 && !(extId && pageTarget); i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        for (const t of targetInfos) {
            if (t.url.startsWith("chrome-extension://") && t.url.endsWith("/background.js")) {
                extId = new URL(t.url).host;
            }
            if (t.type === "page" && !pageTarget) pageTarget = t.targetId;
        }
        if (!(extId && pageTarget)) await sleep(500);
    }
    if (!extId) throw new Error("SubPeek background.js target not found");
    console.log("extension id", extId);
    manifest.extId = extId;

    const { sessionId } = await cdp.send("Target.attachToTarget", {
        targetId: pageTarget,
        flatten: true,
    });
    const page = makePage(cdp, sessionId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    cdp.on((m) => {
        if (m.method === "Runtime.consoleAPICalled" && m.sessionId === sessionId) {
            const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
            if (text.includes("[SubPeek]")) logs.push(text);
        }
    });

    // 1. Preset favorite languages through the extension's own page context.
    await page.setViewport(340, 700, 3);
    await page.navigate(`chrome-extension://${extId}/popup.html`);
    await page.evaluate(
        `chrome.storage.local.set({ "SETTINGS:langCodes": ${JSON.stringify(FAVORITES)} })`,
    );
    await sleep(500);

    // 2. Settings page captures (collapsed, then with the language dropdown open).
    await page.navigate(`chrome-extension://${extId}/popup.html`);
    await page.waitFor(`!!document.querySelector('.language-tag')`, 10000);
    // The version label is the one thing left out: it would date the slide
    // with every release. lit-html keeps the node across re-renders, so the
    // inline style survives the dropdown click below.
    await page.evaluate(`document.querySelector('.version').style.display = 'none'`);
    await sleep(400);
    let r = await page.rect(`document.body`);
    manifest.pages.settings = r;
    await page.shot("settings.png", { x: 0, y: 0, width: 340, height: Math.ceil(r.height) });

    await page.evaluate(`document.querySelector('.add-language-row').click()`);
    await sleep(400);
    r = await page.rect(`document.body`);
    manifest.pages.settingsDropdown = r;
    await page.shot("settings-dropdown.png", { x: 0, y: 0, width: 340, height: Math.ceil(r.height) });

    // 3. YouTube pages with live badges.
    await page.setViewport(VIEW_W, VIEW_H, 1);
    const sources = [
        { key: "grid", url: "https://www.youtube.com/@MrBeast/videos" },
        { key: "search", url: "https://www.youtube.com/results?search_query=mrbeast" },
        { key: "teded", url: "https://www.youtube.com/@TEDEd/videos" },
    ];
    for (const src of sources) {
        console.log("navigating", src.url);
        await page.navigate(src.url);
        const ok = await page.waitFor(
            `document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length >= 6 && document.querySelectorAll('.ytbext-loading__spinner').length === 0`,
            60000,
        );
        console.log(src.key, "badges ready:", ok);
        await sleep(1500);

        const cards = await page.evaluate(`(() => {
            const out = [];
            const wrappers = document.querySelectorAll('.ytbext-thumbnail-wrapper');
            wrappers.forEach((w, i) => {
                const container = w.parentElement?.querySelector('.ytbext-embed-container') || w.querySelector('.ytbext-embed-container');
                const anchor = w.closest('a[href^="/watch?"]');
                const renderer = w.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
                const titleEl = renderer?.querySelector('#video-title, a#video-title-link, yt-formatted-string#video-title');
                const r = w.getBoundingClientRect();
                const rows = [...(container?.querySelectorAll('.ytbext-item') || [])].map(item => ({
                    active: item.querySelector('.ytbext-icon--active') !== null,
                    badges: [...item.querySelectorAll('.ytbext-badge')].map(b => b.textContent.trim()),
                }));
                const badgeRect = container ? container.getBoundingClientRect() : null;
                out.push({
                    index: i,
                    href: anchor?.getAttribute('href') || null,
                    title: titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || null,
                    rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
                    badgeRect: badgeRect ? { x: badgeRect.left + scrollX, y: badgeRect.top + scrollY, width: badgeRect.width, height: badgeRect.height } : null,
                    rows,
                    rendererRect: renderer ? (() => { const q = renderer.getBoundingClientRect(); return { x: q.left + scrollX, y: q.top + scrollY, width: q.width, height: q.height }; })() : null,
                });
            });
            return out;
        })()`);
        manifest.pages[src.key] = { url: src.url, cards, viewport: { width: VIEW_W, height: VIEW_H } };

        // Full-page overview at 2x for the grid slide.
        await page.shot(`${src.key}-full.png`, { x: 0, y: 0, width: VIEW_W, height: VIEW_H }, 2);

        // Each card (thumbnail wrapper) with badges at 3x, first 12 that have badges.
        let n = 0;
        for (const c of cards) {
            if (!c.rows.some((row) => row.badges.length > 0)) continue;
            if (c.rect.width < 100 || c.rect.y + c.rect.height > VIEW_H) continue;
            await page.shot(`${src.key}-card-${c.index}.png`, c.rect, 3);
            if (c.rendererRect) {
                await page.shot(`${src.key}-renderer-${c.index}.png`, c.rendererRect, 3);
            }
            if (++n >= 12) break;
        }

        // Open the caption popup on the first good card, then the audio popup.
        const first = cards.find(
            (c) => c.rows[0]?.badges.length >= 3 && c.rows[1]?.badges.length >= 2 && c.rect.y + c.rect.height < VIEW_H - 400,
        );
        if (first) {
            for (const [rowIdx, name] of [[0, "cc"], [1, "audio"]]) {
                await page.evaluate(`(() => {
                    document.querySelector('.ytbext-popup')?.remove();
                    const w = document.querySelectorAll('.ytbext-thumbnail-wrapper')[${first.index}];
                    const container = w.parentElement?.querySelector('.ytbext-embed-container') || w.querySelector('.ytbext-embed-container');
                    const item = container.querySelectorAll('.ytbext-item')[${rowIdx}];
                    item.click();
                })()`);
                await sleep(600);
                const popupRect = await page.rect(`document.querySelector('.ytbext-popup')`);
                if (popupRect) {
                    manifest.pages[src.key][`popup_${name}`] = { card: first.index, popupRect };
                    await page.shot(`${src.key}-popup-${name}.png`, popupRect, 3);
                    await page.shot(
                        `${src.key}-popup-${name}-scene.png`,
                        union(first.rect, popupRect, 24),
                        3,
                    );
                    // Also with the whole renderer (title, meta) for context.
                    if (first.rendererRect) {
                        await page.shot(
                            `${src.key}-popup-${name}-renderer.png`,
                            union(first.rendererRect, popupRect, 24),
                            3,
                        );
                    }
                } else {
                    console.log("no popup opened for", name);
                }
            }
            await page.evaluate(`document.querySelector('.ytbext-popup')?.remove()`);
        }
    }
} catch (e) {
    console.error("FAILED:", e);
    process.exitCode = 1;
} finally {
    manifest.logs = logs.slice(0, 60);
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
    edge.kill();
    await sleep(500);
    try {
        spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], { stdio: "ignore" });
    } catch {}
}
