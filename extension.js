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
                        case 'breakdownTask':
                            await runTaskBreakdown(panel, message.userQuery);
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

async function runTaskBreakdown(panel, userQuery) {
    try {
        // Using the native LM API as the bridge for OpenAI/Copilot
        const [model] = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (!model) {
            vscode.window.showErrorMessage("AI Model not found.");
            return;
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(
                `Act as a Task Architect for a developer with ADHD or executive dysfunction. 
                The goal is to provide 'Task Initiation' support.
                
                USER GOAL: "${userQuery}"

                INSTRUCTIONS (Chain of Thought Strategy):
                1. Identify the high-level objective.
                2. Break this down into 3-5 major sub-tasks.
                3. For each sub-task, provide 2 very small 'micro-steps' that take less than 5 minutes.
                4. DO NOT provide any code snippets or technical syntax.
                5. Use clear, encouraging, and actionable language.
                
                FORMAT:
                - Use Markdown bold for sub-tasks.
                - Use [ ] for micro-steps.`
            )
        ];

        const request = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let responseText = '';
        for await (const fragment of request.text) {
            responseText += fragment;
            // Optional: Send fragments to webview for real-time streaming effect
        }

        panel.webview.postMessage({
            command: 'taskResult',
            text: responseText
        });

    } catch (err) {
        vscode.window.showErrorMessage(`Architect Error: ${err.message}`);
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
            .architect-card {
                border-top: 4px solid var(--vscode-debugIcon-breakpointForeground);
                background: var(--vscode-sideBar-background);
                padding: var(--spacing);
                border-radius: var(--border-radius);
                border: 1px solid var(--vscode-widget-border);
            }

            /* Controls */
            .row { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }
            .row input { margin-right: 10px; }
            .button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
            .button-grid button:last-child { grid-column: span 2; }

            /* Timer Specifics */
            #timer { font-size: 3rem; font-weight: bold; text-align: center; margin: 10px 0; font-family: monospace; }
            .timer-controls { display: flex; gap: 8px; justify-content: center; }

            /* VS Code Style Elements */
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

            textarea {
                width: 100%;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 8px;
                font-family: inherit;
                resize: vertical;
                box-sizing: border-box;
            }

            .checklist-output {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-widget-border);
                padding: 12px;
                margin-top: 15px;
                line-height: 1.6;
                font-size: 13px;
                border-radius: 4px;
                white-space: pre-wrap;
            }
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

            <section class="architect-card">
                <h2>The Task Architect</h2>
                <p style="font-size: 11px; margin-bottom: 8px;">Break complex goals into micro-steps:</p>
                <textarea id="taskInput" rows="3" placeholder="e.g. 'Build a navigation bar'"></textarea>
                <div class="button-grid" style="margin-top:10px;">
                    <button id="buildBtn">Decompose Task</button>
                    <button id="clearBtn" class="secondary">Clear Output</button>
                </div>
                <div id="output" class="checklist-output hidden"></div>
            </section>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Timer UI Elements
            const timerDisplay = document.getElementById('timer');
            
            // Architect UI Elements
            const buildBtn = document.getElementById('buildBtn');
            const clearBtn = document.getElementById('clearBtn');
            const output = document.getElementById('output');
            const taskInput = document.getElementById('taskInput');

            // --- Timer Logic ---
            document.getElementById('start').onclick = () => vscode.postMessage({ command: 'startTimer' });
            document.getElementById('pause').onclick = () => vscode.postMessage({ command: 'pauseTimer' });
            document.getElementById('reset').onclick = () => vscode.postMessage({ command: 'resetTimer' });

            // --- Architect Logic ---
            buildBtn.onclick = () => {
                const query = taskInput.value.trim();
                if (!query) return;
                output.classList.remove('hidden');
                output.innerHTML = "<em>Architecting your steps...</em>";
                vscode.postMessage({ command: 'breakdownTask', userQuery: query });
            };

            clearBtn.onclick = () => {
                output.classList.add('hidden');
                output.innerText = '';
                taskInput.value = '';
            };

            // --- Settings Logic ---
            document.getElementById('toggleSwitch').onchange = () => vscode.postMessage({ command: 'toggle' });
            document.getElementById('hcDark').onclick = () => vscode.postMessage({ command: 'hcDark' });
            document.getElementById('hcLight').onclick = () => vscode.postMessage({ command: 'hcLight' });
            document.getElementById('restore').onclick = () => vscode.postMessage({ command: 'restoreTheme' });

            const dyslexiaToggle = document.getElementById('dyslexiaToggle');
            dyslexiaToggle.onchange = () => {
                vscode.postMessage({ command: dyslexiaToggle.checked ? 'dyslexiaOn' : 'dyslexiaOff' });
            };

            // --- Message Listener ---
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateTime':
                        timerDisplay.textContent = message.time;
                        break;
                    case 'taskResult':
                        output.innerText = message.text;
                        break;
                }
            });
        </script>
    </body>
    </html>
    `;
}

function deactivate() {}

module.exports = { activate, deactivate };