'use strict';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const hoverProvider = vscode.languages.registerHoverProvider({scheme: '*', language: '*'}, {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position, /(?<!\w)[\$0-9a-fA-FbhxulUL]+\b/)!;
            if (!range)
                return;
            let hoveredWord = document.getText(range);
            if (hoveredWord) {
                // Check if negative
                let r2 = new vscode.Range(range.start.line, 0, range.start.line, range.start.character);
                vscode.Position;
                const line = document.getText(r2);
                let negativeDecValue;
                let negativeHexValue;

                // Check formatting
                let match;
                let value;
                const lines = new Array<string>();

                // Check if it ends with U and or L
                const ulMatch = /([^ul]*)([ul]*)/i.exec(hoveredWord);
                if (!ulMatch)
                    return; // Should not happen
                hoveredWord = ulMatch[1];
                const noSignedValue = (ulMatch[2].toLowerCase().indexOf('u') >= 0);

                // Check for decimal
                match = /^([0-9]+)$/g.exec(hoveredWord);  // E.g. 1234
                if (match) {
                    // Decimal
                    const value = parseInt(hoveredWord, 10);
                    addColumn(lines, 0, value, value, value);
                    // Check if decimal was negative
                    const negMatch = /-\s*$/.exec(line);
                    if (negMatch != undefined)
                        negativeDecValue = value;
                }

                // Check for hex
                match = /^0x([0-9a-fA-F]+)$/g.exec(hoveredWord);  // E.g. 0x12FA
                if (!match)
                    match = /^\$([0-9a-fA-F]+)$/g.exec(hoveredWord);    // E.g. $AB4F
                if (!match)
                    match = /^([0-9a-fA-F]+)h$/g.exec(hoveredWord);    // E.g. 07E2h
                if (!match) {
                    match = /^([0-9a-fA-F]+)$/g.exec(hoveredWord);    // E.g. F08A
                }
                if (match) {
                    // Hexadecimal
                    const hexString = match[1];
                    value = parseInt(hexString, 16);
                    addColumn(lines, 1, value, value, value);
                    // Check if hex was negative
                    if (!noSignedValue) {
                        const len = hexString.length;
                        if (hexString.charCodeAt(0) >= '8'.charCodeAt(0)) {
                            if (len == 2 || len == 4 || len == 8)
                                negativeHexValue = value;
                        }
                    }
                }

                // Check for binary
                match = /^([01]+)b$/g.exec(hoveredWord);    // E.g. 10010b
                if (!match)
                    match = /^0b([01]+)$/g.exec(hoveredWord);    // E.g. 0b01011
                if (match) {
                    // Binary
                    const binString = match[1];
                    value = parseInt(binString, 2);
                    addColumn(lines, 2, value, value, value);
                }

                // Check for negative decimal values
                if (negativeDecValue != undefined) {
                    const value = negativeDecValue;
                    let negValue;
                    if (value < 0x100)
                        negValue = 0x100 - value;
                    else if (value < 0x10000)
                        negValue = 0x10000 - value;
                    else
                        negValue = 0x100000000 - value;
                    addColumn(lines, 0, -negativeDecValue, negValue, negValue);
                }

                // Check for negative hex values
                if (negativeHexValue != undefined) {
                    const value = negativeHexValue;
                    let negValue;
                    if (value < 0x100)
                        negValue = 0x100 - value;
                    else if (value < 0x10000)
                        negValue = 0x10000 - value;
                    else
                        negValue = 0x100000000 - value;
                    addColumn(lines, 1, -negValue, negativeHexValue, negativeHexValue);
                }

                // Check if the value was converted and should be shown
                if (lines.length != 0) {
                    // Display in a Markdown table
                    const mdText = new vscode.MarkdownString();
                    for (let i = 0; i < 5; i++)
                        mdText.appendMarkdown(lines[i] + '\n');
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
function addColumn(lines: Array<string>, emphasizedLine: number, decValue: number, hexValue: number, binValue: number) {
    // Create table if not yet existing
    if (lines.length==0) {
        // Set lines for table
        lines.push('| |');
        //let line1='|'+isDecNegative+',"'+line+'"|'+hoveredWord+'|';   // For testing
        lines.push('|:--|');
        lines.push('|Decimal:|');
        lines.push('|Hex:|');
        lines.push('|Binary:|');
    }

    // Add column
    lines[0]+=' |';
    lines[1]+=':--|';
    const cells=new Array<string>(3);
    cells[0]=decValue.toString();
    cells[1]=hexValue.toString(16).toUpperCase();
    cells[2]=binValue.toString(2);
    // Emphasize
    cells[emphasizedLine]='**'+cells[emphasizedLine]+'**';
    lines[2]+=cells[0]+'|';
    lines[3]+=cells[1]+'|';
    lines[4]+=cells[2]+'|';
}
