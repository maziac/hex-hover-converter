import * as vscode from 'vscode';
import {Vars} from './vars';

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

            // Get configuration
            const config = vscode.workspace.getConfiguration('hexHoverConverter');

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
                    if (line.endsWith('$')) {
                        match = /^([0-9a-fA-F_]+)$/g.exec(hoveredWord);    // E.g. $07E2
                        vars.fixRangeStart(-1); // Extend range to include $
                    }
                }
                if (!match) {
                    const strictHex = config.get<boolean>('strict.hexRecognition', false);
                    if (!strictHex)
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
                if (!match) {
                    const strictBin = config.get<boolean>('strict.binRecognition', false);
                    if (!strictBin)
                        match = /^([[01]+)$/gi.exec(hoveredWord);    // E.g. 01011
                }
            }
            if (match) {
                // Binary
                const binString = match[1];
                value = BigInt('0b' + binString);
                vars.srcBin = value;
                vars.convBinDec = value;
                vars.convBinHex = value;

                // Signed Decimal (nur wenn höchstes Bit gesetzt)
                if (binString[0] === '1') {
                    // Höchstes Bit gesetzt.
                    // Jetzt check ob Länge Zweierpotenz ist (8, 16, 32, 64, ...)
                    const bitLen = binString.length;
                    const isPowerOfTwo = (bitLen & (bitLen - 1)) === 0 && bitLen >= 8;
                    if (isPowerOfTwo) {
                        // Länge ist Zweierpotenz
                        const negValue = value - (2n ** BigInt(bitLen));
                        vars.convBinSDec = negValue;
                    }
                }
            }

            // Replace in format string
            const result = vars.toString(config);
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
    let prevMsgCounter = 0;
    let lastLength = 0;
    const replaceCommand = vscode.commands.registerCommand('hexHover._replace', async (args) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No active editor
        }
        // Get arguments
        const uri = vscode.Uri.parse(args.uri);
        const text = args.text;
        let range: vscode.Range;
        if (args.counter !== prevMsgCounter) {
            // Forget last length if new command
            lastLength = args.range_end_character - args.range_start_character;
        }
        range = new vscode.Range(
            args.range_start_line,
            args.range_start_character,
            args.range_start_line,
            args.range_start_character + lastLength
        );
        lastLength = text.length;
        prevMsgCounter = args.counter;

        // Create a WorkspaceEdit to replace the text
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, range, text);
        await vscode.workspace.applyEdit(edit);
    });
    context.subscriptions.push(replaceCommand);
}

