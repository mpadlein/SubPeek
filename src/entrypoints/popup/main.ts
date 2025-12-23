import "./style.css";

document
	.querySelector<HTMLButtonElement>("#btn-clear_cache")!
	.addEventListener("click", () => {
		browser.storage.session.clear();
	});
