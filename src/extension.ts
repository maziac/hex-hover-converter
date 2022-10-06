import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = vscode.languages.registerHoverProvider({scheme: '*', language: '*'}, {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position, /(?<!\w)[0-9a-fA-FbhxulULHB_]+\b/)!;    // Note: for Verilog format: '[hHbBdD]... , e.g. 'h7123A for a hex number, b or B for a binary, d or D for a decimal
            if (!range)
                return;
            let hoveredWord = document.getText(range);
            if (hoveredWord) {
                // Check if negative
                const r2 = new vscode.Range(range.start.line, 0, range.start.line, range.start.character);
                const line = document.getText(r2);

                // Check for Verilog formatting (Note it does not allow e.g 'sh only 'h)
                const verilogMatch = /'\s*$/.exec(line);

                // Check formatting
                let match: RegExpExecArray | null;
                let value: bigint;
                const lines = new Array<string>();

                // Check if it ends with U and or L
                const ulMatch = /([^ul]*)([ul]*)/i.exec(hoveredWord);
                if (!ulMatch)
                    return; // Should not happen
                hoveredWord = ulMatch[1];
                const noSignedValue = (ulMatch[2].toLowerCase().indexOf('u') >= 0);

                // Check for decimal
                if (verilogMatch) {
                    match = /^d([0-9]+)$/gi.exec(hoveredWord);  // E.g. 'd1234
                }
                else {
                    match = /^([0-9]+)$/g.exec(hoveredWord);  // E.g. 1234
                }
                if (match) {
                    // Decimal
                    const decString = match[1];
                    const value = BigInt(decString);

                    // Check if decimal was negative
                    const negMatch = /-\s*$/.exec(line);
                    if (negMatch) {
                        // Round to next power of 2 (i.e. 16-bit, 32-bit, 64-bit, ...)
                        const len = 2 ** Math.ceil(Math.log2(value.toString(16).length));
                        const negValue = 2n ** (4n * BigInt(len)) - value;
                        addColumn(lines, 0, -value, negValue, negValue);
                    }

                    // Add positvie value
                    addColumn(lines, 0, value, value, value);
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

                    // Check if hex was negative
                    if (!noSignedValue) {
                        const len = hexString.length;
                        if (hexString.charCodeAt(0) >= '8'.charCodeAt(0)) {
                            // Check if length is power of 2
                            if (len > 1 && (len & -len) === len) {
                                // Negative hex value
                                const negValue = 2n ** (4n * BigInt(len)) - value;
                                addColumn(lines, 1, -negValue, value, value);
                            }
                        }
                    }

                    // Add positive hex value
                    addColumn(lines, 1, value, value, value);
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
                    // Add
                    addColumn(lines, 2, value, value, value);
                }

                // Check if the value was converted and should be shown
                if (lines.length != 0) {
                    // Display in a Markdown table
                    const mdText = new vscode.MarkdownString();
                    for (let line of lines)
                        mdText.appendMarkdown(line + '\n');
                    return new vscode.Hover(mdText);
                }
            }
        }
    });
    context.subscriptions.push(hoverProvider);
}

export function deactivate() {
}


/**
 * Adds a colum to the table.
 * @param lines The lines of the table.
 * @param emphasizedLine The line number to emphasize (bold).
 * @param decValue The decimal value to show.
 * @param hexValue The hex value to show.
 * @param binValue The binary value to show.
 */
function addColumn(lines: Array<string>, emphasizedLine: number, decValue: bigint, hexValue: bigint, binValue: bigint) {
    // Create table if not yet existing
    if (lines.length == 0) {
        // Set lines for table
        lines.push('| |');
        //let line1='|'+isDecNegative+',"'+line+'"|'+hoveredWord+'|';   // For testing
        lines.push('|:--|');
        lines.push('|Decimal:|');
        lines.push('|Hex:|');
        lines.push('|Binary:|');
    }

    // Add column
    lines[0] += ' |';
    lines[1] += ':--|';
    const cells = new Array<string>(3);
    cells[0] = decValue.toString();
    cells[1] = hexValue.toString(16).toUpperCase();
    let binString = binValue.toString(2);
    const binLen = 8 * (Math.floor((binString.length - 1) / 8) + 1);
    binString = binString.padStart(binLen, '0');
    cells[2] = (binString.length > 16 * 4) ? '-' : binString.replace(/\B(?=(\d{8})+(?!\d))/g, "'"); //Hyphen every 8th digit


    // Emphasize
    cells[emphasizedLine] = '**' + cells[emphasizedLine] + '**';
    lines[2] += cells[0] + '|';
    lines[3] += cells[1] + '|';
    lines[4] += cells[2] + '|';
}
