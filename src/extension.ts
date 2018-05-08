'use strict';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let aa = vscode.languages.registerHoverProvider({scheme: '*', language: '*'}, { 
        provideHover(document, position, token) {
            const hoveredWord = document.getText(document.getWordRangeAtPosition(position));
            if (/^0x[0-9a-fA-F]+$/g.test(hoveredWord)) {
                var x = parseInt(hoveredWord, 16);
                return new vscode.Hover(hoveredWord + ' = ' + x);
            }
            
        }
    });
    context.subscriptions.push(aa); 
}

export function deactivate() {
}