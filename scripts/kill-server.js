const { exec } = require('child_process');
const isWindows = process.platform === 'win32';

const killServer = () => {
    const command = isWindows
        ? `FOR /F "tokens=5" %P IN ('netstat -ano | findstr :8080') DO taskkill /F /PID %P`
        : `lsof -ti:8080 | xargs kill -9`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            // Ignore errors as they likely mean no server was running
            console.log('No previous server instance found');
            process.exit(0);
        }
        console.log('Previous server instance killed');
        process.exit(0);
    });
};

killServer(); 