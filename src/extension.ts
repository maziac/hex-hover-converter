import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
    // Provide hover
    const hoverProvider = vscode.languages.registerHoverProvider({scheme: '*', language: '*'}, {
        provideHover(document, position, _token) {
            const range = document.getWordRangeAtPosition(position, /(?<!\w)[0-9a-fA-FbhxulULHB_]+\b/)!;    // NOSONAR. Note: for Verilog format: '[hHbBdD]... , e.g. 'h7123A for a hex number, b or B for a binary, d or D for a decimal
            if (!range)
                return;
            let hoveredWord = document.getText(range);
            if (!hoveredWord)
                return;

            // Variables
            const vars = new Vars(document, range);

            // Check if negative
            const r2 = new vscode.Range(range.start.line, 0, range.start.line, range.start.character);
            const line = document.getText(r2);

            // Check for Verilog formatting (Note it does not allow e.g 'sh only 'h)
            const verilogMatch = /'\s*$/.exec(line);

            // Check formatting
            let match: RegExpExecArray | null;
            let value: bigint;

            // Check if it ends with U and or L
            const ulMatch = /([^ul]*)([ul]*)/i.exec(hoveredWord);
            if (!ulMatch)
                return; // Should not happen
            hoveredWord = ulMatch[1];
            const noSignedValue = (ulMatch[2].toLowerCase().indexOf('u') >= 0);

            // Check for decimal
            if (verilogMatch) {
                match = /^d(\d+)$/gi.exec(hoveredWord);  // E.g. 'd1234
            }
            else {
                match = /^(\d+)$/g.exec(hoveredWord);  // E.g. 1234
            }
            if (match) {
                // Decimal
                const decString = match[1];
                value = BigInt(decString);
                vars.srcDec = value;
                vars.convDecHex = value;
                vars.convDecBin = value;

                // Check if decimal was negative
                const negMatch = /-\s*$/.exec(line);
                if (negMatch) {
                    // Round to next power of 2 (i.e. 16-bit, 32-bit, 64-bit, ...)
                    const len = 2 ** Math.ceil(Math.log2(value.toString(16).length));
                    const negValue = 2n ** (4n * BigInt(len)) - value;
                    vars.srcSDec = BigInt(-vars.srcDec);
                    vars.convSDecHex = negValue;
                    vars.convSDecBin = negValue;
                }
            }

            // Check for Verilog hex
            if (verilogMatch) {
                match = /^h([0-9a-f_]+)$/gi.exec(hoveredWord);    // E.g. hFFFF00, for Verilog
            }
            else {
                // Check for hex
                match = /^0x([0-9a-fA-F_]+)$/g.exec(hoveredWord);  // E.g. 0x12FA
                if (!match)
                    match = /^([0-9a-fA-F_]+)h$/g.exec(hoveredWord);    // E.g. 07E2h
                if (!match) {
                    match = /^([0-9a-f_]+)$/gi.exec(hoveredWord);    // E.g. F08A
                }
            }
            if (match) {
                // Hexadecimal
                const hString = match[1];
                // Remove underscores
                const hexString = hString.replace(/_/g, '');
                value = BigInt('0x' + hexString);
                vars.srcHex = value;
                vars.convHexDec = value;
                vars.convHexBin = value;

                // Check if hex was negative
                if (!noSignedValue) {
                    const len = hexString.length;
                    if (hexString.charCodeAt(0) >= '8'.charCodeAt(0)) {
                        // Check if length is power of 2
                        if (len > 1 && (len & -len) === len) {
                            // Negative hex value
                            const negValue = 2n ** (4n * BigInt(len)) - value;
                            vars.convHexSDec = -negValue;
                        }
                    }
                }
            }

            // Check for binary
            if (verilogMatch) {
                match = /^b([01]+)$/gi.exec(hoveredWord);    // E.g. b01011, Verilog
            }
            else {
                match = /^([01]+)b$/g.exec(hoveredWord);    // E.g. 10010b
                if (!match)
                    match = /^0b([01]+)$/g.exec(hoveredWord);    // E.g. 0b01011
            }
            if (match) {
                // Binary
                const binString = match[1];
                value = BigInt('0b' + binString);
                vars.srcBin = value;
                vars.convBinDec = value;
                vars.convBinHex = value;
            }

            // Replace in format string
            let srcDecFormat = "{dec} → <0x{dec_to_hex}>, <0b{dec_to_bin}>";
            let srcIDecFormat = "{sdec} → <0x{sdec_to_hex}>, <0b{sdec_to_bin}>";
            let srcHexFormat = "0x{hex} → <{hex_to_dec}>, <0b{hex_to_bin}>";
            let srcBinFormat = "0b{bin} → <0x{bin_to_hex}>, <{bin_to_dec}>";
            let result = '';
            if (vars.srcDec !== undefined)
                result += vars.formatString(srcDecFormat) + "\n\n";
            if (vars.srcSDec !== undefined)
                result += '\n' + vars.formatString(srcIDecFormat) + "\n\n";
            if (vars.srcHex !== undefined)
                result += vars.formatString(srcHexFormat) + "\n\n";
            if (vars.srcBin !== undefined)
                result += vars.formatString(srcBinFormat) + "\n\n";
            console.log(result); // For testing

            // Check if the value was converted and should be shown
            if (result) {
                // Display the hover
                const mdText = new vscode.MarkdownString();
                mdText.isTrusted = true; // Allow executing a command from a link in the markdown
                mdText.appendMarkdown(result);
                return new vscode.Hover(mdText);
            }
        }
    });
    context.subscriptions.push(hoverProvider);

    // Register command to replace hovered value
    const replaceCommand = vscode.commands.registerCommand('hexHover._replace', async (args) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No active editor
        }
        // Get arguments
        const range = new vscode.Range(
            args.range_start_line,
            args.range_start_character,
            args.range_end_line,
            args.range_end_character
        );
        const uri = vscode.Uri.parse(args.uri);
        const text = args.text;
        // Create a WorkspaceEdit to replace the text
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, range, text);
        await vscode.workspace.applyEdit(edit);
    });
    context.subscriptions.push(replaceCommand);
}



/** Struct to hold variables, source and converted values. */
class Vars {
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

    doc: vscode.TextDocument;
    range: vscode.Range;

    // Constructor saves the document and range.
    constructor(doc: vscode.TextDocument, public r: vscode.Range) {
        this.doc = doc;
        this.range = r;
    }

    /** Format string.
     * Replaces the placeholders with the given values.
     * E.g. {dec}, {hex}, {dec_to_hex}, {hex_to_dec}, ...
     */
    public formatString(format: string): string {
        // Replace variables in format string
        let result = format;
        result = result.replace(/\{([^}]*)\}/g, (_match, p1) => {
            // Source values
            if (this.srcDec !== undefined && p1 === 'dec')
                return this.srcDec.toString();
            if (this.srcSDec !== undefined && p1 === 'sdec')
                return this.srcSDec.toString();
            if (this.srcHex !== undefined && p1 === 'hex')
                return this.getHexString(this.srcHex);
            if (this.srcBin !== undefined && p1 === 'bin')
                return this.getBinString(this.srcBin);
            // Converted values
            if (this.convDecHex !== undefined && p1 === 'dec_to_hex')
                return this.getHexString(this.convDecHex);
            if (this.convDecBin !== undefined && p1 === 'dec_to_bin')
                return this.getBinString(this.convDecBin);
            if (this.convSDecHex !== undefined && p1 === 'sdec_to_hex')
                return this.getHexString(this.convSDecHex);
            if (this.convSDecBin !== undefined && p1 === 'sdec_to_bin')
                return this.getBinString(this.convSDecBin);
            if (this.convHexDec !== undefined && p1 === 'hex_to_dec')
                return this.convHexDec.toString();
            if (this.convHexSDec !== undefined && p1 === 'hex_to_sdec')
                return this.convHexSDec.toString();
            if (this.convHexBin !== undefined && p1 === 'hex_to_bin')
                return this.getBinString(this.convHexBin);
            if (this.convBinDec !== undefined && p1 === 'bin_to_dec')
                return this.convBinDec.toString();
            if (this.convBinHex !== undefined && p1 === 'bin_to_hex')
                return this.getHexString(this.convBinHex);
            return '{' + p1 + '}';
        });
        // Check for buttons
        result = result.replace(/<([^>]*)>/g, (_match, p1) => {
            const args = encodeURIComponent(JSON.stringify({
                text: p1,
                uri: this.doc.uri.toString(),
                range_start_line: this.range.start.line,
                range_start_character: this.range.start.character,
                range_end_line: this.range.end.line,
                range_end_character: this.range.end.character,
            }));
            const replacement = `[${p1}](command:hexHover._replace?${args})`;
            console.log('replacement = ' + replacement); // For testing
            return replacement;
        });

        return result;
    }

    /** Returns a hex string representation of the given bigint.
     * Pads with zeroes.
    */
    private getHexString(value: BigInt): string {
        let hexString = value.toString(16).toUpperCase();
        // Pad hex string to at least 2, 4, 8, 16, ... digits (1, 2, 4, 8 bytes)
        // Find minimal power of two bytes that fits the value
        const minDigits = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(1, hexString.length))));
        hexString = hexString.padStart(minDigits, '0');
        return hexString;
    }

    /** Returns a binary string representation of the given bigint, formatted with hyphens every 8 bits. */
    private getBinString(value: BigInt): string {
        let binString = value.toString(2);
        const binLen = 8 * (Math.floor((binString.length - 1) / 8) + 1);
        binString = binString.padStart(binLen, '0');
        return (binString.length > 16 * 4) ? '-' : binString.replace(/\B(?=(\d{8})+(?!\d))/g, "'"); //Hyphen every 8th digit
    }

}
