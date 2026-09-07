const LOG_PREFIX = "[SubPeek]";

export const logger = {
    info(...args: any[]) {
        console.info(`${LOG_PREFIX} INFO`, ...args);
    },
    warn(...args: any[]) {
        console.warn(`${LOG_PREFIX} WARN`, ...args);
    },
    error(...args: any[]) {
        console.error(`${LOG_PREFIX} ERROR`, ...args);
    },
    debug(...args: any[]) {
        console.debug(`${LOG_PREFIX} DEBUG`, ...args);
    },
};
