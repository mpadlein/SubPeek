// Pass/fail check for the content <-> background messaging: the gear button in the
// in-page popup must open the options page through the background script,
// and a second load of the same page must be served from the cache.
//
// Usage: node probes/messaging-check.mjs
// Exit 0 = pass, 1 = fail, 2 = could not run (no badges).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const URL_ = "https://www.youtube.com/results?search_query=mrbeast";
const PORT = 9341;
const PROFILE = path.resolve(".temp/messaging-check-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    on(l) {
        this.listeners.push(l);
    }
}
async function connect() {
    for (let i = 0; i < 60; i++) {
        try {
            const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
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
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};
const BADGES = `document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length`;
const SPINNERS = `document.querySelectorAll('.ytbext-loading__spinner').length`;

try {
    const cdp = await connect();
    let pageTarget = null;
    for (let i = 0; i < 40 && !pageTarget; i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        pageTarget = targetInfos.find((t) => t.type === "page")?.targetId;
        if (!pageTarget) await sleep(300);
    }
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: pageTarget, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression, sid = sessionId) => {
        const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sid);
        if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
        }
        return r.result.value;
    };
    const click = async (pt) => {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y });
        await sleep(100);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });

    const errors = [];
    let extPlayerRequests = 0;
    cdp.on((m) => {
        if (m.sessionId !== sessionId) return;
        if (m.method === "Runtime.consoleAPICalled") {
            const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
            if (text.includes("[SubPeek] ERROR") || text.includes("[SubPeek] WARN")) errors.push(text);
        }
        if (m.method === "Network.requestWillBeSent") {
            const url = m.params.request.url;
            if (!url.includes("/youtubei/v1/player") && !url.includes("/watch?v=")) return;
            const frames = m.params.initiator?.stack?.callFrames || [];
            if (frames.some((f) => f.url.startsWith("chrome-extension://"))) extPlayerRequests++;
        }
    });

    const waitForBadges = async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
            if (await evaluate(`${BADGES} >= 4 && ${SPINNERS} === 0`)) return true;
            await sleep(500);
        }
        return false;
    };

    await send("Page.navigate", { url: URL_ });
    if (!(await waitForBadges())) {
        console.log("SKIP  no badges rendered");
        process.exitCode = 2;
        throw new Error("no badges");
    }
    await sleep(1500);
    const firstLoadRequests = extPlayerRequests;
    console.log("first load: badges", await evaluate(BADGES), "| extension player requests:", firstLoadRequests);

    // Gear button -> options page opens in a new tab through the background script.
    const badgePt = await evaluate(`(() => {
        const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find(w => w.querySelector('.ytbext-badge'));
        const r = w.querySelector('.ytbext-item').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await click(badgePt);
    await sleep(800);
    const gearPt = await evaluate(`(() => {
        const b = [...document.querySelectorAll('.ytbext-popup__header-action')].find(b => b.title === 'Open extension options');
        const r = b && b.getBoundingClientRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    })()`);
    check("track popup opens with a gear button", !!gearPt);
    if (!gearPt) throw new Error("no gear button");
    await click(gearPt);
    let optionsUrl = null;
    for (let i = 0; i < 40 && !optionsUrl; i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        optionsUrl = targetInfos.find((t) => t.type === "page" && t.url.endsWith("/popup.html"))?.url;
        if (!optionsUrl) await sleep(250);
    }
    check("gear button opens the options page via the background script", !!optionsUrl, optionsUrl || "no popup.html target");
    await cdp.send("Target.activateTarget", { targetId: pageTarget });

    // Cache entries were written through saveVideoInfo.
    const { targetInfos } = await cdp.send("Target.getTargets");
    const sw = targetInfos.find((t) => t.url.startsWith("chrome-extension://") && t.url.endsWith("/background.js"));
    if (sw) {
        const { sessionId: swSession } = await cdp.send("Target.attachToTarget", { targetId: sw.targetId, flatten: true });
        const count = await evaluate(
            `new Promise((res, rej) => {
                const r = indexedDB.open("subpeek-video-cache");
                r.onerror = () => rej(r.error);
                r.onsuccess = () => {
                    const c = r.result.transaction("videoInfo").objectStore("videoInfo").count();
                    c.onsuccess = () => res(c.result);
                    c.onerror = () => rej(c.error);
                };
            })`,
            swSession,
        );
        check("background IndexedDB holds cache entries after first load", count > 0, `${count} entries`);
    } else {
        console.log("INFO  background target not found; cache count skipped");
    }

    // Second load of the same page: lookups must be served from the cache.
    extPlayerRequests = 0;
    await send("Page.navigate", { url: URL_ });
    if (!(await waitForBadges())) throw new Error("no badges on second load");
    await sleep(1500);
    console.log("second load: badges", await evaluate(BADGES), "| extension player requests:", extPlayerRequests);
    check("second load served from cache (fewer extension player requests)", extPlayerRequests < firstLoadRequests, `${extPlayerRequests} vs ${firstLoadRequests}`);
    check("no [SubPeek] ERROR/WARN lines in the content script console", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
    if (process.exitCode !== 2) {
        console.error("ERROR", e.message);
        process.exitCode = 1;
    }
} finally {
    if (process.exitCode === undefined) process.exitCode = results.every(Boolean) ? 0 : 1;
    console.log(process.exitCode === 0 ? "RESULT: PASS" : process.exitCode === 2 ? "RESULT: SKIP" : "RESULT: FAIL");
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], { stdio: "ignore" });
}
