# Simple Service Manager

A lightweight, beautiful, and secure service management dashboard to start, stop, and monitor local background processes without complex dependencies like PM2.

## Features
- **Lightweight Backend**: Pure Node.js `child_process` execution.
- **Secure**: Basic Auth enabled by default to protect your server.
- **Beautiful UI**: Modern glassmorphism design with a light theme.
- **Logs Viewer**: Stream logs natively from the browser.
- **Dynamic IP Resolution**: Links automatically adapt to the IP you use to access the dashboard.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example configuration:
   ```bash
   cp services.example.json services.json
   ```

3. Edit `services.json` to define your own services (name, cwd, startCommand, url).

4. Run the manager:
   ```bash
   ./start.sh
   ```

5. The system will automatically generate a secure `admin_password.txt`. Access the dashboard at `http://<your-server-ip>:8080` using the username `admin` and the generated password.
