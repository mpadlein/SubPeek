// Pass/fail check for the on/off toggle: turning SubPeek off from the in-page
// popup must tear down every node and observer (no badges, no wrappers, no
// requests while scrolling), and turning it back on from the toolbar popup
// must bring badges back exactly once per thumbnail.
//
// Usage: node probes/toggle-check.mjs [url]
// Exit 0 = pass, 1 = fail, 2 = could not run (no badges).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const URL_ =
    process.argv[2] || "https://www.youtube.com/results?search_query=mrbeast";
const PORT = 9339;
const PROFILE = path.resolve(".temp/toggle-check-profile");
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
            m.error
                ? p.reject(new Error(m.error.message))
                : p.resolve(m.result);
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

// Everything the content script leaves in the page, in one snapshot.
const DOM_SNAPSHOT = `(() => ({
    wrappers: document.querySelectorAll('.ytbext-thumbnail-wrapper').length,
    containers: document.querySelectorAll('.ytbext-embed-container').length,
    badges: document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length,
    // Excludes the badge mirrored into an active hover preview.
    wrapperBadges: document.querySelectorAll('.ytbext-thumbnail-wrapper .ytbext-badge').length,
    previewHosts: document.querySelectorAll('.ytbext-preview-host').length,
    processed: document.querySelectorAll('img[data-ytbext-processed]').length,
    anyNode: document.querySelectorAll('[class*="ytbext-"]').length,
    popup: !!document.querySelector('.ytbext-popup'),
    nestedWrappers: document.querySelectorAll('.ytbext-thumbnail-wrapper .ytbext-thumbnail-wrapper').length,
    multiContainer: [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].filter(w => w.querySelectorAll(':scope > .ytbext-embed-container').length !== 1).length,
    thumbImgs: document.querySelectorAll('a[href^="/watch?"] :not(.ytThumbnailViewModelBlurredImage) > img').length,
}))()`;

try {
    const cdp = await connect();

    // Page target for YouTube.
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
    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
    });

    // Count player requests issued by the content script (initiator stack in
    // the extension bundle), so YouTube's own player calls are not counted.
    let extPlayerRequests = 0;
    cdp.on((m) => {
        if (
            m.method !== "Network.requestWillBeSent" ||
            m.sessionId !== sessionId
        )
            return;
        const url = m.params.request.url;
        if (!url.includes("/youtubei/v1/player") && !url.includes("/watch?v="))
            return;
        const frames = m.params.initiator?.stack?.callFrames || [];
        if (frames.some((f) => f.url.startsWith("chrome-extension://")))
            extPlayerRequests++;
    });

    console.log("url:", URL_);
    await send("Page.navigate", { url: URL_ });
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 60000) {
        ready = await evaluate(
            `document.querySelectorAll('.ytbext-embed-container .ytbext-badge').length >= 4`,
        );
        if (ready) break;
        await sleep(500);
    }
    if (!ready) {
        console.log("SKIP  no badges rendered");
        process.exitCode = 2;
        throw new Error("no badges");
    }
    await sleep(1500);

    const before = await evaluate(DOM_SNAPSHOT);
    console.log("on (initial):", JSON.stringify(before));
    check(
        "initial mount: one container per wrapper",
        before.multiContainer === 0 && before.nestedWrappers === 0,
    );
    console.log("player requests by extension so far:", extPlayerRequests);

    // Remember where each wrapped <img> lives so we can check it goes back.
    const parentsBefore = await evaluate(`(() => {
        return [...document.querySelectorAll('.ytbext-thumbnail-wrapper > img')].map(img => {
            const p = img.parentElement.parentElement;
            const key = 'p' + Math.random().toString(36).slice(2);
            p.dataset.probeKey = key;
            img.dataset.probeKey = key;
            return key;
        }).length;
    })()`);

    // ── Turn OFF via the in-page popup's power button ────────────────
    const badgePt = await evaluate(`(() => {
        const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find(w => w.querySelector('.ytbext-badge'));
        const ir = w.querySelector('.ytbext-item').getBoundingClientRect();
        return { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 };
    })()`);
    await mouse("mouseMoved", badgePt.x, badgePt.y);
    await sleep(100);
    await mouse("mousePressed", badgePt.x, badgePt.y, {
        button: "left",
        clickCount: 1,
    });
    await mouse("mouseReleased", badgePt.x, badgePt.y, {
        button: "left",
        clickCount: 1,
    });
    await sleep(800);
    const popupState = await evaluate(`(() => {
        const btn = document.querySelector('.ytbext-popup__header-actions .ytbext-popup__header-action');
        const r = btn && btn.getBoundingClientRect();
        return { open: !!document.querySelector('.ytbext-popup'), title: btn && btn.title,
                 pt: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
    })()`);
    check(
        "track popup opens with a power button",
        popupState.open && !!popupState.pt,
        popupState.title || "",
    );
    if (!popupState.pt) throw new Error("no power button");
    await mouse("mouseMoved", popupState.pt.x, popupState.pt.y);
    await sleep(100);
    await mouse("mousePressed", popupState.pt.x, popupState.pt.y, {
        button: "left",
        clickCount: 1,
    });
    await mouse("mouseReleased", popupState.pt.x, popupState.pt.y, {
        button: "left",
        clickCount: 1,
    });
    await sleep(1000);

    const off = await evaluate(DOM_SNAPSHOT);
    console.log("off:", JSON.stringify(off));
    check(
        "off: no extension nodes left in the page",
        off.anyNode === 0 && off.processed === 0 && !off.popup,
        `anyNode=${off.anyNode} processed=${off.processed} popup=${off.popup}`,
    );
    check(
        "off: thumbnails still present",
        off.thumbImgs >= before.wrappers,
        `${off.thumbImgs} imgs`,
    );
    const restored = await evaluate(`(() => {
        const imgs = [...document.querySelectorAll('img[data-probe-key]')];
        return { total: imgs.length, ok: imgs.filter(img => img.parentElement?.dataset.probeKey === img.dataset.probeKey).length };
    })()`);
    check(
        "off: every <img> is back under its original parent",
        restored.total === parentsBefore && restored.ok === restored.total,
        `${restored.ok}/${restored.total}`,
    );

    // Scroll to make YouTube load more cards; nothing of ours may react.
    const reqBeforeScroll = extPlayerRequests;
    for (let i = 0; i < 4; i++) {
        await evaluate(`window.scrollBy(0, 900)`);
        await sleep(700);
    }
    await sleep(2000);
    const offAfterScroll = await evaluate(DOM_SNAPSHOT);
    check(
        "off: still no extension nodes after scrolling",
        offAfterScroll.anyNode === 0 && offAfterScroll.processed === 0,
        `anyNode=${offAfterScroll.anyNode}`,
    );
    check(
        "off: no player requests from the extension while scrolling",
        extPlayerRequests === reqBeforeScroll,
        `${extPlayerRequests - reqBeforeScroll} new`,
    );
    await evaluate(`window.scrollTo(0, 0)`);
    await sleep(500);

    // ── Toolbar popup reflects OFF, and its switch turns things back ON ──
    const { targetInfos } = await cdp.send("Target.getTargets");
    const bg = targetInfos.find(
        (t) =>
            t.url.startsWith("chrome-extension://") &&
            t.url.endsWith("/background.js"),
    );
    if (!bg) throw new Error("extension background target not found");
    const extId = new URL(bg.url).host;
    // Keep the YouTube tab in the foreground: a background tab does not run
    // the rendering pipeline, and IntersectionObserver never fires there.
    const { targetId: popupTarget } = await cdp.send("Target.createTarget", {
        url: `chrome-extension://${extId}/popup.html`,
        background: true,
    });
    const { sessionId: popupSession } = await cdp.send(
        "Target.attachToTarget",
        { targetId: popupTarget, flatten: true },
    );
    await cdp.send("Target.activateTarget", { targetId: pageTarget });
    await cdp.send("Runtime.enable", {}, popupSession);
    let switchState = null;
    for (let i = 0; i < 20 && switchState === null; i++) {
        switchState = await evaluate(
            `(() => { const s = document.querySelector('.switch-input'); return s ? s.checked : null; })()`,
            popupSession,
        );
        if (switchState === null) await sleep(250);
    }
    check(
        "toolbar popup switch shows OFF",
        switchState === false,
        `checked=${switchState}`,
    );

    await evaluate(
        `document.querySelector('.switch-input').click()`,
        popupSession,
    );
    await sleep(300);
    const switchAfter = await evaluate(
        `document.querySelector('.switch-input').checked`,
        popupSession,
    );
    check("toolbar popup switch flips to ON", switchAfter === true);
    await cdp.send("Target.activateTarget", { targetId: pageTarget });
    const visibility = await evaluate(`document.visibilityState`);
    console.log("youtube tab visibility:", visibility);

    // Badges must come back in the YouTube tab.
    const t0 = Date.now();
    let on = null;
    while (Date.now() - t0 < 30000) {
        on = await evaluate(DOM_SNAPSHOT);
        if (on.badges >= 4) break;
        await sleep(500);
    }
    await sleep(1000);
    on = await evaluate(DOM_SNAPSHOT);
    console.log("on (again):", JSON.stringify(on));
    check(
        "on again: badges rendered",
        on.badges >= 4,
        `${on.badges} badges, ${on.wrappers} wrappers`,
    );
    check(
        "on again: one container per wrapper, no nested wrappers",
        on.multiContainer === 0 && on.nestedWrappers === 0,
        `multi=${on.multiContainer} nested=${on.nestedWrappers}`,
    );
    check(
        "on again: badge count on cards matches first mount",
        on.wrapperBadges === before.wrapperBadges,
        `${on.wrapperBadges} vs ${before.wrapperBadges}`,
    );

    // Track popup still works after the cycle.
    const badgePt2 = await evaluate(`(() => {
        const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find(w => w.querySelector('.ytbext-badge'));
        const ir = w.querySelector('.ytbext-item').getBoundingClientRect();
        return { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 };
    })()`);
    await mouse("mouseMoved", badgePt2.x, badgePt2.y);
    await sleep(100);
    await mouse("mousePressed", badgePt2.x, badgePt2.y, {
        button: "left",
        clickCount: 1,
    });
    await mouse("mouseReleased", badgePt2.x, badgePt2.y, {
        button: "left",
        clickCount: 1,
    });
    await sleep(800);
    const popupAgain = await evaluate(
        `({ open: !!document.querySelector('.ytbext-popup'), url: location.href })`,
    );
    check("on again: badge click opens the track popup", popupAgain.open);
    check(
        "on again: badge click does not navigate",
        popupAgain.url === URL_ || popupAgain.url.startsWith(URL_),
        popupAgain.url.slice(0, 60),
    );

    // Switch OFF from the toolbar popup closes the in-page popup too.
    await evaluate(
        `document.querySelector('.switch-input').click()`,
        popupSession,
    );
    await sleep(800);
    const offAgain = await evaluate(DOM_SNAPSHOT);
    check(
        "off from toolbar: popup closed and nodes gone",
        !offAgain.popup && offAgain.anyNode === 0,
        `anyNode=${offAgain.anyNode}`,
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
