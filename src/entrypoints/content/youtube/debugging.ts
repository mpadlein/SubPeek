// interface Metrics {
// 	cacheHit: number;
// 	cacheMiss: number;
// 	cacheExpired: number;
// 	cacheTotal: number;
// }

let metrics: any = {
	fetch: 0,
	cacheHit: 0,
	cacheMiss: 0,
	cacheExpired: 0,
	cacheTotal: 0,
	// mutationCase1: 0,
	// mutationCase2: 0,
	// mutationCase3: 0,
	// mutationCase4: 0,
	itsOsv: 0,
	itsOsvMatch: 0,
};

export const metricsProxy = new Proxy(metrics, {
	set: function (target, prop, value) {
		target[prop] = value;
		updateMetrics();
		return true;
	},
});

let container: HTMLElement;

function renderDebugging() {
	container = document.createElement("table");
	container.id = "ytb-debugging";
	// container.style.position = "fixed";
	// container.style.top = "0";
	// container.style.left = "0";
	// container.style.backgroundColor = "#000";
	// container.style.color = "#fff";
	// container.style.padding = "10px";
	// container.style.zIndex = "10000";
	document.body.appendChild(container);
}
document.addEventListener("DOMContentLoaded", renderDebugging);

function updateMetrics() {
	let s = Object.entries(metrics)
		.map(
			([key, value]) =>
				`<tr><td class="ytb-debugging-key">${key}</td><td class="ytb-debugging-value">${value}</td></tr>`
		)
		.join("\n");
	container.innerHTML = s;
}

// export function incrementCacheHit() {
// 	metrics.cacheHit++;
// 	updateMetrics();
// }

// export function incrementCacheMiss() {
// 	metrics.cacheMiss++;
// 	updateMetrics();
// }

// export function incrementCacheExpired() {
// 	metrics.cacheExpired++;
// 	updateMetrics();
// }

// export function incrementCacheTotal() {
// 	metrics.cacheTotal++;
// 	updateMetrics();
// }
