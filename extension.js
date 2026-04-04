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
            :root { 
                --spacing: 20px; 
                --radius: 12px;
                --card-bg: var(--vscode-sideBar-background);
                --input-bg: var(--vscode-input-background);
                --accent: var(--vscode-button-background);
            }
            
            body {
                font-family: 'Segoe UI', system-ui, sans-serif;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 30px;
                line-height: 1.5;
            }

            h1 { font-size: 2rem; font-weight: 300; margin-bottom: 30px; letter-spacing: -1px; color: var(--vscode-editor-foreground); }

            .container { 
                display: grid; 
                gap: 25px; 
                grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); 
            }

            .section-card {
                background: var(--card-bg);
                border: 1px solid var(--vscode-widget-border);
                padding: var(--spacing);
                border-radius: var(--radius);
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
                display: flex;
                flex-direction: column;
            }

            .delete-task {
                background: transparent;
                color: var(--vscode-errorForeground);
                border: none;
                cursor: pointer;
                font-size: 18px;
                font-weight: bold;
                padding: 0 5px;
                opacity: 0.5;
                transition: opacity 0.2s;
            }

            .delete-task:hover {
                opacity: 1;
            }

            .task-row {
                display: flex;
                align-items: flex-start; /* Keeps check and X at the top */
                gap: 12px;
                background: rgba(255, 255, 255, 0.05);
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 8px;
                transition: all 0.3s ease;
            }

            /* The actual text area */
            .task-text {
                flex-grow: 1;
                color: var(--vscode-foreground);
                font-size: 13px;
                line-height: 1.4;
                word-break: break-word; /* Prevents long words from breaking the UI */
                white-space: pre-wrap;  /* Allows text to wrap to the next line */
                outline: none;
                min-height: 1.4em;
            }
                
            h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 20px; opacity: 0.6; font-weight: 700; }

            /* Modern Toggles */
            .row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 14px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                margin-bottom: 8px;
                cursor: pointer;
            }
            .row input[type="checkbox"] {
                appearance: none; width: 40px; height: 20px; background: #444; border-radius: 20px; position: relative; cursor: pointer; transition: 0.3s;
            }
            .row input[type="checkbox"]::before {
                content: ""; position: absolute; width: 16px; height: 16px; border-radius: 50%; top: 2px; left: 2px; background: white; transition: 0.3s;
            }
            .row input[type="checkbox"]:checked { background: var(--accent); }
            .row input[type="checkbox"]:checked::before { transform: translateX(20px); }

            /* Buttons & Inputs */
            button {
                background: var(--accent); color: var(--vscode-button-foreground); border: none; padding: 12px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: 0.2s; font-size: 13px;
            }
            button:hover { background: var(--vscode-button-hoverBackground); transform: translateY(-1px); }
            button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            
            .button-row, .timer-controls { display: flex; gap: 8px; margin-top: 10px; }
            .button-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

            textarea {
                width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 14px; color: var(--vscode-input-foreground); resize: vertical; min-height: 80px; box-sizing: border-box;
            }

            #timer { font-size: 4rem; font-weight: 200; text-align: center; color: var(--vscode-textLink-foreground); margin: 10px 0; }

            .font-scaler-container {
                display: flex; align-items: center; justify-content: space-between; background: var(--input-bg); padding: 10px 15px; border-radius: 50px; border: 1px solid var(--vscode-widget-border);
            }

            /* Error Output Box */
            #errorOutput { margin-top: 15px; font-size: 13px; display: none; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; border-left: 4px solid var(--vscode-errorForeground); }
            
            /* Task Rows */
            .task-row {
                display: flex;
                align-items: flex-start; /* Align checkbox and X to the top of long text */
                gap: 12px;
                background: rgba(255, 255, 255, 0.05);
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 8px;
            }
            .task-text {
                flex-grow: 1;
                background: transparent;
                border: none;
                color: var(--vscode-foreground);
                outline: none;
                font-size: 13px;
                line-height: 1.4;
                word-break: break-word; /* This is the "Magic" line that stops clipping */
                white-space: pre-wrap;  /* Ensures text wraps naturally */
            }
            .task-check {
                flex-shrink: 0;
                margin-top: 3px;
            }
        </style>
    </head>
    <body>
        <h1>Accessibly Dashboard</h1>
        <div class="container">
            <section class="section-card">
                <h2>Interface Settings</h2>
                <label class="row"><span>Close Panels</span><input type="checkbox" id="toggleSwitch"></label>
                <label class="row"><span>Dyslexia Mode</span><input type="checkbox" id="dyslexiaToggle"></label>
            </section>

            <section class="section-card">
                <h2>Theme Presets</h2>
                <div class="button-grid">
                    <button id="hcDark">HC Dark</button>
                    <button id="hcLight">HC Light</button>
                    <button id="restore" class="secondary" style="grid-column: span 2;">Restore Original</button>
                </div>
            </section>

            <section class="section-card">
                <h2>Text Scaling</h2>
                <div class="font-scaler-container">
                    <button id="decFont" class="secondary">A-</button>
                    <span id="currentFontSize">20px</span>
                    <button id="incFont" class="secondary">A+</button>
                </div>
            </section>

            <section class="section-card">
                <h2>Focus Timer</h2>
                <div id="timer">25:00</div>
                <div class="timer-controls">
                    <button id="start" style="flex:1">Focus (25 mins)</button>
                    <button id="break" style="flex:1">Break (5 mins)</button>
                </div>
                <div class="timer-controls">
                    <button id="pause" class="secondary" style="flex:1">Pause</button>
                    <button id="reset" class="secondary" style="flex:1">Reset</button>
                </div>
            </section>

            <section class="section-card architect-card">
                <h2>Task Architect</h2>
                <textarea id="taskInput" placeholder="What's the goal? e.g., Build a login system"></textarea>
                <div class="button-row">
                    <button id="buildBtn">Generate Steps</button>
                    <button id="clearBtn" class="secondary">Clear</button>
                </div>
                <div id="output"></div>
            </section>

            <section class="section-card">
                <h2>Code Helper</h2>
                <button id="scanBtn">Scan File for Errors</button>
                <div id="errorOutput"></div>
            </section>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Re-linking all the button IDs from your script
            document.getElementById('incFont').onclick = () => vscode.postMessage({ command: 'changeFontSize', direction: 'increase' });
            document.getElementById('decFont').onclick = () => vscode.postMessage({ command: 'changeFontSize', direction: 'decrease' });
            document.getElementById('hcDark').onclick = () => vscode.postMessage({ command: 'hcDark' });
            document.getElementById('hcLight').onclick = () => vscode.postMessage({ command: 'hcLight' });
            document.getElementById('restore').onclick = () => vscode.postMessage({ command: 'restoreTheme' });
            document.getElementById('start').onclick = () => vscode.postMessage({ command: 'startTimer' });
            document.getElementById('break').onclick = () => vscode.postMessage({ command: 'startBreak' });
            document.getElementById('pause').onclick = () => vscode.postMessage({ command: 'pauseTimer' });
            document.getElementById('reset').onclick = () => vscode.postMessage({ command: 'resetTimer' });
            document.getElementById('toggleSwitch').onchange = () => vscode.postMessage({ command: 'toggle' });
            document.getElementById('dyslexiaToggle').onchange = (e) => vscode.postMessage({ command: e.target.checked ? 'dyslexiaOn' : 'dyslexiaOff' });
            
            document.getElementById('scanBtn').onclick = () => {
                const errOut = document.getElementById('errorOutput');
                errOut.style.display = 'block';
                errOut.innerHTML = '<em>Scanning...</em>';
                vscode.postMessage({ command: 'scanErrors' });
            };

            document.getElementById('buildBtn').onclick = () => {
                const val = document.getElementById('taskInput').value.trim();
                if(val) {
                    document.getElementById('output').innerHTML = '<em>Architecting...</em>';
                    vscode.postMessage({ command: 'breakdownTask', userQuery: val });
                }
            };

            // Add this right after the buildBtn.onclick block
            document.getElementById('clearBtn').onclick = () => {
                // 1. Clear the text area where you type
                document.getElementById('taskInput').value = '';
                
                // 2. Clear the generated list of tasks below it
                document.getElementById('output').innerHTML = '';
            };

            window.addEventListener('message', event => {
                const msg = event.data;
                if (msg.command === 'updateFontSize') document.getElementById('currentFontSize').textContent = msg.value + 'px';
                if (msg.command === 'updateTime') document.getElementById('timer').textContent = msg.time;
                if (msg.command === 'errorResult') {
                    const errOut = document.getElementById('errorOutput');
                    errOut.style.display = 'block';
                    errOut.innerHTML = msg.text;
                }
                if (msg.command === 'taskResult') renderTasks(msg.text);
            });

            function renderTasks(text) {
                const out = document.getElementById('output');
                out.innerHTML = '';
                
                // Split lines and filter out empty ones or AI bolding headers
                const lines = text.split('\\n').filter(l => l.trim() && !l.includes('**'));

                lines.forEach((line) => {
                    // Clean up AI markers like [ ], -, 1. etc.
                    const cleanText = line.replace(/^[#\\d\\.\\s\\-\\[\\]]+/, '').trim();
                    if(!cleanText) return;

                    // 1. Create the container
                    const div = document.createElement('div');
                    div.className = 'task-row';
                    
                    // 2. Set the Inner HTML with the checkbox, text input, and delete button
                    div.innerHTML = \`
                        <input type="checkbox" class="task-check">
                        <span class="task-text" contenteditable="true">\${cleanText}</span>
                        <button class="delete-task" title="Delete Task">×</button>
                    \`;

                    // 3. Grab references to the elements we just created
                    const checkbox = div.querySelector('.task-check');
                    const textInput = div.querySelector('.task-text');
                    const deleteBtn = div.querySelector('.delete-task');

                    // 4. Logic: Gray out/Strikethrough on toggle
                    checkbox.onchange = () => {
                        if (checkbox.checked) {
                            textInput.style.textDecoration = 'line-through';
                            textInput.style.opacity = '0.4';
                            div.style.background = 'rgba(255, 255, 255, 0.01)'; // Fade the whole row
                        } else {
                            textInput.style.textDecoration = 'none';
                            textInput.style.opacity = '1';
                            div.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                    };

                    // 5. Logic: Delete task on click
                    deleteBtn.onclick = () => {
                        div.remove();
                    };

                    out.appendChild(div);
                });
            }
        </script>
    </body>
    </html>`;
}
function deactivate() {}

module.exports = { activate, deactivate };