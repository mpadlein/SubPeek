// Pass/fail check: the audio badge must treat the ORIGINAL audio track as the
// one to hide, not whichever track YouTube marks `audioIsDefault` for the
// viewer's UI language. Regression check for the "original audio shows as a
// dub on non-English videos" bug.
//
// Usage: node probes/origin-check.mjs
// Exit 0 = pass, 1 = fail, 2 = could not run.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const PAGE = "https://www.youtube.com/results?search_query=mrbeast";
const PORT = 9339;
const PROFILE = path.resolve(".temp/origin-check-profile");
fs.rmSync(PROFILE, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// videoId -> what the audio popup must and must not list once the original is hidden
const CASES = [
    { id: "KKj9ZeZBe88", label: "Spanish original (Fede Vigevani)", original: "es-US", dub: "en-US" },
    { id: "lbLj5Yb6SAE", label: "French original (Squeezie)", original: "fr-FR", dub: "en-US" },
    { id: "gTKS8SAwUzE", label: "English original (MrBeast, control)", original: "en", dub: "es" },
];

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 0;
        this.pending = new Map();
        this.onEvent = () => {};
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (!m.id) return this.onEvent(m);
            const p = this.pending.get(m.id);
            this.pending.delete(m.id);
            if (p) m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
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
    const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
        }
        return r.result.value;
    };
    const logs = [];
    cdp.onEvent = (m) => {
        if (m.method !== "Runtime.consoleAPICalled") return;
        const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        if (text.includes("[SubPeek]") && /error|not found|fallback|rate limited/i.test(text)) logs.push(text);
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url: PAGE });
    // Wait for the content script to be live (real badges present), then inject our cards.
    let live = false;
    for (const start = Date.now(); Date.now() - start < 60000 && !live; ) {
        live = await evaluate(`document.querySelectorAll('.ytbext-embed-container').length > 0`);
        if (!live) await sleep(500);
    }
    if (!live) {
        console.log("SKIP  content script never rendered");
        process.exitCode = 2;
        throw new Error("not live");
    }

    const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    await evaluate(`(() => {
        ${JSON.stringify(CASES)}.forEach((c, i) => {
            const a = document.createElement('a');
            a.href = '/watch?v=' + c.id;
            a.id = 'origin-check-' + c.id;
            a.style.cssText = 'position:fixed;left:20px;top:' + (20 + i * 220) + 'px;width:320px;height:180px;z-index:99999;display:block;background:#333';
            const d = document.createElement('div');
            d.style.cssText = 'width:320px;height:180px';
            const img = document.createElement('img');
            img.src = '${GIF}';
            img.width = 320;
            img.height = 180;
            img.style.cssText = 'width:320px;height:180px';
            d.appendChild(img);
            a.appendChild(d);
            document.body.appendChild(a);
        });
    })()`);

    const ready = async (id) =>
        evaluate(`(() => {
            const a = document.getElementById('origin-check-${id}');
            const c = a && a.querySelector('.ytbext-embed-container');
            return !!c && c.querySelectorAll('.ytbext-item').length === 2 && !c.querySelector('.ytbext-loading__spinner');
        })()`);
    for (const c of CASES) {
        let ok = false;
        for (const start = Date.now(); Date.now() - start < 60000 && !ok; ) {
            ok = await ready(c.id);
            if (!ok) await sleep(500);
        }
        if (!ok) {
            check(`${c.label}: badges rendered`, false, "timeout");
            continue;
        }

        // Open the audio popup (second .ytbext-item) and read what it lists.
        const listed = await evaluate(`(() => {
            document.querySelector('.ytbext-popup')?.remove();
            const a = document.getElementById('origin-check-${c.id}');
            const items = a.querySelectorAll('.ytbext-item');
            items[1].click();
            return [...document.querySelectorAll('.ytbext-popup [data-language-code]')].map((el) => el.getAttribute('data-language-code'));
        })()`);
        await evaluate(`document.querySelector('.ytbext-popup')?.remove()`);
        const detail = `audio popup lists: ${listed.length ? listed.join(", ") : "(nothing)"}`;
        check(`${c.label}: original ${c.original} hidden from dub list`, !listed.includes(c.original), detail);
        check(`${c.label}: dub ${c.dub} kept in dub list`, listed.includes(c.dub));
    }
    if (logs.length) console.log("SubPeek problem lines:\n  " + [...new Set(logs)].join("\n  "));
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
