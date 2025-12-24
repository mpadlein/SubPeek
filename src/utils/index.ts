export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function arrayEquals<T>(a: T[], b: T[]) {
	return (
		a.length === b.length && a.every((value, index) => value === b[index])
	);
}
