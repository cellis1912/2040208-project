const vscode = require('vscode');

let timerInterval = null;
let remainingSeconds = 25 * 60;
let timerPanel = null;

const ORIGINAL_THEME_KEY = 'originalTheme';
const ORIGINAL_EDITOR_SETTINGS_KEY = 'originalEditorSettings';

function activate(context) {
    vscode.languages.onDidChangeDiagnostics(() => {
        collection.clear();
        const diagnostics = vscode.languages.getDiagnostics();
        diagnostics.forEach(([uri, diagnosticList]) => {

            const simplifiedDiagnostics = diagnosticList.map(d => {

                if (d.severity !== vscode.DiagnosticSeverity.Error) return d;

                const simplified = explainError(d.message);

                return new vscode.Diagnostic(
                    d.range,
                    simplified,
                    d.severity
                );
            });

            collection.set(uri, simplifiedDiagnostics);
        });
    });

    const showToggleUI = vscode.commands.registerCommand(
        'accessible-toggle.showUI',
        () => {
            const panel = vscode.window.createWebviewPanel(
                'accessibleToggle',
                'Accessibly Dashboard',
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
                            startTimer(panel, 25*60);
                            break;
                        case 'startBreak':
                            timerPanel = panel
                            startTimer(panel, 5*60);
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
                        case 'scanErrors':
                            await explainActiveErrors(panel);
                            break;
                        case 'changeFontSize':
                            const newSize = await changeFontSize(message.direction);
                            panel.webview.postMessage({ command: 'updateFontSize', value: newSize });
                            break;

                        case 'getInitialFontSize':
                            const currentSize = vscode.workspace.getConfiguration().get('editor.fontSize') || 14;
                            panel.webview.postMessage({ command: 'updateFontSize', value: currentSize });
                            break;
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );
    context.subscriptions.push(showToggleUI);
}

async function changeFontSize(direction) {
    const config = vscode.workspace.getConfiguration();
    let currentSize = config.get('editor.fontSize') || 14;

    currentSize = (direction === 'increase') ? currentSize + 2 : Math.max(6, currentSize - 2);

    await config.update('editor.fontSize', currentSize, vscode.ConfigurationTarget.Global);
    return currentSize; // Return the new size so we can send it to the UI
}

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

async function runTaskBreakdown(panel, userQuery) {
    try {
        const [model] = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (!model) {
            vscode.window.showErrorMessage("AI Model not found.");
            return;
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(
                `Act as a Task Architect for a neurodiverse developer. 
                The goal is to provide 'Task Initiation' support.
                Please simply state list with no other explanations, preambles, or encouragement.
                
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
        console.log("--- PLAIN AI OUTPUT START ---");
        console.log(responseText);
        console.log("--- PLAIN AI OUTPUT END ---");
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

function startTimer(panel, seconds) {
    if (timerInterval) pauseTimer();

    remainingSeconds = seconds;
    panel.webview.postMessage({
        command: 'updateTime',
        time: formatTime(remainingSeconds)
    });

    timerInterval = setInterval(() => {
        remainingSeconds--;

        panel.webview.postMessage({
            command: 'updateTime',
            time: formatTime(remainingSeconds)
        });

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            vscode.window.showInformationMessage('⏰ Session complete!');
        }
    }, 1000);
}

function resetTimer(panel) {
    pauseTimer();
    remainingSeconds = 25 * 60;
    panel.webview.postMessage({
        command: 'updateTime',
        time: formatTime(remainingSeconds)
    });
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

async function explainActiveErrors(panel) {
    // 1. Try to find the editor that is currently visible alongside the panel
    // Or fall back to the first visible text editor
    const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors.find(e => e.document.uri.scheme === 'file');

    if (!editor) {
        panel.webview.postMessage({ 
            command: 'errorResult',
            text: "**No code file detected.** Please click into your code file and then back to the dashboard." 
        });
        return;
    }

    const uri = editor.document.uri;
    const diagnostics = vscode.languages.getDiagnostics(uri)
        .filter(d => d.severity === vscode.DiagnosticSeverity.Error);

    if (diagnostics.length === 0) {
        panel.webview.postMessage({ 
            command: 'errorResult',
            text: " No errors found in this file!" 
        });
        return;
    }

    const errorList = diagnostics.map((d, i) => 
        `Error ${i+1}: "${d.message}" at line ${d.range.start.line + 1}`
    ).join('\n');

    try {
        const [model] = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (!model) {
                    throw new Error("AI Model not found");
                }

        const messages = [
            vscode.LanguageModelChatMessage.User(
                `Explain these VS Code errors simply:
                ${errorList}
                
                For each error:
                1. What is wrong?
                2. How do I fix it?
                3. Keep explanations concise and beginner-friendly. Use bullet points.
                4. Avoid any supportive language or preambles, just the facts.`
            )
        ];

        const request = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let responseText = '';
        for await (const fragment of request.text) {
            responseText += fragment;
        }

        panel.webview.postMessage({
            command: 'errorResult',
            text: responseText
        });

    } catch (err) {
        // IMPORTANT: Tell the webview that the scan failed
        panel.webview.postMessage({
            command: 'errorResult',
            text: `❌ Error during scan: ${err.message}`
        });
        vscode.window.showErrorMessage(`AI Error: ${err.message}`);
    }
}

function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root { --spacing: 12px; --border-radius: 4px; }
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.4;
            }
            h1 { font-size: 1.5rem; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 8px; }
            h2 { font-size: 1rem; margin-top: 0; opacity: 0.8; }
            /* Change max-width to a percentage or remove it to fill the space */
            .container { 
                display: grid; 
                gap: 20px; 
                width: 100%;
                margin: 0 auto;
                /* This creates as many columns as will fit, with a minimum width of 300px each */
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            }

            .section-card, .architect-card {
                background: var(--vscode-sideBar-background);
                border: 1px solid var(--vscode-widget-border);
                padding: var(--spacing);
                border-radius: var(--border-radius);
                /* Remove fixed widths here if any exist */
                display: flex;
                flex-direction: column;
            }

            /* Ensure images or textareas inside don't break the layout */
            textarea {
                width: 100%;
                box-sizing: border-box; 
                resize: vertical;
            }
            .architect-card { border-top: 4px solid var(--vscode-debugIcon-breakpointForeground); }

            #errorOutput {
                margin-top: 15px;
                font-size: 13px;
                white-space: pre-wrap;
                background: rgba(0, 0, 0, 0.2);
                border-radius: var(--border-radius);
                display: none;
            }
            .error-inner { padding: 10px; border-left: 3px solid var(--vscode-errorForeground); }

            .row { display: flex; align-items: center; margin-bottom: 10px; cursor: pointer; }
            .row input { margin-right: 10px; }
            .button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
            .button-grid button:last-child { grid-column: span 2; }

            #timer { font-size: 3rem; font-weight: bold; text-align: center; margin: 10px 0; font-family: monospace; }
            .timer-controls { display: flex; gap: 8px; justify-content: center; }

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

            textarea {
                width: 100%;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 8px;
                box-sizing: border-box;
            }

            .task-row {
                display: flex;
                align-items: center;
                gap: 10px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-widget-border);
                padding: 8px;
                margin-top: 5px;
                border-radius: 4px;
            }
            .task-text { flex-grow: 1; background: transparent; border: none; color: var(--vscode-foreground); }
            .delete-task { background: transparent; color: var(--vscode-errorForeground); cursor: pointer; border: none; font-size: 16px; }
            
            #currentFontSize { font-weight: bold; min-width: 35px; display: inline-block; text-align: center; }
            /* Container for the scaling controls */
            .font-scaler-container {
                display: flex;
                align-items: center;
                justify-content: space-between; /* Spreads buttons to edges */
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-widget-border);
                border-radius: 20px; /* Capsule shape */
                padding: 4px;
                margin-top: 10px;
            }

            /* Style the buttons as circular or rounded squares */
            .font-scaler-container button {
                height: 32px;
                width: 32px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%; /* Makes them circular */
                font-size: 14px;
                font-weight: bold;
                transition: filter 0.2s;
            }

            /* Middle display area */
            .font-size-badge {
                flex-grow: 1;
                text-align: center;
                font-family: var(--vscode-editor-font-family, monospace);
                font-weight: 600;
                font-size: 13px;
                color: var(--vscode-input-foreground);
                letter-spacing: 0.5px;
            }

            #currentFontSize {
                color: var(--vscode-textLink-foreground); /* Adds a hint of color */
            }

            /* Feedback for accessibility */
            .font-scaler-container button:active {
                transform: scale(0.95);
            }
        </style>
    </head>
    <body>
        <h1>Accessibly Dashboard</h1>
        <div class="container">
            <section class="section-card">
                <h2>Interface Settings</h2>
                <label class="row"><input type="checkbox" id="toggleSwitch"><span>Close Unnecessary Panels</span></label>
                <label class="row"><input type="checkbox" id="dyslexiaToggle"><span>Dyslexia-friendly</span></label>
            </section>

            <section class="section-card">
                <h2>Theme</h2>
                <div class="button-grid">
                    <button id="hcDark">HC Dark</button>
                    <button id="hcLight">HC Light</button>
                    <button id="restore" class="secondary">Restore</button>
                </div>
            </section>

            <section class="section-card">
                <h2>Text Scaling</h2>
                <div class="font-scaler-container">
                    <button id="decFont" class="secondary" title="Decrease Font Size">A-</button>
                    <div class="font-size-badge">
                        <span id="currentFontSize" style="font-size: 18px;">20px</span>
                    </div>
                    <button id="incFont" class="secondary" title="Increase Font Size">A+</button>
                </div>
            </section>

            <section class="section-card">
                <h2>Focus Timer</h2>
                <div id="timer">25:00</div>
                <div class="timer-controls">
                    <button id="start">Focus (25m)</button>
                    <button id="break">Break (5m)</button> </div>
                <div class="timer-controls" style="margin-top: 8px;">
                    <button id="pause" class="secondary">Pause</button>
                    <button id="reset" class="secondary">Reset</button>
                </div>
            </section>

            <section class="section-card">
                <h2>The Task Architect</h2>
                <textarea id="taskInput" rows="3" placeholder="Describe your goal (e.g., Build a login page)"></textarea>
                <div class="button-grid">
                    <button id="buildBtn">Generate Steps</button>
                    <button id="clearBtn" class="secondary">Clear</button>
                </div>
                <div id="output" style="margin-top: 15px;"></div>
            </section>

            <section class="section-card">
                <h2>Code Helper</h2>
                <button id="scanBtn" style="width: 100%;">Scan File for Errors</button>
                <div id="errorOutput"></div>
            </section>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const output = document.getElementById('output');
            const errorOutput = document.getElementById('errorOutput');
            const taskInput = document.getElementById('taskInput');
            const fontSizeDisplay = document.getElementById('currentFontSize');

            // Initial Load
            vscode.postMessage({ command: 'getInitialFontSize' });

            // Button Listeners
            document.getElementById('incFont').onclick = () => vscode.postMessage({ command: 'changeFontSize', direction: 'increase' });
            document.getElementById('decFont').onclick = () => vscode.postMessage({ command: 'changeFontSize', direction: 'decrease' });
            
            document.getElementById('scanBtn').onclick = () => {
                errorOutput.style.display = 'block';
                errorOutput.innerHTML = '<div class="error-inner"><em>Scanning problems...</em></div>';
                vscode.postMessage({ command: 'scanErrors' });
            };

            document.getElementById('buildBtn').onclick = () => {
                const val = taskInput.value.trim();
                if(val) {
                    output.innerHTML = '<em>Architecting...</em>';
                    vscode.postMessage({ command: 'breakdownTask', userQuery: val });
                }
            };

            document.getElementById('clearBtn').onclick = () => {
                output.innerHTML = '';
                taskInput.value = '';
            };

            document.getElementById('start').onclick = () => vscode.postMessage({ command: 'startTimer' });
            document.getElementById('break').onclick = () => vscode.postMessage({ command: 'startBreak' }); // New Listener
            document.getElementById('pause').onclick = () => vscode.postMessage({ command: 'pauseTimer' });
            document.getElementById('reset').onclick = () => vscode.postMessage({ command: 'resetTimer' });
            document.getElementById('toggleSwitch').onchange = () => vscode.postMessage({ command: 'toggle' });
            document.getElementById('hcDark').onclick = () => vscode.postMessage({ command: 'hcDark' });
            document.getElementById('hcLight').onclick = () => vscode.postMessage({ command: 'hcLight' });
            document.getElementById('restore').onclick = () => vscode.postMessage({ command: 'restoreTheme' });
            document.getElementById('dyslexiaToggle').onchange = (e) => {
                vscode.postMessage({ command: e.target.checked ? 'dyslexiaOn' : 'dyslexiaOff' });
            };

            // Message Receiver
            window.addEventListener('message', event => {
                const msg = event.data;
                switch (msg.command) {
                    case 'updateFontSize':
                        fontSizeDisplay.textContent = msg.value + 'px';
                        break;
                    case 'updateTime':
                        document.getElementById('timer').textContent = msg.time;
                        break;
                    case 'taskResult':
                        renderTasks(msg.text);
                        break;
                    case 'errorResult':
                        errorOutput.style.display = 'block';
                        errorOutput.innerHTML = '<div class="error-inner">' + msg.text + '</div>';
                        break;
                }
            });

            function renderTasks(text) {
                output.innerHTML = '';
                const lines = text.split('\\n').filter(l => l.trim() && !l.includes('---'));
                const filteredLines = lines.filter(line => !line.includes('**'));

                filteredLines.forEach((line) => {
                    const clean = line.replace(/^[#\\d\\.\\s\\-\\[\\]]+/, '').trim();
                    if(!clean) return;

                    const div = document.createElement('div');
                    div.className = 'task-row';
                    div.innerHTML = '<input type="checkbox"><input type="text" class="task-text" value="' + clean + '"><button class="delete-task">×</button>';
                    
                    const check = div.querySelector('input[type="checkbox"]');
                    const txt = div.querySelector('.task-text');
                    check.onchange = () => {
                        txt.style.textDecoration = check.checked ? 'line-through' : 'none';
                        txt.style.opacity = check.checked ? '0.5' : '1';
                    };
                    div.querySelector('.delete-task').onclick = () => div.remove();
                    output.appendChild(div);
                });
            }
        </script>
    </body>
    </html>
    `;
}

function deactivate() {}

module.exports = { activate, deactivate };