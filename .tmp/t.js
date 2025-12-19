// let item = document.querySelector("ytd-rich-item-renderer");
// let url = item.querySelector("a#thumbnail").href;
// console.log(url);
let elements = document.querySelectorAll("ytd-rich-item-renderer");
// get only 10 elements
elements = Array.from(elements).slice(0, 10);

async function getVideoInfo(url) {
	let resp = await fetch(url);
	let html = await resp.text();

	let regex = /var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s;
	let ytInitialPlayerResponse = html.match(regex)[1];
	let data = JSON.parse(ytInitialPlayerResponse);
	return data;
}

(async () => {
	elements.forEach(async (element) => {
		let thumbnailElement = element.querySelector("a#thumbnail");
		let url = thumbnailElement.href;
		let data = await getVideoInfo(url);
		let langCodes =
			data.captions.playerCaptionsTracklistRenderer.captionTracks.map(
				(item) => item.languageCode
			);

		let tag = thumbnailElement.querySelector(".langCodes");
		if (!tag) {
			tag = document.createElement("div");
			tag.className = "langCodes";
			tag.style.cssText =
				"position: absolute; bottom: 0; left: 0; background: rgba(0, 0, 0, 0.5); color: white; padding: 5px;";
			thumbnailElement.appendChild(tag);
		}
		if (langCodes.length > 0) {
			tag.innerText = langCodes.join(", ");
		} else {
			tag.innerText = "No captions";
		}
	});
})();
