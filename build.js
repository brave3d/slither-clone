const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const path = require('path');

// Obfuscation options for client-side code
const clientObfuscationOptions = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'mangled',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    rotateStringArray: false,
    selfDefending: false,
    shuffleStringArray: false,
    splitStrings: false,
    stringArray: false,
    stringArrayEncoding: [],
    stringArrayThreshold: 0,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
};

// Files to obfuscate (client-side only)
const filesToObfuscate = [
    { src: 'js/game.js', dest: 'dist/js/game.js' },
    { src: 'js/snake.js', dest: 'dist/js/snake.js' },
    { src: 'js/food.js', dest: 'dist/js/food.js' },
    { src: 'js/config.js', dest: 'dist/js/config.js' }
];

// Files to copy without obfuscation
const filesToCopy = [
    { src: 'index.html', dest: 'dist/index.html' },
    { src: 'package.json', dest: 'dist/package.json' },
    { src: 'package-lock.json', dest: 'dist/package-lock.json' },
    { src: 'server.js', dest: 'dist/server.js' }  // Don't obfuscate server code
];

async function build() {
    try {
        // Clean dist directory
        await fs.remove('dist');
        await fs.ensureDir('dist/js');

        // Obfuscate client-side files
        for (const file of filesToObfuscate) {
            const source = await fs.readFile(file.src, 'utf8');
            const obfuscated = JavaScriptObfuscator.obfuscate(
                source, 
                clientObfuscationOptions
            );
            await fs.writeFile(file.dest, obfuscated.getObfuscatedCode());
            console.log(`Obfuscated: ${file.src} -> ${file.dest}`);
        }

        // Copy other files without obfuscation
        for (const file of filesToCopy) {
            await fs.copy(file.src, file.dest);
            console.log(`Copied: ${file.src} -> ${file.dest}`);
        }

        // Update index.html
        let indexHtml = await fs.readFile('dist/index.html', 'utf8');
        
        // Keep script paths relative
        indexHtml = indexHtml.replace(/src="\/js\//g, 'src="js/');
        
        // Add cache busting
        indexHtml = indexHtml.replace(/\.js"/g, '.js?v=' + Date.now() + '"');
        
        await fs.writeFile('dist/index.html', indexHtml);

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build(); 