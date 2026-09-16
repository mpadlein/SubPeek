// Lives in src/utils/ because WXT auto-imports everything exported from this
// directory: `logger` is a global in every entrypoint, so never import it.

const LOG_PREFIX = "[SubPeek]";

export const logger = {
    info(...args: unknown[]) {
        console.info(`${LOG_PREFIX} INFO`, ...args);
    },
    warn(...args: unknown[]) {
        console.warn(`${LOG_PREFIX} WARN`, ...args);
    },
    error(...args: unknown[]) {
        console.error(`${LOG_PREFIX} ERROR`, ...args);
    },
    debug(...args: unknown[]) {
        console.debug(`${LOG_PREFIX} DEBUG`, ...args);
    },
};
