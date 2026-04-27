const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

function run() {
    // Create the mocha instance
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 10000 // Extensions can take a moment to load
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise(async (c, e) => {
        try {
            // Find all files ending in .test.js
            const files = await glob('**/**.test.js', { cwd: testsRoot });

            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                console.error(err);
                e(err);
            }
        } catch (err) {
            e(err);
        }
    });
}

module.exports = {
    run
};