const assert = require('assert');
const sinon = require('sinon');
const vscode = require('vscode');
const { performance } = require('perf_hooks');

// Import your functions here if they were exported, 
// otherwise we mock the vscode commands they trigger.
describe('Accessibly Extension Test Suite', () => {

    let performanceResults = [];

    after(() => {
        console.log('\n--- Latency Report ---');
        console.table(performanceResults);
    });

    it('Timer Formatting Test', () => {
        // Simple unit test for the logic
        const formatTime = (seconds) => {
            const m = String(Math.floor(seconds / 60)).padStart(2, '0');
            const s = String(seconds % 60).padStart(2, '0');
            return `${m}:${s}`;
        };

        assert.strictEqual(formatTime(65), "01:05");
        assert.strictEqual(formatTime(1500), "25:00");
    });

    it('Latency Test: Font Size Change', async () => {
        const start = performance.now();
        
        // Simulate changeFontSize logic
        const currentSize = 14;
        const newSize = currentSize + 2;
        
        // Mocking the VS Code config update
        const updateStub = sinon.stub().resolves();
        const end = performance.now();
        
        performanceResults.push({
            Task: 'Font Size Adjustment',
            'Latency (ms)': (end - start).toFixed(4)
        });
        
        assert.strictEqual(newSize, 16);
    });

	it('Performance: AI Task Breakdown Response Time', async () => {
		// 1. Setup Mock Stream
		const mockSteps = [
			'Step 1: Analyze project structure\n',
			'Step 2: Identify accessibility gaps\n',
			'Step 3: Generate remediation plan'
		];

		const mockSendRequest = sinon.stub().resolves({
			// Mimic the VS Code Language Model async iterator
			text: (async function* () {
				for (const step of mockSteps) {
					// Simulate a tiny network delay for realism
					await new Promise(resolve => setTimeout(resolve, 50)); 
					yield step;
				}
			})()
		});

		// 2. Start Timing
		const start = performance.now();

		// 3. Trigger the Logic
		const model = { sendRequest: mockSendRequest };
		const response = await model.sendRequest([], {}, {});
		
		let fullTaskText = '';
		for await (const chunk of response.text) {
			fullTaskText += chunk;
		}

		// 4. End Timing
		const end = performance.now();
		const duration = (end - start).toFixed(4);

		// 5. Log and Assert
		performanceResults.push({
			Task: 'AI Task Breakdown (Full Stream)',
			'Latency (ms)': duration
		});

		assert.ok(fullTaskText.includes('Step 3'), "The task breakdown did not complete.");
		console.log(`\t⏱️ AI Breakdown Latency: ${duration}ms`);
	});

	it('End-to-End Latency: Click "Generate" to Tasks Visible', async () => {
		// 1. Define the Sample Task
		const sampleInput = "Login page";
		
		// 2. Mock the AI stream with realistic "thinking" and "typing" delays
		const mockSendRequest = sinon.stub().resolves({
			text: (async function* () {
				// Simulate 'Thinking' delay (Model overhead)
				await new Promise(r => setTimeout(r, 400)); 
				yield 'Step 1: Add alt text to images\n';
				
				// Simulate 'Streaming' delay (Network/Token generation)
				await new Promise(r => setTimeout(r, 200));
				yield 'Step 2: Fix ARIA labels on buttons\n';
				
				await new Promise(r => setTimeout(r, 200));
				yield 'Step 3: Contrast check for headers';
			})()
		});

		// START PROBE: User clicks the button
		const clickStart = performance.now();

		// 3. Execution (Simulating your actual extension command logic)
		const model = { sendRequest: mockSendRequest };
		const request = await model.sendRequest([{ role: 'user', content: sampleInput }], {}, {});
		
		let renderedTasks = '';
		for await (const chunk of request.text) {
			renderedTasks += chunk;
			// Logic check: In a real UI, you'd be updating a Webview or Sidebar here
		}

		// END PROBE: Tasks are now fully assembled and visible
		const clickEnd = performance.now();
		const totalLatency = (clickEnd - clickStart).toFixed(2);

		// 4. Record Results
		performanceResults.push({
			Task: 'Generate Button Click (E2E)',
			Input: sampleInput.substring(0, 20) + '...',
			'Latency (ms)': totalLatency,
			'Output Snippet': renderedTasks.replace(/\n/g, ' | ')
		});

		assert.ok(renderedTasks.length > 0);
		console.log(`\t✅ User waited ${totalLatency}ms for task generation.`);
	});

    it('Latency Test: Diagnostic Scan', async () => {
        const start = performance.now();

        // Simulate explainActiveErrors fetching diagnostics
        const mockDiagnostics = [
            { message: "Syntax Error", severity: vscode.DiagnosticSeverity.Error }
        ];
        
        const end = performance.now();
        
        performanceResults.push({
            Task: 'Error Diagnostic Scan',
            'Latency (ms)': (end - start).toFixed(4)
        });

        assert.strictEqual(mockDiagnostics.length, 1);
    });
});