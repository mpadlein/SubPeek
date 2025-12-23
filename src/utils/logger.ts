// Logger utility for YouTube Extension
export const logger = {
	log(msg: string, level: string) {
		console.log(`[YouTube Extension] ${level}: ${msg}`);
	},
	info(msg: string) {
		this.log(msg, "INFO");
	},
	warn(msg: string) {
		this.log(msg, "WARN");
	},
	error(msg: string) {
		this.log(msg, "ERROR");
	},
	debug(msg: string) {
		this.log(msg, "DEBUG");
	},
};
