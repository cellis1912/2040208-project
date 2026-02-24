const vscode = require('vscode');
let timerInterval = null;
let remainingSeconds = 25 * 60;
let timerPanel = null;

const ORIGINAL_THEME_KEY = 'originalTheme';
const ORIGINAL_EDITOR_SETTINGS_KEY = 'originalEditorSettings';

function activate(context) {

    const showToggleUI = vscode.commands.registerCommand(
        'accessible-toggle.showUI',
        () => {
            const panel = vscode.window.createWebviewPanel(
                'minimalistToggle',
                'Minimalist Mode',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = getWebviewContent();

            panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'toggle':
                            await toggleMinimalistMode();
                            break;
                        case 'startTimer':
                            timerPanel = panel
                            startTimer(panel);
                            break;
                        case 'pauseTimer':
                            pauseTimer();
                            break;
                        case 'resetTimer':
                            resetTimer(panel);
                            break;
                        case 'hcDark':
                            await applyHighContrastDark(context);
                            break;
                        case 'hcLight':
                            await applyHighContrastLight(context);
                            break;
                        case 'restoreTheme':
                            await restoreOriginalTheme(context);
                            break;
                        case 'dyslexiaOn':
                            applyDyslexiaMode(context);
                            break;
                        case 'dyslexiaOff':
                            restoreEditorSettings(context);
                            break;
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );

    context.subscriptions.push(showToggleUI);

    async function toggleMinimalistMode() {
        const config = vscode.workspace.getConfiguration();

        await vscode.commands.executeCommand('workbench.action.toggleActivityBarVisibility');
        await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
        await vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
        await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
        await vscode.commands.executeCommand('workbench.action.togglePanel');
        await vscode.commands.executeCommand('breadcrumbs.toggle');

        // ✅ Correct way to control minimap
        const minimapEnabled = config.get('editor.minimap.enabled', true);
        await config.update(
            'editor.minimap.enabled',
            !minimapEnabled,
            vscode.ConfigurationTarget.Global
        );

        vscode.window.showInformationMessage('Minimalist Mode toggled!');
    }
}

async function applyDyslexiaMode(context) {
    const config = vscode.workspace.getConfiguration();

    // Save original editor settings once
    if (!context.globalState.get(ORIGINAL_EDITOR_SETTINGS_KEY)) {
        await context.globalState.update(ORIGINAL_EDITOR_SETTINGS_KEY, {
            fontFamily: config.get('editor.fontFamily'),
            lineHeight: config.get('editor.lineHeight'),
            letterSpacing: config.get('editor.letterSpacing'),
        });
    }

    await config.update(
        'editor.fontFamily',
        'Lexend, OpenDyslexic, monospace',
        vscode.ConfigurationTarget.Global
    );

    await config.update(
        'editor.lineHeight',
        26,
        vscode.ConfigurationTarget.Global
    );

    await config.update(
        'editor.letterSpacing',
        0.5,
        vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage('Dyslexia-friendly mode enabled');
}

async function restoreEditorSettings(context) {
    const config = vscode.workspace.getConfiguration();
    const original = context.globalState.get(ORIGINAL_EDITOR_SETTINGS_KEY);

    if (!original) return;

    await config.update('editor.fontFamily', original.fontFamily, vscode.ConfigurationTarget.Global);
    await config.update('editor.lineHeight', original.lineHeight, vscode.ConfigurationTarget.Global);
    await config.update('editor.letterSpacing', original.letterSpacing, vscode.ConfigurationTarget.Global);

    await context.globalState.update(ORIGINAL_EDITOR_SETTINGS_KEY, null);

    vscode.window.showInformationMessage('Editor settings restored');
}

async function applyHighContrastDark(context) {
    const config = vscode.workspace.getConfiguration();

    if (!context.globalState.get(ORIGINAL_THEME_KEY)) {
        await context.globalState.update(
            ORIGINAL_THEME_KEY,
            config.get('workbench.colorTheme')
        );
    }

    await config.update(
        'workbench.colorTheme',
        'Default High Contrast',
        vscode.ConfigurationTarget.Global
    );

    await config.update('editor.cursorStyle', 'block', vscode.ConfigurationTarget.Global);
    await config.update('editor.renderWhitespace', 'boundary', vscode.ConfigurationTarget.Global);
    await config.update('editor.guides.indentation', true, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage('High Contrast Dark preset applied');
}

async function applyHighContrastLight(context) {
    const config = vscode.workspace.getConfiguration();

    if (!context.globalState.get(ORIGINAL_THEME_KEY)) {
        await context.globalState.update(
            ORIGINAL_THEME_KEY,
            config.get('workbench.colorTheme')
        );
    }

    await config.update(
        'workbench.colorTheme',
        'Default High Contrast Light',
        vscode.ConfigurationTarget.Global
    );

    await config.update('editor.cursorStyle', 'block', vscode.ConfigurationTarget.Global);
    await config.update('editor.renderLineHighlight', 'all', vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage('High Contrast Light preset applied');
}

async function restoreOriginalTheme(context) {
    const config = vscode.workspace.getConfiguration();
    const originalTheme = context.globalState.get(ORIGINAL_THEME_KEY);

    if (originalTheme) {
        await config.update(
            'workbench.colorTheme',
            originalTheme,
            vscode.ConfigurationTarget.Global
        );
        await context.globalState.update(ORIGINAL_THEME_KEY, null);
    }

    vscode.window.showInformationMessage('Theme restored');
}

function startTimer(panel) {
    if (timerInterval) return;

    timerInterval = setInterval(() => {
        remainingSeconds--;

        panel.webview.postMessage({
            command: 'updateTime',
            time: formatTime(remainingSeconds)
        });

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            vscode.window.showInformationMessage('⏰ Focus session complete!');
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function resetTimer(panel) {
    pauseTimer();
    remainingSeconds = 25 * 60;

    panel.webview.postMessage({
        command: 'updateTime',
        time: formatTime(remainingSeconds)
    });
}

function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <body style="font-family:sans-serif;padding:20px">

        <label style="display:flex;align-items:center;font-size:16px">
            <h1>Accessibily Dashboard</h1>
        </label>
        <input type="checkbox" id="toggleSwitch">
        <span style="margin-left:10px">Minimalist Mode</span>
        <hr>

        <button id="hcDark">High Contrast Dark</button>
        <button id="hcLight">High Contrast Light</button>
        <button id="restore">Restore Theme</button>

        <hr>
        <label>
            <input type="checkbox" id="dyslexiaToggle">
            Dyslexia-friendly Mode
        </label>

        <h2 id="timer">25:00</h2>

        <button id="start">Start</button>
        <button id="pause">Pause</button>
        <button id="reset">Reset</button>

        <script>
            const vscode = acquireVsCodeApi();

            // Timer buttons
            document.getElementById('start').onclick = () =>
                vscode.postMessage({ command: 'startTimer' });

            document.getElementById('pause').onclick = () =>
                vscode.postMessage({ command: 'pauseTimer' });

            document.getElementById('reset').onclick = () =>
                vscode.postMessage({ command: 'resetTimer' });

            // Minimalist toggle
            document.getElementById('toggleSwitch').addEventListener('change', () =>
                vscode.postMessage({ command: 'toggle' })
            );

            // High contrast buttons
            document.getElementById('hcDark').onclick = () =>
                vscode.postMessage({ command: 'hcDark' });
            document.getElementById('hcLight').onclick = () =>
                vscode.postMessage({ command: 'hcLight' });
            document.getElementById('restore').onclick = () =>
                vscode.postMessage({ command: 'restoreTheme' });

            // Dyslexia-friendly toggle
            const dyslexiaToggle = document.getElementById('dyslexiaToggle');
            dyslexiaToggle.addEventListener('change', () => {
                vscode.postMessage({
                    command: dyslexiaToggle.checked ? 'dyslexiaOn' : 'dyslexiaOff'
                });
            });

            // Receive timer updates from extension
            window.addEventListener('message', event => {
                if (event.data.command === 'updateTime') {
                    document.getElementById('timer').textContent = event.data.time;
                }
            });
        </script>
    </body>
    </html>
    `;
}

function deactivate() {}

module.exports = { activate, deactivate };