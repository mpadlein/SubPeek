// Render each slides/slide-N.html to a 1280x800 PNG with headless Edge.
// Usage: node render.mjs <slidesDir> <outDir> [only-N]

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SLIDES = path.resolve(process.argv[2] || "slides");
const OUT = path.resolve(process.argv[3] || "out");
const ONLY = process.argv[4] ? Number(process.argv[4]) : null;
const PORT = 9335;
// Throwaway browser profile, kept out of the repo and removed on exit.
const PROFILE = path.join(os.tmpdir(), "subpeek-render-profile");
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
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    "--window-size=1280,800", "--no-first-run", "--no-default-browser-check",
    "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

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
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
        return r.result.value;
    };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    const files = fs.readdirSync(SLIDES).filter((f) => /^slide-\d+\.html$/.test(f)).sort();
    for (const f of files) {
        const n = Number(f.match(/\d+/)[0]);
        if (ONLY !== null && n !== ONLY) continue;
        await send("Page.navigate", { url: pathToFileURL(path.join(SLIDES, f)).href });
        await sleep(800);
        const start = Date.now();
        let ok = false;
        while (Date.now() - start < 20000) {
            ok = await evaluate(`(async () => {
                await document.fonts.ready;
                const imgs = [...document.images];
                const imgsOk = imgs.every(i => i.complete && i.naturalWidth > 0);
                const fontOk = document.fonts.check('900 60px Roboto') && document.fonts.check('400 27px Roboto');
                return imgsOk && fontOk;
            })()`);
            if (ok) break;
            await sleep(250);
        }
        const broken = await evaluate(`[...document.images].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src'))`);
        const size = await evaluate(`[innerWidth, innerHeight]`);
        console.log(f, "ready:", ok, "viewport:", size.join("x"), broken.length ? "BROKEN IMAGES: " + broken.join(", ") : "");
        await sleep(400);
        const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } });
        const out = path.join(OUT, `screenshot-${n}-1280x800.png`);
        fs.writeFileSync(out, Buffer.from(r.data, "base64"));
        console.log("saved", out);
    }
} catch (e) {
    console.error("FAILED", e);
    process.exitCode = 1;
} finally {
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], { stdio: "ignore" });
    await sleep(800);
    try {
        fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch {
        // Edge may still hold a lock for a moment; the next run clears it.
    }
}
