const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Setup Basic Authentication
const PASSWORD_FILE = path.join(__dirname, 'admin_password.txt');
let adminPassword = '';

if (fs.existsSync(PASSWORD_FILE)) {
    adminPassword = fs.readFileSync(PASSWORD_FILE, 'utf-8').trim();
} else {
    adminPassword = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(PASSWORD_FILE, adminPassword);
    console.log('===================================================');
    console.log(`Generated Admin Password: ${adminPassword}`);
    console.log(`Saved to ${PASSWORD_FILE}`);
    console.log('===================================================');
}

app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [user, pass] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (user === 'admin' && pass === adminPassword) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Service Manager"');
    res.status(401).send('Authentication required.');
});

app.use(express.static(path.join(__dirname, 'public')));

// Path to configuration
const CONFIG_FILE = path.join(__dirname, 'services.json');

// In-memory store for running processes (only used for non-script services)
const processes = new Map();
// Logs store
const logs = new Map();

function getServices() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading services.json:', err);
        return [];
    }
}

// Utility to check if a port is open
function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

function appendLog(id, text) {
    if (!logs.has(id)) logs.set(id, []);
    const currentLogs = logs.get(id);
    currentLogs.push(text);
    if (currentLogs.length > 2000) currentLogs.splice(0, currentLogs.length - 2000);
}

app.get('/api/services', async (req, res) => {
    const services = getServices();
    const result = [];
    
    for (const service of services) {
        let isRunning = false;
        
        try {
            const urlObj = new URL(service.url);
            const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
            isRunning = await checkPort(port);
        } catch (e) {
            // Fallback to process map if URL is invalid
            isRunning = processes.has(service.id);
        }
        
        result.push({
            id: service.id,
            name: service.name,
            url: service.url,
            port: service.port,
            status: isRunning ? 'running' : 'stopped'
        });
    }
    res.json(result);
});

app.put('/api/services/:id/port', (req, res) => {
    const id = req.params.id;
    const { port } = req.body;
    if (!port) return res.status(400).json({ error: 'Port is required' });

    const services = getServices();
    const service = services.find(s => s.id === id);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    service.port = parseInt(port);
    try {
        const urlObj = new URL(service.url);
        urlObj.port = service.port;
        service.url = urlObj.toString().replace(/\/$/, "");
    } catch (e) {
        service.url = `http://localhost:${service.port}`;
    }

    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(services, null, 2));
        res.json({ message: 'Port updated successfully', service });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

app.post('/api/services/:id/start', async (req, res) => {
    const id = req.params.id;
    const services = getServices();
    const service = services.find(s => s.id === id);

    if (!service) return res.status(404).json({ error: 'Service not found' });

    logs.set(id, [`--- Starting ${service.name} ---`]);

    if (service.stopCommand) {
        // Script-based execution
        appendLog(id, `> ${service.startCommand}`);
        const env = { ...process.env };
        if (service.port) env.PORT = service.port;
        const child = exec(service.startCommand, { cwd: service.cwd, env });
        
        child.stdout.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, l)));
        child.stderr.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, `[ERROR] ${l}`)));
        
        child.on('close', code => {
            appendLog(id, `--- Start script exited with code ${code} ---`);
            appendLog(id, `(Background processes may still be running. Checking port...)`);
        });
        
        return res.json({ message: 'Start script executed' });
    } else {
        // Process-based execution
        if (processes.has(id)) return res.status(400).json({ error: 'Service is already running' });
        
        const parts = service.startCommand.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        try {
            const env = { ...process.env };
            if (service.port) env.PORT = service.port;
            const child = spawn(cmd, args, { cwd: service.cwd, shell: true, env });

            child.stdout.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, l)));
            child.stderr.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, `[ERROR] ${l}`)));

            child.on('close', code => {
                processes.delete(id);
                appendLog(id, `--- Service exited with code ${code} ---`);
            });

            processes.set(id, child);
            return res.json({ message: 'Service started successfully' });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to spawn process' });
        }
    }
});

app.post('/api/services/:id/stop', (req, res) => {
    const id = req.params.id;
    const services = getServices();
    const service = services.find(s => s.id === id);

    if (!service) return res.status(404).json({ error: 'Service not found' });

    if (service.stopCommand) {
        appendLog(id, `--- Stopping ${service.name} ---`);
        appendLog(id, `> ${service.stopCommand}`);
        const env = { ...process.env };
        if (service.port) env.PORT = service.port;
        const child = exec(service.stopCommand, { cwd: service.cwd, env });
        
        child.stdout.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, l)));
        child.stderr.on('data', data => data.toString().split('\n').forEach(l => appendLog(id, `[ERROR] ${l}`)));
        
        child.on('close', code => {
            appendLog(id, `--- Stop script exited with code ${code} ---`);
        });
        
        return res.json({ message: 'Stop script executed' });
    } else {
        if (!processes.has(id)) {
            return res.status(400).json({ error: 'Process is not tracked (maybe already stopped?)' });
        }
        const child = processes.get(id);
        child.kill('SIGTERM');
        processes.delete(id);
        return res.json({ message: 'Stop signal sent' });
    }
});

app.get('/api/services/:id/logs', (req, res) => {
    const id = req.params.id;
    const serviceLogs = logs.get(id) || [];
    res.json({ logs: serviceLogs.join('\n') });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Service Manager running at http://0.0.0.0:${PORT}`);
});
