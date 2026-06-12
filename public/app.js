const grid = document.getElementById('services-grid');
const modal = document.getElementById('logs-modal');
const modalTitle = document.getElementById('modal-title');
const logsContainer = document.getElementById('logs-container');
const btnCloseModal = document.getElementById('btn-close-modal');

let servicesData = [];

// Fetch and render services
async function fetchServices() {
    try {
        const response = await fetch('/api/services');
        const services = await response.json();
        
        // Only re-render if data changed to prevent flickering
        if (JSON.stringify(services) !== JSON.stringify(servicesData)) {
            servicesData = services;
            renderServices(services);
        }
    } catch (err) {
        console.error('Failed to fetch services:', err);
    }
}

// Start a service
async function startService(id) {
    try {
        const res = await fetch(`/api/services/${id}/start`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            console.error('Start failed:', data.error);
        }
        fetchServices();
    } catch (err) {
        console.error(err);
    }
}

// Stop a service
async function stopService(id) {
    try {
        const res = await fetch(`/api/services/${id}/stop`, { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            console.error('Stop failed:', data.error);
        }
        fetchServices();
    } catch (err) {
        console.error(err);
    }
}

// View Logs
async function viewLogs(id, name) {
    modalTitle.textContent = `Logs: ${name}`;
    logsContainer.textContent = 'Loading...';
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/services/${id}/logs`);
        const data = await res.json();
        logsContainer.textContent = data.logs || 'No logs available.';
        // scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;
    } catch (err) {
        logsContainer.textContent = 'Error fetching logs.';
    }
}

// Close Modal
btnCloseModal.addEventListener('click', () => {
    modal.classList.remove('active');
});

// Render the grid securely using DOM API
function renderServices(services) {
    grid.replaceChildren();

    services.forEach(service => {
        const isRunning = service.status === 'running';

        const card = document.createElement('div');
        card.className = 'card';

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = service.name;

        const badge = document.createElement('div');
        badge.className = `status-badge ${service.status}`;
        
        const indicator = document.createElement('div');
        indicator.className = 'status-indicator';
        
        const statusText = document.createTextNode(service.status);
        
        badge.appendChild(indicator);
        badge.appendChild(statusText);
        
        header.appendChild(title);
        header.appendChild(badge);

        // Body
        const body = document.createElement('div');
        body.className = 'card-body';
        
        const urlLink = document.createElement('a');
        urlLink.className = 'service-url';
        
        // Dynamically replace localhost with the current IP
        let displayUrl = service.url;
        try {
            const urlObj = new URL(service.url);
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                urlObj.hostname = window.location.hostname;
                displayUrl = urlObj.toString();
            }
        } catch (e) {
            // ignore if not a valid URL
        }
        
        urlLink.href = displayUrl;
        urlLink.target = '_blank';
        urlLink.rel = 'noopener noreferrer';
        urlLink.textContent = displayUrl;
        
        body.appendChild(urlLink);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const startBtn = document.createElement('button');
        startBtn.className = 'btn btn-primary';
        startBtn.textContent = 'Start';
        startBtn.disabled = isRunning;
        startBtn.addEventListener('click', () => startService(service.id));

        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn btn-danger';
        stopBtn.textContent = 'Stop';
        stopBtn.disabled = !isRunning;
        stopBtn.addEventListener('click', () => stopService(service.id));

        const logsBtn = document.createElement('button');
        logsBtn.className = 'btn';
        logsBtn.textContent = 'Logs';
        logsBtn.addEventListener('click', () => viewLogs(service.id, service.name));

        actions.appendChild(startBtn);
        actions.appendChild(stopBtn);
        actions.appendChild(logsBtn);

        // Assemble
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(actions);

        grid.appendChild(card);
    });
}

// Initial fetch and polling every 3 seconds
fetchServices();
setInterval(fetchServices, 3000);
