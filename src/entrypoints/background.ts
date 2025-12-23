// Background service worker
export default defineBackground(() => {
	// Enable session storage access from content scripts
	browser.storage.session.setAccessLevel({
		accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
	});

	console.log("[YouTube Extension] Background script loaded");
});
