#!/bin/bash

# Start the Service Manager
cd "$(dirname "$0")"

echo "Starting Service Manager on http://localhost:8080"
node server.js
