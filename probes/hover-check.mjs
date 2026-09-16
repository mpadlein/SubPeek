// Pass/fail check: after YouTube's hover preview starts on a card, a click on
// the SubPeek badge must open the track popup without navigating away, and
// nothing of ours may be left inside the preview once the mouse leaves.
//
// Usage: node probes/hover-check.mjs [url]
// Exit 0 = pass, 1 = fail, 2 = could not run (no badges).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const URL_ =
    process.argv[2] || "https://www.youtube.com/results?search_query=mrbeast";
const PORT = 9338;
const PROFILE = path.resolve(".temp/hover-check-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (!m.id) return;
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
        "--autoplay-policy=no-user-gesture-required",
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
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
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
    await send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
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

    const card = await evaluate(`(() => {
        const w = [...document.querySelectorAll('.ytbext-thumbnail-wrapper')].find(w => w.querySelector('.ytbext-badge'));
        const wr = w.getBoundingClientRect();
        const ir = w.querySelector('.ytbext-item').getBoundingClientRect();
        return { url: location.href, cardPt: { x: wr.left + wr.width / 2, y: wr.top + wr.height / 2 }, badgePt: { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 } };
    })()`);

    // Hover like a person would, then give YouTube time to start its preview.
    await mouse("mouseMoved", card.cardPt.x - 40, card.cardPt.y - 30);
    await sleep(120);
    await mouse("mouseMoved", card.cardPt.x, card.cardPt.y);
    await sleep(300);
    await mouse("mouseMoved", card.cardPt.x + 5, card.cardPt.y + 3);
    await sleep(3500);

    const state = await evaluate(`(() => {
        const p = document.querySelector('ytd-video-preview');
        const active = !!(p && p.hasAttribute('active'));
        const mirrored = p ? p.querySelector('.ytbext-item') : null;
        const r = mirrored ? mirrored.getBoundingClientRect() : null;
        const hit = document.elementFromPoint(${card.badgePt.x}, ${card.badgePt.y});
        return { previewActive: active, mirroredBadge: !!mirrored,
                 clickPt: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null,
                 hitIsBadge: !!(hit && hit.closest('.ytbext-item')) };
    })()`);
    console.log(
        "preview active:",
        state.previewActive,
        "| mirrored badge:",
        state.mirroredBadge,
        "| badge under pointer:",
        state.hitIsBadge,
    );
    if (state.previewActive) {
        check(
            "badge is what the pointer hits while the preview plays",
            state.hitIsBadge,
        );
    }

    const pt = state.clickPt || card.badgePt;
    await mouse("mouseMoved", pt.x, pt.y);
    await sleep(150);
    await mouse("mousePressed", pt.x, pt.y, { button: "left", clickCount: 1 });
    await sleep(50);
    await mouse("mouseReleased", pt.x, pt.y, { button: "left", clickCount: 1 });
    await sleep(1200);
    const afterClick = await evaluate(
        `({ url: location.href, popup: !!document.querySelector('.ytbext-popup') })`,
    );
    check("badge click opens the track popup", afterClick.popup);
    check(
        "badge click does not navigate",
        afterClick.url === card.url,
        afterClick.url.slice(0, 60),
    );

    await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
    });
    await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
    });
    // Park the pointer on the left guide rail, which never holds a card; a
    // fixed point further right can land on another video and legitimately
    // keep the preview active for that one.
    await mouse("mouseMoved", 30, 700);
    await sleep(2500);
    const afterLeave = await evaluate(
        `(() => {
            const p = document.querySelector('ytd-video-preview');
            const under = document.elementFromPoint(30, 700);
            return { active: !!(p && p.hasAttribute('active')),
                     leftover: !!(p && p.querySelector('.ytbext-embed-container')),
                     activeHref: (p && p.querySelector('a#media-container-link')?.href || '').slice(0, 60),
                     pointerOverCard: !!(under && under.closest('a[href^="/watch?"]')) };
        })()`,
    );
    if (state.previewActive) {
        check(
            "preview deactivates after the pointer leaves",
            !afterLeave.active,
            afterLeave.active
                ? `still active for ${afterLeave.activeHref}, pointer over card: ${afterLeave.pointerOverCard}`
                : "",
        );
        check(
            "no badge left inside the inactive preview",
            !afterLeave.leftover,
        );
    }
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
