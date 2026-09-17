// Pass/fail check for keyboard handling in the toolbar popup's language
// search: Enter/Tab add the highlighted match (the first one by default when
// there is a search term), ArrowUp/ArrowDown move the highlight with
// wrap-around, Escape closes and clears. Drives the built popup.html in
// headless Edge over CDP; screenshots land in .temp/.
//
// Usage: node probes/search-keys-check.mjs
// Exit 0 = pass, 1 = fail.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXT = path.resolve(".output/chrome-mv3");
const PORT = 9341;
const PROFILE = path.resolve(".temp/search-keys-profile");
const SHOTS = path.resolve(".temp");
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
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
        "--window-size=340,900",
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

// Everything the check needs about the search UI, in one snapshot.
const SNAPSHOT = `(() => {
    const input = document.getElementById('language-search');
    const items = [...document.querySelectorAll('.language-dropdown li:not(.no-results)')];
    return {
        expanded: !!input,
        focused: document.activeElement === input,
        value: input ? input.value : null,
        open: !!document.querySelector('.language-dropdown'),
        noResults: !!document.querySelector('.language-dropdown .no-results'),
        codes: items.map(li => li.dataset.code),
        activeIndex: items.findIndex(li => li.classList.contains('active')),
        activeCount: items.filter(li => li.classList.contains('active')).length,
        favorites: [...document.querySelectorAll('.language-tag')].map(t => t.dataset.code),
    };
})()`;

// Chromium needs a windowsVirtualKeyCode for the key to reach the page as a
// real key press (and "text" for keys that insert characters).
const KEYS = {
    ArrowDown: { code: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowUp: { code: "ArrowUp", windowsVirtualKeyCode: 38 },
    Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
    Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
    Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
};

try {
    const cdp = await connect();

    // The extension id comes from its service-worker target; Edge ships
    // component extensions with chrome-extension:// URLs of their own.
    let bg = null;
    for (let i = 0; i < 40 && !bg; i++) {
        const { targetInfos } = await cdp.send("Target.getTargets");
        bg = targetInfos.find(
            (t) =>
                t.url.startsWith("chrome-extension://") &&
                t.url.endsWith("/background.js"),
        );
        if (!bg) await sleep(300);
    }
    if (!bg) throw new Error("extension background target not found");
    const extId = new URL(bg.url).host;

    const { targetInfos } = await cdp.send("Target.getTargets");
    const pageTarget = targetInfos.find((t) => t.type === "page")?.targetId;
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
    const press = async (key) => {
        const k = KEYS[key];
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, ...k });
        await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key,
            code: k.code,
            windowsVirtualKeyCode: k.windowsVirtualKeyCode,
        });
        await sleep(80);
    };
    const type = async (text) => {
        await send("Input.insertText", { text });
        await sleep(80);
    };
    const snap = () => evaluate(SNAPSHOT);
    const shot = async (name) => {
        const { data } = await send("Page.captureScreenshot", {
            format: "png",
        });
        fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, "base64"));
    };

    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
        width: 340,
        height: 900,
        deviceScaleFactor: 2,
        mobile: false,
    });
    await send("Page.navigate", {
        url: `chrome-extension://${extId}/popup.html`,
    });
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
        ready = await evaluate(`!!document.querySelector('.add-language-row')`);
        if (!ready) await sleep(250);
    }
    if (!ready) throw new Error("popup did not render");

    // Open the search. handleExpand focuses the input synchronously.
    await evaluate(`document.querySelector('.add-language-row').click()`);
    await sleep(100);
    let s = await snap();
    check(
        "expand: input focused, popular list open, nothing highlighted",
        s.expanded && s.focused && s.open && s.activeIndex === -1,
        JSON.stringify({
            focused: s.focused,
            open: s.open,
            active: s.activeIndex,
        }),
    );
    check(
        "expand: default favorites are just 'en'",
        s.favorites.join(",") === "en",
        s.favorites.join(","),
    );

    // Enter with a blank input must not add anything.
    await press("Enter");
    s = await snap();
    check(
        "blank + Enter: no change",
        s.favorites.join(",") === "en" && s.open,
        s.favorites.join(","),
    );

    // Arrow keys work on the popular list too.
    await press("ArrowDown");
    s = await snap();
    const popularCount = s.codes.length;
    check(
        "blank + ArrowDown: first popular item highlighted",
        s.activeIndex === 0 && s.activeCount === 1,
        `active=${s.activeIndex} of ${popularCount}`,
    );
    await press("ArrowUp");
    s = await snap();
    check(
        "blank + ArrowUp: wraps to the last popular item",
        s.activeIndex === popularCount - 1,
        `active=${s.activeIndex}`,
    );
    const lastVisible = await evaluate(`(() => {
        const ul = document.querySelector('.language-dropdown');
        const li = ul.querySelector('li.active');
        const u = ul.getBoundingClientRect(), l = li.getBoundingClientRect();
        return l.top >= u.top - 1 && l.bottom <= u.bottom + 1;
    })()`);
    check("blank + ArrowUp: highlighted row scrolled into view", lastVisible);
    await shot("search-keys-popular-last.png");

    // Typing resets the highlight to the first match.
    await type("sp");
    s = await snap();
    check(
        "type 'sp': first match highlighted",
        s.value === "sp" &&
            s.open &&
            s.activeIndex === 0 &&
            s.codes[0] === "es",
        `codes=${s.codes.slice(0, 3).join(",")} active=${s.activeIndex}`,
    );
    const spCount = s.codes.length;
    await press("ArrowDown");
    await press("ArrowDown");
    s = await snap();
    check(
        "type 'sp' + 2x ArrowDown: third match highlighted",
        s.activeIndex === 2 && s.activeCount === 1,
        `active=${s.activeIndex}`,
    );
    await press("ArrowUp");
    s = await snap();
    check(
        "ArrowUp: back to second",
        s.activeIndex === 1,
        `active=${s.activeIndex}`,
    );
    await shot("search-keys-sp-second.png");
    for (let i = 0; i < spCount - 1; i++) await press("ArrowDown");
    s = await snap();
    check(
        "ArrowDown past the end: wraps to first",
        s.activeIndex === 0,
        `active=${s.activeIndex} of ${spCount}`,
    );
    const caretOk = await evaluate(
        `(() => { const i = document.getElementById('language-search'); return i.selectionStart === i.value.length; })()`,
    );
    check("arrow keys do not move the caret", caretOk);

    // Enter adds the highlighted match, clears and closes, keeps focus.
    await press("Enter");
    s = await snap();
    check(
        "Enter: 'es' added, input cleared, dropdown closed, focus kept",
        s.favorites.join(",") === "en,es" &&
            s.value === "" &&
            !s.open &&
            s.focused,
        JSON.stringify({
            fav: s.favorites,
            value: s.value,
            open: s.open,
            focused: s.focused,
        }),
    );

    // ArrowDown reopens the closed dropdown.
    await press("ArrowDown");
    s = await snap();
    check(
        "ArrowDown on closed dropdown: reopens with first item highlighted",
        s.open && s.activeIndex === 0,
        `open=${s.open} active=${s.activeIndex}`,
    );

    // Tab behaves like Enter and does not move focus away.
    await type("fr");
    s = await snap();
    check(
        "type 'fr': French first",
        s.codes[0] === "fr" && s.activeIndex === 0,
        s.codes.slice(0, 3).join(","),
    );
    await press("Tab");
    s = await snap();
    check(
        "Tab: 'fr' added and focus stays in the input",
        s.favorites.join(",") === "en,es,fr" && s.value === "" && s.focused,
        JSON.stringify({ fav: s.favorites, focused: s.focused }),
    );

    // Search limit: a broad term shows at most 10 rows and wraps within them.
    await type("a");
    s = await snap();
    check(
        "type 'a': capped at 10 matches",
        s.codes.length === 10 && s.activeIndex === 0,
        `${s.codes.length} rows`,
    );
    await press("ArrowUp");
    s = await snap();
    check(
        "ArrowUp from first: wraps to the 10th visible row",
        s.activeIndex === 9,
        `active=${s.activeIndex}`,
    );
    const tenthVisible = await evaluate(`(() => {
        const ul = document.querySelector('.language-dropdown');
        const li = ul.querySelector('li.active');
        const u = ul.getBoundingClientRect(), l = li.getBoundingClientRect();
        return l.top >= u.top - 1 && l.bottom <= u.bottom + 1;
    })()`);
    check("10th row scrolled into view", tenthVisible);
    await press("Escape");
    s = await snap();
    check(
        "Escape: dropdown closed and input cleared",
        !s.open && s.value === "" && s.focused,
        JSON.stringify({ open: s.open, value: s.value }),
    );

    // No results: Enter/Tab/arrows must be inert, Tab may move focus.
    await type("zzzz");
    s = await snap();
    check(
        "type 'zzzz': no results",
        s.open && s.noResults && s.codes.length === 0 && s.activeIndex === -1,
    );
    await press("ArrowDown");
    await press("Enter");
    s = await snap();
    check(
        "no results + ArrowDown/Enter: nothing happens",
        s.favorites.join(",") === "en,es,fr" && s.value === "zzzz" && s.open,
        JSON.stringify({ fav: s.favorites, value: s.value }),
    );
    await press("Tab");
    s = await snap();
    check(
        "no results + Tab: focus leaves the input (default Tab)",
        !s.focused && s.favorites.join(",") === "en,es,fr",
        `focused=${s.focused}`,
    );

    // Selecting an already-favorited match is a no-op that closes the list.
    await evaluate(`document.getElementById('language-search').focus()`);
    await evaluate(
        `(() => { const i = document.getElementById('language-search'); i.value = ''; i.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`,
    );
    await type("en");
    s = await snap();
    check(
        "type 'en': already-favorited English is first and highlighted",
        s.codes[0] === "en" && s.activeIndex === 0,
        s.codes.slice(0, 3).join(","),
    );
    await press("Enter");
    s = await snap();
    check(
        "Enter on a favorite: no duplicate, dropdown closed",
        s.favorites.join(",") === "en,es,fr" && !s.open && s.value === "",
        JSON.stringify({ fav: s.favorites, open: s.open }),
    );

    // A keyboard highlight is visible on a favorited row too.
    await type("e");
    await evaluate(`(() => {
        const li = document.querySelector('.language-dropdown li.active');
        const bg = getComputedStyle(li).backgroundColor;
        window.__activeBg = bg;
    })()`);
    const bgs = await evaluate(`(() => {
        const lis = [...document.querySelectorAll('.language-dropdown li')];
        const active = lis.find(li => li.classList.contains('active'));
        const plain = lis.find(li => !li.classList.contains('active') && !li.classList.contains('selected'));
        return { active: getComputedStyle(active).backgroundColor, plain: getComputedStyle(plain).backgroundColor, activeIsFavorite: active.classList.contains('selected') };
    })()`);
    check(
        "active row background differs from a plain row (favorite highlighted)",
        bgs.activeIsFavorite && bgs.active !== bgs.plain,
        JSON.stringify(bgs),
    );
    await shot("search-keys-e-active.png");
} catch (e) {
    console.error("ERROR", e.message);
    process.exitCode = 1;
} finally {
    if (process.exitCode === undefined)
        process.exitCode = results.every(Boolean) ? 0 : 1;
    console.log(process.exitCode === 0 ? "RESULT: PASS" : "RESULT: FAIL");
    edge.kill();
    await sleep(300);
    spawn("taskkill", ["/F", "/T", "/PID", String(edge.pid)], {
        stdio: "ignore",
    });
}
