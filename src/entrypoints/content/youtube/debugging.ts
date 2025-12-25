import { videoCache } from "./cache";

let metrics: Record<string, any> = {
    fetch: 0,
    cacheHit: 0,
    itsOsv: 0,
    itsOsvMatch: 0,
};

export const metricsProxy = new Proxy(metrics, {
    get: function (target, prop: string) {
        return prop in target ? target[prop] : 0;
    },

    set: function (target, prop: string, value) {
        target[prop] = value;
        updateMetrics();
        return true;
    },
});

let container: HTMLElement;
let table: HTMLElement;

function renderDebugging() {
    console.log("renderDebugging");
    container = document.createElement("div");
    container.id = "ytb-debugging";
    // container.style.display = "none";
    container.innerHTML = `
    <table></table>
    <button id='ytb-debugging-clear-cache'>Clear cache</button>
    <button id='ytb-debugging-show-languages'>LangCode</button>
    `;

    table = document.createElement("table");
    container.appendChild(table);

    document.body.appendChild(container);

    document
        .getElementById("ytb-debugging-clear-cache")!
        .addEventListener("click", () => {
            videoCache.clear();
        });

    document
        .getElementById("ytb-debugging-show-languages")!
        .addEventListener("click", () => {
            getLangCodes().then((arr) => {
                console.log(arr);
            });
        });

    // setInterval(() => {
    // 	getLangCodes().then((obj) => {
    // 		Object.entries(obj).forEach(([k, v]) => {
    // 			metrics[k] = v?.length;
    // 		});
    // 		updateMetrics();
    // 	});
    // }, 3000);
}

function getLangCodes() {
    return new Promise<Record<string, string[]>>((resolve) => {
        browser.storage.local.get(null).then((data) => {
            const entries: [string, any][] = Object.entries(data).filter(
                ([k]) => k.startsWith("languageCode:"),
            );

            const obj: Record<string, any> = {};
            for (const entry of entries) {
                const prefix = entry[0].split(":").slice(0, 2).join(":");

                if (!obj[prefix]) obj[prefix] = new Map();
                obj[prefix].set(entry[1].languageCode, entry[1]);
            }

            Object.keys(obj).forEach((k) => {
                obj[k] = Array.from(obj[k].values());
                obj[k].sort((a: any, b: any) =>
                    a.languageCode.localeCompare(b.languageCode),
                );
            });

            resolve(obj);
            // const map = new Map(
            // 	Object.values(data).map((v: any) => [v.languageCode, v])
            // );
            // const arr = Array.from(map.values());
            // arr.sort((a: any, b: any) =>
            // 	a.languageCode.localeCompare(b.languageCode)
            // );
            // resolve(arr);
        });
    });
}

renderDebugging();
function updateMetrics() {
    let s = Object.entries(metrics)
        .map(
            ([key, value]) =>
                `<tr><td class="ytb-debugging-key">${key}</td><td class="ytb-debugging-value">${value}</td></tr>`,
        )
        .join("\n");
    table.innerHTML = s;
}
