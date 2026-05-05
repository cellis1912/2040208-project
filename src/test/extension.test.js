const { Workbench, WebView, By, EditorView } = require('vscode-extension-tester');
const { expect } = require('chai');

describe('AI Latency: Task Architect', function() {
    let view;

    before(async function() {
        this.timeout(60000);
        const workbench = new Workbench();
        await workbench.executeCommand('Open Accessible Extension');
        
        view = new WebView();
        await workbench.getDriver().wait(async () => {
            try {
                return await view.getTitle() === 'Accessibly Dashboard';
            } catch (e) {
                return false;
            }
        }, 15000);

        await view.switchToFrame();
    });

    after(async () => {
        await view.switchBack();
        await new EditorView().closeAllEditors();
    });

    it('should measure latency from Generate click to Task rendering', async function() {
        this.timeout(30000);

        const textarea = await view.findChildElement(By.id('taskInput'));
        const buildBtn = await view.findChildElement(By.id('buildBtn'));
        const output = await view.findChildElement(By.id('output'));

        await textarea.sendKeys('Build a React login page');

        const startTime = performance.now();
        await buildBtn.click();

        await view.getDriver().wait(async () => {
            const tasks = await output.findElements(By.className('task-row'));
            return tasks.length > 0;
        }, 20000); 

        const endTime = performance.now();
        const latencyMs = endTime - startTime;
        const latencySec = (latencyMs / 1000).toFixed(2);

        console.log(`\n AI Latency Result: ${latencySec} seconds`);

        expect(latencyMs).to.be.below(15000, 'AI response took longer than 15 seconds');
    });
});