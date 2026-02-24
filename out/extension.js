const vscode = require('vscode');

function activate(context) {

    const showToggleUI = vscode.commands.registerCommand(
        'accessible-toggle.showUI',
        () => {
            const panel = vscode.window.createWebviewPanel(
                'minimalistToggle', // internal identifier
                'Minimalist Mode',  // title
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = getWebviewContent();
            
            // Listen for messages from the webview
            panel.webview.onDidReceiveMessage(
                message => {
                    if (message.command === 'toggle') {
                        toggleMinimalistMode();
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );

    context.subscriptions.push(showToggleUI);

    async function toggleMinimalistMode() {
        await vscode.commands.executeCommand('workbench.action.toggleActivityBarVisibility');
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        await vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
        await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
        await vscode.commands.executeCommand('workbench.action.togglePanel');
        await vscode.commands.executeCommand('editor.action.toggleMinimap');
        await vscode.commands.executeCommand('breadcrumbs.toggle');
        vscode.window.showInformationMessage('Minimalist Mode toggled!');
    }
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: sans-serif; padding: 20px; }
            label { display: flex; align-items: center; font-size: 16px; }
            input[type="checkbox"] { margin-right: 10px; transform: scale(1.5); }
        </style>
    </head>
    <body>
        <label>
            <input type="checkbox" id="toggleSwitch">
            Minimalist Mode
        </label>

        <script>
            const vscode = acquireVsCodeApi();
            const checkbox = document.getElementById('toggleSwitch');
            checkbox.addEventListener('change', () => {
                vscode.postMessage({ command: 'toggle' });
            });
        </script>
    </body>
    </html>
    `;
}

function deactivate() {}

module.exports = { activate, deactivate };