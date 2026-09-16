// Firefox counterpart of toggle-check.mjs: turning SubPeek off from the
// in-page popup's power button must tear down badges, wrappers and observers
// in the current tab right away, not only for cards loaded afterwards.
//
// Regression check for the BrowserStorageSync change notification: a
// `new EventTarget()` created inside a Firefox content script never delivers
// events to its listeners, so storage subscribers (start/stop, popup
// re-render) silently never ran on Firefox while the in-memory cache did
// update (which is why scrolling to new cards looked correct).
//
// Drives headless Firefox over WebDriver BiDi (no client library; Node 24 has
// a global WebSocket). BiDi cannot navigate to moz-extension:// pages, so the
// toolbar popup is not exercised here; the power button goes through the same
// storage.onChanged path.
//
// Usage: node probes/toggle-check-firefox.mjs [url]
// Exit 0 = pass, 1 = fail, 2 = could not run (no badges).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FIREFOX = "C:/Program Files/Mozilla Firefox/firefox.exe";
const EXT = path.resolve(".output/firefox-mv2");
const URL_ = process.argv[2] || "https://www.youtube.com/results?search_query=mrbeast";
const PORT = 9449;
const PROFILE = path.resolve(".temp/toggle-check-firefox-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.writeFileSync(
    path.join(PROFILE, "user.js"),
    [
        `user_pref("browser.shell.checkDefaultBrowser", false);`,
        `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
        `user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);`,
        `user_pref("browser.startup.homepage", "about:blank");`,
        `user_pref("browser.startup.page", 0);`,
        `user_pref("intl.accept_languages", "en-US, en");`,
    ].join("\n"),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BiDi {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.type === "event") {
                this.listeners.forEach((l) => l(m));
                return;
            }
            const p = this.pending.get(m.id);
            this.pending.delete(m.id);
            if (!p) return;
            m.type === "error" ? p.reject(new Error(`${m.error}: ${m.message}`)) : p.resolve(m.result);
        };
    }
    send(method, params = {}) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    on(listener) {
        this.listeners.push(listener);
    }
}
async function connect() {
    for (let i = 0; i < 80; i++) {
        try {
            const ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
            await new Promise((res, rej) => {
                ws.onopen = res;
                ws.onerror = rej;
            });
            return new BiDi(ws);
        } catch {
            await sleep(500);
        }
    }
    throw new Error("no BiDi port");
}

const ff = spawn(
    FIREFOX,
    ["-headless", "--remote-debugging-port", String(PORT), "-profile", PROFILE, "-no-remote", "-new-instance", "about:blank"],
    { stdio: "ignore" },
);

const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

// Everything the content script leaves in the page, in one snapshot.
const DOM_SNAPSHOT = `JSON.stringify({
    wrappers: document.querySelectorAll('.ytbext-thumbnail-wrapper').length,
    containers: document.querySelectorAll('.ytbext-embed-container').length,
    badges: document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length,
    spinners: document.querySelectorAll('.ytbext-loading__spinner').length,
    processed: document.querySelectorAll('img[data-ytbext-processed]').length,
    anyNode: document.querySelectorAll('[class*="ytbext-"]').length,
    popup: !!document.querySelector('.ytbext-popup'),
    thumbImgs: document.querySelectorAll('a[href^="/watch?"] :not(.ytThumbnailViewModelBlurredImage) > img').length,
})`;

try {
    const bidi = await connect();
    await bidi.send("session.new", { capabilities: {} });
    await bidi.send("session.subscribe", { events: ["log.entryAdded"] });
    bidi.on((m) => {
        if (m.method !== "log.entryAdded") return;
        const text = m.params.text || "";
        if (text.includes("[SubPeek]")) console.log(`  ${text.slice(0, 200)}`);
    });

    await bidi.send("webExtension.install", { extensionData: { type: "path", path: EXT } });

    const { contexts } = await bidi.send("browsingContext.getTree");
    const context = contexts[0].context;
    const evaluate = async (expression) => {
        const r = await bidi.send("script.evaluate", {
            expression,
            target: { context },
            awaitPromise: true,
            resultOwnership: "none",
        });
        if (r.type === "exception") throw new Error("evaluate: " + (r.exceptionDetails?.text || JSON.stringify(r)));
        return r.result?.value;
    };
    const snapshot = async () => JSON.parse(await evaluate(DOM_SNAPSHOT));
    const click = (x, y) =>
        bidi.send("input.performActions", {
            context,
            actions: [
                {
                    type: "pointer",
                    id: "mouse",
                    parameters: { pointerType: "mouse" },
                    actions: [
                        { type: "pointerMove", x: Math.round(x), y: Math.round(y) },
                        { type: "pause", duration: 50 },
                        { type: "pointerDown", button: 0 },
                        { type: "pointerUp", button: 0 },
                    ],
                },
            ],
        });

    console.log("url:", URL_);
    await bidi.send("browsingContext.navigate", { context, url: URL_, wait: "complete" });

    // Headless Firefox only mounts the first couple of cards; that is enough.
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 60000) {
        const s = await snapshot();
        if (s.badges >= 2 && s.spinners === 0) {
            ready = true;
            break;
        }
        await sleep(500);
    }
    if (!ready) {
        console.log("SKIP  no badges rendered", JSON.stringify(await snapshot()));
        process.exitCode = 2;
        throw new Error("no badges");
    }
    await sleep(1500);
    const before = await snapshot();
    console.log("on (initial):", JSON.stringify(before));

    // ── Turn OFF via the in-page popup's power button ────────────────
    const badgePt = JSON.parse(
        await evaluate(`(() => {
            const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find(w => w.querySelector('.ytbext-badge'));
            const ir = w.querySelector('.ytbext-item').getBoundingClientRect();
            return JSON.stringify({ x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 });
        })()`),
    );
    await click(badgePt.x, badgePt.y);
    await sleep(800);
    const popupState = JSON.parse(
        await evaluate(`(() => {
            const btn = document.querySelector('.ytbext-popup__header-actions .ytbext-popup__header-action');
            const r = btn && btn.getBoundingClientRect();
            return JSON.stringify({ open: !!document.querySelector('.ytbext-popup'), title: btn && btn.title,
                     pt: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null });
        })()`),
    );
    check("track popup opens with a power button", popupState.open && !!popupState.pt, popupState.title || "");
    if (!popupState.pt) throw new Error("no power button");
    await click(popupState.pt.x, popupState.pt.y);

    // The teardown is synchronous once storage.onChanged arrives; give it a
    // generous window and remember how long it took.
    const t1 = Date.now();
    let off = null;
    while (Date.now() - t1 < 5000) {
        off = await snapshot();
        if (off.anyNode === 0) break;
        await sleep(200);
    }
    console.log("off:", JSON.stringify(off), `after ${Date.now() - t1} ms`);
    check("off: in-page popup closed", !off.popup);
    check("off: no extension nodes left in the page", off.anyNode === 0 && off.processed === 0, `anyNode=${off.anyNode} processed=${off.processed}`);
    check("off: thumbnails still present", off.thumbImgs >= before.wrappers, `${off.thumbImgs} imgs`);

    // Scroll to make YouTube load more cards; nothing of ours may react.
    for (let i = 0; i < 3; i++) {
        await evaluate(`window.scrollBy(0, 900)`);
        await sleep(700);
    }
    await sleep(2000);
    const offAfterScroll = await snapshot();
    check("off: still no extension nodes after scrolling", offAfterScroll.anyNode === 0 && offAfterScroll.processed === 0, `anyNode=${offAfterScroll.anyNode} wrappers=${offAfterScroll.wrappers}`);
} catch (e) {
    if (process.exitCode !== 2) {
        console.error("ERROR", e.message);
        process.exitCode = 1;
    }
} finally {
    if (process.exitCode === undefined) process.exitCode = results.every(Boolean) ? 0 : 1;
    console.log(process.exitCode === 0 ? "RESULT: PASS" : process.exitCode === 2 ? "RESULT: SKIP" : "RESULT: FAIL");
    ff.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(ff.pid)], { stdio: "ignore" });
}
