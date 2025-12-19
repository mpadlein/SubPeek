// Popup script for YouTube Extension

document.addEventListener("DOMContentLoaded", () => {
	const enableFeature = document.getElementById("enableFeature");
	const actionBtn = document.getElementById("actionBtn");
	const statusText = document.querySelector(".status .text");

	// Load saved state
	chrome.storage.sync.get(["featureEnabled"], (result) => {
		enableFeature.checked = result.featureEnabled || false;
	});

	// Handle toggle change
	enableFeature.addEventListener("change", () => {
		const isEnabled = enableFeature.checked;
		chrome.storage.sync.set({ featureEnabled: isEnabled });

		// Notify content script
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
				chrome.tabs.sendMessage(tabs[0].id, {
					action: "toggleFeature",
					enabled: isEnabled,
				});
			}
		});

		statusText.textContent = isEnabled
			? "Feature enabled"
			: "Feature disabled";
	});

	// Handle action button click
	actionBtn.addEventListener("click", () => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
				chrome.tabs.sendMessage(
					tabs[0].id,
					{ action: "runAction" },
					(response) => {
						if (response?.success) {
							statusText.textContent = "Action completed!";
						} else {
							statusText.textContent = "Action failed";
						}
					}
				);
			}
		});
	});
});
