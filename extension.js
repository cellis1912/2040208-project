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
                        case 'analyzeCode':
                            await runAIAnalysis(panel);
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

async function runAIAnalysis(panel) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const code = editor.document.getText();

    try {
        // Select the AI model
        const [model] = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (!model) return;

        const messages = [
            vscode.LanguageModelChatMessage.User(
                `Analyze this code for accessibility (a11y) issues like missing aria-labels, 
                poor color contrast logic, or non-semantic HTML. 
                Provide a 2-sentence summary of the biggest issue: \n\n${code}`
            )
        ];

        const request = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let responseText = '';
        for await (const fragment of request.text) {
            responseText += fragment;
        }

        // Send the AI result back to your Webview
        panel.webview.postMessage({
            command: 'aiResult',
            text: responseText
        });

    } catch (err) {
        vscode.window.showErrorMessage(`AI Analysis failed: ${err.message}`);
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
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root {
                --spacing: 12px;
                --border-radius: 4px;
            }
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.4;
            }
            h1 { font-size: 1.5rem; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 8px; }
            h2 { font-size: 1rem; margin-top: 0; opacity: 0.8; }
            .container { display: grid; gap: 20px; max-width: 400px; }

            /* Card Styling */
            .section-card {
                background: var(--vscode-sideBar-background);
                border: 1px solid var(--vscode-widget-border);
                padding: var(--spacing);
                border-radius: var(--border-radius);
            }
            /* Controls */
            .row { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }
            .row input { margin-right: 10px; }
            .button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
            .button-grid button:last-child { grid-column: span 2; }

            /* Timer Specifics */
            #timer { font-size: 3rem; font-weight: bold; text-align: center; margin: 10px 0; font-family: monospace; }
            .timer-controls { display: flex; gap: 8px; justify-content: center; }

            /* VS Code Style Buttons */
            button {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 2px;
                cursor: pointer;
                font-size: 12px;
            }

            button:hover { background: var(--vscode-button-hoverBackground); }
            button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

            /* New AI section styling */
            .ai-box { margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px; font-style: italic; font-size: 11px; }
            .hidden { display: none; }
        </style>
    </head>
    <body>
        <h1>Accessibly Dashboard</h1>
        <div class="container">
            <section class="section-card">
                <h2>Interface Settings</h2>
                <label class="row">
                    <input type="checkbox" id="toggleSwitch">
                    <span>Minimalist Mode</span>
                </label>
                <label class="row">
                    <input type="checkbox" id="dyslexiaToggle">
                    <span>Dyslexia-friendly Mode</span>
                </label>
                <div class="button-grid">
                    <button id="hcDark">High Contrast Dark</button>
                    <button id="hcLight">High Contrast Light</button>
                    <button id="restore" class="secondary">Restore Theme</button>
                </div>
            </section>
            <section class="section-card">
                <h2>Focus Timer</h2>
                <div id="timer">25:00</div>
                <div class="timer-controls">
                    <button id="start">Start</button>
                    <button id="pause" class="secondary">Pause</button>
                    <button id="reset" class="secondary">Reset</button>
                </div>
            </section>
            <div class="container">
                    <section class="section-card">
                        <h2>AI Accessibility Assistant</h2>
                        <button id="analyzeBtn" style="width: 100%">Analyze Current File for A11y</button>
                        <div id="aiResponse" class="ai-box hidden">Waiting for AI...</div>
                    </section>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();

            // AI Action
            const analyzeBtn = document.getElementById('analyzeBtn');
            const aiResponse = document.getElementById('aiResponse');

            analyzeBtn.onclick = () => {
                aiResponse.classList.remove('hidden');
                aiResponse.textContent = "Analyzing code...";
                vscode.postMessage({ command: 'analyzeCode' });
            };

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'updateTime') {
                    document.getElementById('timer').textContent = message.time;
                }
                // Handle AI Response
                if (message.command === 'aiResult') {
                    aiResponse.textContent = message.text;
                }
            });

            // Timer Logic
            document.getElementById('start').onclick = () => vscode.postMessage({ command: 'startTimer' });
            document.getElementById('pause').onclick = () => vscode.postMessage({ command: 'pauseTimer' });
            document.getElementById('reset').onclick = () => vscode.postMessage({ command: 'resetTimer' });

            // Settings Logic
            document.getElementById('toggleSwitch').onchange = () => vscode.postMessage({ command: 'toggle' });
            document.getElementById('hcDark').onclick = () => vscode.postMessage({ command: 'hcDark' });
            document.getElementById('hcLight').onclick = () => vscode.postMessage({ command: 'hcLight' });
            document.getElementById('restore').onclick = () => vscode.postMessage({ command: 'restoreTheme' });

            const dyslexiaToggle = document.getElementById('dyslexiaToggle');
            dyslexiaToggle.onchange = () => {
                vscode.postMessage({ command: dyslexiaToggle.checked ? 'dyslexiaOn' : 'dyslexiaOff' });
            };

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