export interface YtcfgSnapshot {
    /** ytcfg INNERTUBE_CONTEXT */
    context: any;
    /** ytcfg INNERTUBE_CONTEXT_CLIENT_NAME - 1 for the WEB client */
    clientName?: number;
    /** ytcfg STS - signature timestamp */
    sts?: number;
    loggedIn: boolean;
}

const SET_CALL = /ytcfg\.set\(\s*\{/g;

const KEYS = [
    "INNERTUBE_CONTEXT",
    "INNERTUBE_CONTEXT_CLIENT_NAME",
    "STS",
    "LOGGED_IN",
] as const;

let snapshot: YtcfgSnapshot | null | undefined;

export function getYtcfg(): YtcfgSnapshot | null {
    if (snapshot === undefined) {
        snapshot = readYtcfg();
        if (snapshot) {
            logger.debug("ytcfg found in page scripts");
        } else {
            logger.warn(
                "ytcfg not found in page scripts; using watch-page fallback",
            );
        }
    }
    return snapshot;
}

function readYtcfg(): YtcfgSnapshot | null {
    const data: Partial<Record<(typeof KEYS)[number], any>> = {};

    for (const script of Array.from(document.scripts)) {
        if (script.src) continue;
        const text = script.textContent;
        if (!text || !text.includes("ytcfg.set(")) continue;

        for (const match of text.matchAll(SET_CALL)) {
            const start = match.index + match[0].length - 1; // the "{"
            const literal = balancedObject(text, start);
            if (!literal) continue;

            let parsed: any;
            try {
                parsed = JSON.parse(literal);
            } catch {
                continue;
            }

            for (const key of KEYS) {
                if (key in parsed) data[key] = parsed[key];
            }
        }
    }

    const context = data.INNERTUBE_CONTEXT;
    if (!context?.client) return null;

    return {
        context,
        clientName: data.INNERTUBE_CONTEXT_CLIENT_NAME,
        sts: data.STS,
        loggedIn: !!data.LOGGED_IN,
    };
}

function balancedObject(text: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
    }
    return null;
}
