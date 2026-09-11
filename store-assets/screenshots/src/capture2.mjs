// Focused high-resolution capture of a single badge (8x) from the search page,
// plus the same card at 4x. Usage: node capture2.mjs <outDir> [favorites]

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = "C:/workspace/projects/ytb/.output/chrome-mv3";
const OUT = path.resolve(process.argv[2] || "captures");
const FAVORITES = (process.argv[3] || "en,es,fr").split(",");
// Search query to load and, optionally, the video id of the card to capture
// (first card with badges when omitted). The search page shows 500 px cards,
// the largest YouTube renders, which is what the hero slide wants.
const QUERY = process.argv[4] || "mrbeast";
const VIDEO_ID = process.argv[5] || "";
const PORT = 9334;
const PROFILE = path.join(OUT, "profile2");
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
    `--user-data-dir=${PROFILE}`, "--window-size=1280,1400", "--no-first-run",
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
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: pageTarget, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        return r.result.value;
    };
    const shot = async (file, clip, scale) => {
        const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale } });
        fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
        console.log("saved", file, JSON.stringify(clip), "x" + scale);
    };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url: `chrome-extension://${extId}/popup.html` });
    await sleep(1200);
    await evaluate(`chrome.storage.local.set({ "SETTINGS:langCodes": ${JSON.stringify(FAVORITES)} })`);
    await sleep(300);

    await send("Page.navigate", { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(QUERY)}` });
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 60000) {
        ready = await evaluate(`document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length >= 4 && document.querySelectorAll('.ytbext-loading__spinner').length === 0`);
        if (ready) break;
        await sleep(500);
    }
    console.log("ready", ready);
    await sleep(1500);
    const info = await evaluate(`(() => {
        const wanted = ${JSON.stringify(VIDEO_ID)};
        const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find((el) => {
            if (!el.querySelector('.ytbext-badge')) return false;
            const href = el.closest('a[href^="/watch?"]')?.getAttribute('href') || '';
            return !wanted || href.includes('v=' + wanted);
        });
        if (!w) throw new Error('no badge-bearing card found' + (wanted ? ' for video ' + wanted : ''));
        const c = w.parentElement.querySelector('.ytbext-embed-container') || w.querySelector('.ytbext-embed-container');
        const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; };
        const items = [...c.querySelectorAll('.ytbext-item')];
        return {
            card: R(w), badge: R(c),
            rows: items.map(it => ({ item: R(it), icon: R(it.querySelector('.ytbext-icon')), badges: [...it.querySelectorAll('.ytbext-badge')].map(b => ({ text: b.textContent.trim(), rect: R(b) })) })),
        };
    })()`);
    fs.writeFileSync(path.join(OUT, "badge-geometry.json"), JSON.stringify(info, null, 2));
    const pad = 10;
    await shot("badge-8x.png", { x: info.badge.x - pad, y: info.badge.y - pad, width: info.badge.width + pad * 2, height: info.badge.height + pad * 2 }, 8);
    await shot("hero-card.png", info.card, 3);
} catch (e) {
    console.error("FAILED", e);
    process.exitCode = 1;
} finally {
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], { stdio: "ignore" });
}
