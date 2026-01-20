// ============================================
// TABLE FORMATTING UTILITIES
// ============================================

function padRight(str: string, len: number): string {
	return str.length >= len
		? `${str.slice(0, len - 1)}…`
		: str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
	return str.length >= len
		? str.slice(0, len)
		: " ".repeat(len - str.length) + str;
}

export function formatNumber(n: number, decimals: number = 2): string {
	return n.toFixed(decimals);
}

export function printTable(
	title: string,
	headers: string[],
	rows: string[][],
	colWidths: number[],
) {
	console.log(`\n${"═".repeat(colWidths.reduce((a, b) => a + b + 3, 1))}`);
	console.log(`  ${title}`);
	console.log("═".repeat(colWidths.reduce((a, b) => a + b + 3, 1)));

	// Header row
	const headerRow = headers
		.map((h, i) => padRight(h, colWidths[i]))
		.join(" │ ");
	console.log(`│ ${headerRow} │`);
	console.log(`├${colWidths.map((w) => "─".repeat(w + 2)).join("┼")}┤`);

	// Data rows
	for (const row of rows) {
		const formattedRow = row
			.map((cell, i) => {
				// Right-align numbers
				if (!Number.isNaN(parseFloat(cell)) && cell.match(/^[\d.-]+$/)) {
					return padLeft(cell, colWidths[i]);
				}
				return padRight(cell, colWidths[i]);
			})
			.join(" │ ");
		console.log(`│ ${formattedRow} │`);
	}

	console.log(`└${colWidths.map((w) => "─".repeat(w + 2)).join("┴")}┘`);
}

/**
 * Prints a simple table with minimal borders (used in completion impact analysis)
 */
export function printSimpleTable(
	headers: string[],
	rows: string[][],
	colWidths: number[],
	indent: string = "  ",
) {
	console.log(
		`${indent}┌${colWidths.map((w) => "─".repeat(w + 2)).join("┬")}┐`,
	);
	const headerRow = headers
		.map((h, i) => padRight(h, colWidths[i]))
		.join(" │ ");
	console.log(`${indent}│ ${headerRow} │`);
	console.log(
		`${indent}├${colWidths.map((w) => "─".repeat(w + 2)).join("┼")}┤`,
	);
	for (const row of rows) {
		const formattedRow = row
			.map((cell, i) => padRight(cell, colWidths[i]))
			.join(" │ ");
		console.log(`${indent}│ ${formattedRow} │`);
	}
	console.log(
		`${indent}└${colWidths.map((w) => "─".repeat(w + 2)).join("┴")}┘`,
	);
}
