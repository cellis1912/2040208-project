const { Workbench, WebView, By, EditorView } = require('vscode-extension-tester');
const { expect } = require('chai');

describe('AI Latency: Task Architect', function() {
    let view;

    // Use 'function' instead of arrow functions for 'this.timeout' to work correctly
    before(async function() {
        this.timeout(60000);
        const workbench = new Workbench();
        await workbench.executeCommand('Open Accessible Extension'); // Use the TITLE of the command
        
        view = new WebView();
        await workbench.getDriver().wait(async () => {
            try {
                // This checks if the tab is actually open
                return await view.getTitle() === 'Accessibly Dashboard';
            } catch (e) {
                return false;
            }
        }, 15000); // Wait up to 15 seconds for the tab to appear

        // 3. Switch focus into the HTML
        await view.switchToFrame();
    });

    after(async () => {
        await view.switchBack(); // Return to VS Code native context
        await new EditorView().closeAllEditors();
    });

    it('should measure latency from Generate click to Task rendering', async function() {
        this.timeout(30000); // AI responses can take time

        // 1. Locate UI Elements inside the Webview
        const textarea = await view.findChildElement(By.id('taskInput'));
        const buildBtn = await view.findChildElement(By.id('buildBtn'));
        const output = await view.findChildElement(By.id('output'));

        // 2. Input the prompt
        await textarea.sendKeys('Build a React login page');

        // 3. Start Timer and Click
        const startTime = performance.now();
        await buildBtn.click();

        // 4. Polling: Wait for the first .task-row to be added to the DOM
        await view.getDriver().wait(async () => {
            const tasks = await output.findElements(By.className('task-row'));
            return tasks.length > 0;
        }, 20000); 

        const endTime = performance.now();
        
        // 5. Calculate results
        const latencyMs = endTime - startTime;
        const latencySec = (latencyMs / 1000).toFixed(2);

        console.log(`\n⏱️  AI Latency Result: ${latencySec} seconds`);

        expect(latencyMs).to.be.below(15000, 'AI response took longer than 15 seconds');
    });
});