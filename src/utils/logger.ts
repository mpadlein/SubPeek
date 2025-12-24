export const logger = {
	log(level: string, ...args: any[]) {
		console.log(`[YouTube Extension] ${level}:`, ...args);
	},
	info(...args: any[]) {
		this.log("INFO", ...args);
	},
	warn(...args: any[]) {
		this.log("WARN", ...args);
	},
	error(...args: any[]) {
		this.log("ERROR", ...args);
	},
	debug(...args: any[]) {
		this.log("DEBUG", ...args);
	},
};
