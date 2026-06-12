const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

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

// In-memory store for running processes and their logs
const processes = new Map();
const logs = new Map();

// Helper to read configuration
function getServices() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading services.json:', err);
        return [];
    }
}

// API: Get all services
app.get('/api/services', (req, res) => {
    const services = getServices();
    const result = services.map(service => {
        return {
            id: service.id,
            name: service.name,
            url: service.url,
            status: processes.has(service.id) ? 'running' : 'stopped'
        };
    });
    res.json(result);
});

// API: Start a service
app.post('/api/services/:id/start', (req, res) => {
    const id = req.params.id;
    const services = getServices();
    const service = services.find(s => s.id === id);

    if (!service) {
        return res.status(404).json({ error: 'Service not found' });
    }

    if (processes.has(id)) {
        return res.status(400).json({ error: 'Service is already running' });
    }

    // Split command securely
    const parts = service.startCommand.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    // Initialize logs
    logs.set(id, []);

    try {
        const child = spawn(cmd, args, { cwd: service.cwd, shell: true });

        // Capture stdout
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            const currentLogs = logs.get(id);
            currentLogs.push(...lines);
            // keep only last 1000 lines to prevent memory leak
            if (currentLogs.length > 1000) currentLogs.splice(0, currentLogs.length - 1000);
        });

        // Capture stderr
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            const currentLogs = logs.get(id);
            currentLogs.push(...lines.map(l => `[ERROR] ${l}`));
            if (currentLogs.length > 1000) currentLogs.splice(0, currentLogs.length - 1000);
        });

        child.on('close', (code) => {
            console.log(`Service ${id} exited with code ${code}`);
            processes.delete(id);
            const currentLogs = logs.get(id);
            if (currentLogs) currentLogs.push(`--- Service exited with code ${code} ---`);
        });

        child.on('error', (err) => {
            console.error(`Failed to start service ${id}:`, err);
            processes.delete(id);
            const currentLogs = logs.get(id);
            if (currentLogs) currentLogs.push(`--- Failed to start: ${err.message} ---`);
        });

        processes.set(id, child);
        res.json({ message: 'Service started successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to spawn process' });
    }
});

// API: Stop a service
app.post('/api/services/:id/stop', (req, res) => {
    const id = req.params.id;
    
    if (!processes.has(id)) {
        return res.status(400).json({ error: 'Service is not running' });
    }

    const child = processes.get(id);
    child.kill('SIGTERM');
    
    res.json({ message: 'Stop signal sent' });
});

// API: Get logs
app.get('/api/services/:id/logs', (req, res) => {
    const id = req.params.id;
    const serviceLogs = logs.get(id) || [];
    res.json({ logs: serviceLogs.join('\n') });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Service Manager running at http://0.0.0.0:${PORT}`);
});
