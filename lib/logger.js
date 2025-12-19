// Logger utility for YouTube Extension
const logger = {
	log(msg, level) {
		console.log(`[YouTube Extension] ${level}: ${msg}`);
	},
	info(msg) {
		this.log(msg, "INFO");
	},
	warn(msg) {
		this.log(msg, "WARN");
	},
	error(msg) {
		this.log(msg, "ERROR");
	},
	debug(msg) {
		this.log(msg, "DEBUG");
	},
};
