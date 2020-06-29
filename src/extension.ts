'use strict';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let aa = vscode.languages.registerHoverProvider({scheme: '*', language: '*'}, { 
        provideHover(document, position, token) {
            const hoveredWord=document.getText(document.getWordRangeAtPosition(position, /[\$0-9a-fA-Fbhx]+\b/));
            if (hoveredWord) {
                let match;
                let value;
                // Check for hex
                match=/^0x([0-9a-fA-F]+)$/g.exec(hoveredWord);  // Format 0x
                if (!match)
                    match=/^\$([0-9a-fA-F]+)$/g.exec(hoveredWord);    // Format $
                if (!match)
                    match=/^([0-9a-fA-F]+)h$/g.exec(hoveredWord);    // Format h
                if (match) {
                    // Hexadecimal
                    const hexString=match[1];
                    value=parseInt(hexString, 16);
                }

                // Check for binary
                if (!match) {
                    match=/^([01]+)b$/g.exec(hoveredWord);    // Format b
                    if (!match)
                        match=/^0b([01]+)$/g.exec(hoveredWord);    // Format 0b
                    if (match) {
                        // binary
                        const binString=match[1];
                        value=parseInt(binString, 2);
                    }
                }

                // Check for decimal
                if (!match) {
                    match=/^([0-9]+)$/g.exec(hoveredWord);    // Format 0-9
                    if (match) {
                        // Decimal
                        const decString=match[1];
                        value=parseInt(decString, 10);
                    }
                }

                // Convert to decimal, hex and binary
                if (value!=undefined) {
                    // Display in a Markdown table
                    const mdText=new vscode.MarkdownString();
                    mdText.appendMarkdown('| | |\n');
                    //mdText.appendMarkdown('| |'+hoveredWord+'|\n');   // For testing
                    mdText.appendMarkdown('|-|-|\n');
                    mdText.appendMarkdown('|Decimal:|'+value+'|\n');
                    mdText.appendMarkdown('|Hex:|'+value.toString(16).toUpperCase()+'|\n');
                    mdText.appendMarkdown('|Binary:|'+value.toString(2)+'|\n');
                    return new vscode.Hover(mdText);
                }
            }

        /* For Testing:
            0x0012
            $2000
            a+$123jj
            $2000
            $2000
            $Fabc
            $fghe
            234h
            1001b
            0b1001
            512
        */
        }
    });
    context.subscriptions.push(aa); 
}

export function deactivate() {
}