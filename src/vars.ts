import * as vscode from 'vscode';


/** Class to hold variables, source and converted values.
 * And to format the conversions.
 */
export class Vars {
	protected static msgCounter = 0;
	srcDec: BigInt | undefined;
	srcSDec: BigInt | undefined;
	srcHex: BigInt | undefined;
	srcBin: BigInt | undefined;

	convDecHex: BigInt | undefined;
	convDecBin: BigInt | undefined;
	convSDecHex: BigInt | undefined;
	convSDecBin: BigInt | undefined;
	convHexDec: BigInt | undefined;
	convHexSDec: BigInt | undefined;
	convHexBin: BigInt | undefined;
	convBinDec: BigInt | undefined;
	convBinHex: BigInt | undefined;
	convBinSDec: BigInt | undefined;

	doc: vscode.TextDocument;
	range: vscode.Range;
	config: vscode.WorkspaceConfiguration;

	// Constructor saves the document and range.
	constructor(doc: vscode.TextDocument, range: vscode.Range, config: vscode.WorkspaceConfiguration) {
		this.doc = doc;
		this.range = range;
		this.config = config;
		Vars.msgCounter++;
	}

	// Fix range start by offset (e.g. to include $ for hex numbers)
	public fixRangeStart(offset: number) {
		this.range = new vscode.Range(
			this.range.start.line,
			this.range.start.character + offset,
			this.range.end.line,
			this.range.end.character
		);
	}


	/** Create the string from the variables and teh format strings. */
	public toString(): string {
		// Replace in format string
		const lines: string[] = [];
		if (this.srcDec) {
			const srcDecFormat = this.config.get<string>('formatString.decimal', "").trim();
			lines.push(this.formatString(srcDecFormat, this.srcDec, this.srcSDec, this.convDecHex, this.convDecBin));
		}
		if (this.srcSDec) {
			const srcSDecFormat = this.config.get<string>('formatString.signedDecimal', "").trim();
			lines.push(this.formatString(srcSDecFormat, this.srcDec, this.srcSDec, this.convSDecHex, this.convSDecBin));
		}
		if (this.srcHex) {
			const srcHexFormat = this.config.get<string>('formatString.hexadecimal', "").trim();
			lines.push(this.formatString(srcHexFormat, this.convHexDec, this.convHexSDec, this.srcHex, this.convHexBin));
		}
		if (this.srcBin) {
			const srcBinFormat = this.config.get<string>('formatString.binary', "").trim();
			lines.push(this.formatString(srcBinFormat, this.convBinDec, this.convBinSDec, this.convBinHex, this.srcBin));
		}
		// Get separator and join lines
		let separator = this.config.get<string>('formatString.stringSeparator', '\n');
		separator = separator.replace(/\\n/g, '\n');
		if (separator === '\n')
			separator += '\n';	// For a line break a double \n is required
		let result = lines.join(separator);
		return result;
	}


	/** Expects a string (a decimal, hexadecimal or binary number) and
	 * add digit grouping to it.
	 * @param value The string to add digit grouping to. E.g. "-12345"
	 * @param type The type of the number (dec, decu, deci, hex or bin) to get the correct grouping settings.
	 * @returns The string with digit grouping added. E.g. "-12,345"
	 */
	protected getDigitGroupedString(value: string, type: 'dec' | 'hex' | 'bin'): string {
		if (!value)
			return value;
		if (type.startsWith('dec')) {
			type = 'dec';	// decu, deci and dec are treated the same
		}

		// Get settings
		const groupSize = this.config.get<number>('digitGrouping.' + type + 'GroupSize', 0);
		const groupSeparator = this.config.get<string>('digitGrouping.' + type + 'GroupSeparator', '');
		if (groupSize <= 0 || !groupSeparator)
			return value;

		// Digit grouping
		let groupedValue = '';
		let lastIndex = value.length;

		// Loop through value string
		const startIndex = (value[0] === '-') ? 1 : 0;	// Skip sign
		let separator = '';
		while (true) {
			const index = lastIndex - groupSize;
			if (index <= startIndex)
				break;
			groupedValue = value.substring(index, lastIndex) + separator + groupedValue;
			// Next
			lastIndex = index;
			separator = groupSeparator;
		}

		groupedValue = value.substring(0, lastIndex) + separator + groupedValue;
		return groupedValue;
	}

	/** Replaces the variable placeholders {dec}, {hex} etc. with the real
	 * number values (as string).
	 * @returns A string with curly brackets, which contains both, the normal
	 * string converted number and the digit grouped version. E.g. "{{12345}}{{12,345}}"
	 */
	protected replaceVarsInFormatString(formatString: string, dec: BigInt | undefined, sDec: BigInt | undefined, hex: BigInt | undefined, bin: BigInt | undefined, grouping: boolean): string {
		// Replace variables in format string
		const result = formatString.replace(/\{([^}]*)\}/g, (_match, p1) => {
			let convVal: string;
			// Values
			if (p1 === 'dec') {
				// Only one value?
				if (sDec === undefined || dec === sDec)
					convVal = this.getDecString(dec);
				else {
					const decStr = this.getDecString(dec);
					const groupedDecStr = this.getDigitGroupedString(decStr, 'dec');
					const sDecStr = this.getDecString(sDec);
					const groupedSDecStr = this.getDigitGroupedString(sDecStr, 'dec');
					convVal = '{{' + decStr + '}}{{' + groupedDecStr + '}} or {{' + sDecStr + '}}{{' + groupedSDecStr + '}}';
					return convVal;
				}
			}
			else if (p1 === 'decu') {
				convVal = this.getDecString(dec);
			}
			else if (p1 === 'deci') {
				convVal = this.getDecString(sDec);
			}
			else if (p1 === 'hex') {
				convVal = this.getHexString(hex);
			}
			else if (p1 === 'bin') {
				convVal = this.getBinString(bin);
			}
			// Nothing found
			else {
				return '{' + p1 + '}';
			}
			// Add digit grouping
			convVal = '{{' + convVal + '}}{{' + this.getDigitGroupedString(convVal, p1) + '}}';
			return convVal;
		});
		return result;
	}

	/** Format string.
	 * Replaces the placeholders with the given values.
	 * E.g. {dec}, {hex}, {dec_to_hex}, {hex_to_dec}, ...
	 * It also allows for multiple variables separated by commas (or
	 * other characters): {dec,hex,bin} or {dec,hex,bin: | }
	 */
	protected formatString(format: string, dec: BigInt | undefined, sDec: BigInt | undefined, hex: BigInt | undefined, bin: BigInt | undefined): string {
		if (!format)
			return '';
		// Replace newlines
		let result = format.replace(/\\n/g, '\n');
		// Replace special variable which represents positive decimal and signed decimal.
		// If both are equal only one is printed.
		result = result.replace(/<([^<{]*)\{dec\}([^>]*)>/g, (_match, p1, p2) => {
			if (sDec === undefined || dec === sDec)
				return '<' + p1 + '{decu}' + p2 + '>';
			return '<' + p1 + '{decu}' + p2 + '> or <' + p1 + '{deci}' + p2 + '>';
		});

		// Replace variables in format string
		result = this.replaceVarsInFormatString(result, dec, sDec, hex, bin, false);
		// Check for 'buttons' (replacements)
		result = result.replace(/<([^>]*)>/g, (_match, p1) => {
			// Also the parameter p1 needs replacements. The converted number is in the format "{{12345}}{{12,345}}"
			// I.e. it contains the normal number for replacement
			// and the digit grouped number for display.
			const p1NormalReplacement = p1.replace(/\{\{([^}]*)\}\}\{\{[^}]*\}\}/g, (_match, p1n) => p1n);
			const p1GroupedReplacement = p1.replace(/\{\{[^}]*\}\}\{\{([^}]*)\}\}/g, (_match, p1g) => p1g);
			const args = encodeURIComponent(JSON.stringify({
				counter: Vars.msgCounter,
				text: p1NormalReplacement,
				uri: this.doc.uri.toString(),
				range_start_line: this.range.start.line,
				range_start_character: this.range.start.character,
				range_end_line: this.range.end.line,
				range_end_character: this.range.end.character,
			}));
			const replacement = `[${p1GroupedReplacement}](command:hexHover._replace?${args} "Replace hovered value with ${p1NormalReplacement}")`;
			return replacement;
		});
		// Now replace all remaining (non-button) variables with their
		// digit grouping values.
		result = result.replace(/\{\{[^}]*\}\}\{\{([^}]*)\}\}/g, (_match, p1g) => p1g);

		return result;
	}

	/** Returns a decimal string representation of the given bigint.
	 * Signed
	 */
	private getDecString(value: BigInt | undefined): string {
		if (value === undefined)
			return 'NA'
		const decString = value.toString();
		return decString;
	}

	/** Returns one or two decimal strings.
	 * If dec and sDec are equal, only one string is returned.
	 * Otherwise both are returned in an array.
	 */
	private get2DecString(dec: BigInt | undefined, sDec: BigInt | undefined): string[] {
		if (dec === undefined)
			return ['NA']
		const decString = this.getDecString(dec);
		if (sDec === undefined || dec === sDec)
			return [decString];
		const sDecString = this.getDecString(sDec);
		return [decString, sDecString];
	}

	/** Returns a hex string representation of the given bigint.
	 * Pads with zeroes.
	 */
	private getHexString(value: BigInt | undefined): string {
		if (value === undefined)
			return 'NA'
		let hexString = value.toString(16).toUpperCase();
		// Pad hex string to at least 2, 4, 8, 16, ... digits (1, 2, 4, 8 bytes)
		// Find minimal power of two bytes that fits the value
		const minDigits = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(1, hexString.length))));
		hexString = hexString.padStart(minDigits, '0');
		return hexString;
	}

	/** Returns a binary string representation of the given bigint, formatted with hyphens every 8 bits. */
	private getBinString(value: BigInt | undefined): string {
		if (value === undefined)
			return 'NA'
		let binString = value.toString(2);
		const binLen = 8 * (Math.floor((binString.length - 1) / 8) + 1);
		binString = binString.padStart(binLen, '0');
		return binString;
	}
}
