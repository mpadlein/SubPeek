interface ExtensionMessage {
	event: string;
	data?: any;
}

export async function onExtensionMessage(
	callback: (
		message: ExtensionMessage,
		sender: globalThis.Browser.runtime.MessageSender,
		sendResponse: (response?: any) => void
	) => void
) {
	await browser.runtime.onMessage.addListener(callback);
}

export async function sendExtensionMessage(message: ExtensionMessage) {
	await browser.runtime.sendMessage(message);
}
