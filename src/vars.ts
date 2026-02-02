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

	// Constructor saves the document and range.
	constructor(doc: vscode.TextDocument, public r: vscode.Range) {
		this.doc = doc;
		this.range = r;
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
	public toString(config: vscode.WorkspaceConfiguration): string {
		// Replace in format string
		let result = '';
		if (this.srcDec) {
			const srcDecFormat = config.get<string>('formatString.Decimal', "").trim();
			result += this.formatString(srcDecFormat, this.srcDec, this.srcSDec, this.convDecHex, this.convDecBin) + "\n";
		}
		if (this.srcSDec) {
			const srcSDecFormat = config.get<string>('formatString.SignedDecimal', "").trim();
			result += this.formatString(srcSDecFormat, this.srcDec, this.srcSDec, this.convSDecHex, this.convSDecBin) + "\n";
		}
		if (this.srcHex) {
			const srcHexFormat = config.get<string>('formatString.Hexadecimal', "").trim();
			result += this.formatString(srcHexFormat, this.convHexDec, this.convHexSDec, this.srcHex, this.convHexBin) + "\n";
		}
		if (this.srcBin) {
			const srcBinFormat = config.get<string>('formatString.Binary', "").trim();
			result += this.formatString(srcBinFormat, this.convBinDec, this.convBinSDec, this.convBinHex, this.srcBin) + "\n";
		}
		return result;
	}


	/** Format string.
	 * Replaces the placeholders with the given values.
	 * E.g. {dec}, {hex}, {dec_to_hex}, {hex_to_dec}, ...
	 * It also allows for multiple variables separated by commas (or
	 * other characters): {dec,hex,bin} or {dec,hex,bin: | }
	 */
	public formatString(format: string, dec: BigInt | undefined, sDec: BigInt | undefined, hex: BigInt | undefined, bin: BigInt | undefined): string {
		if (!format)
			return '';
		// Replace newlines
		let result = format.replace(/\\n/g, '\n');
		// Replace special variable which represents positive decimal and signed decimal.
		// If both are equal only one is printed.
		result = result.replace(/<([^<{]*)\{dec\}([^>]*)>/g, (_match, p1, p2) => {
			const vals = this.get2DecString(dec, sDec);
			return '<' + p1 + vals.join(p2 + '>, <' + p1) + p2 + '>';
		});

		// Replace variables in format string
		result = result.replace(/\{([^}]*)\}/g, (_match, p1) => {
			let convVal: string;
			// Values
			if (p1 === 'dec') {
				// Multiple values
				const vals = this.get2DecString(dec, sDec);
				convVal = vals.join(', ');
			}
			else if (p1 === 'decu')
				convVal = this.getDecString(dec);
			else if (p1 === 'deci')
				convVal = this.getDecString(sDec);
			else if (p1 === 'hex')
				convVal = this.getHexString(hex);
			else if (p1 === 'bin')
				convVal = this.getBinString(bin);
			// Nothing found
			else
				convVal = '{' + p1 + '}';
			return convVal;
		});
		// Check for buttons
		result = result.replace(/<([^>]*)>/g, (_match, p1) => {
			const args = encodeURIComponent(JSON.stringify({
				counter: Vars.msgCounter,
				text: p1,
				uri: this.doc.uri.toString(),
				range_start_line: this.range.start.line,
				range_start_character: this.range.start.character,
				range_end_line: this.range.end.line,
				range_end_character: this.range.end.character,
			}));
			const replacement = `[${p1}](command:hexHover._replace?${args} "Replace hovered value with ${p1}")`;
			return replacement;
		});

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
		return (binString.length > 16 * 4) ? '-' : binString.replace(/\B(?=(\d{8})+(?!\d))/g, "'"); //Hyphen every 8th digit
	}
}
