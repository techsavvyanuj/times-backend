#!/bin/bash

# Times Backend Startup Script
echo "Starting Times Backend Server..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the application
echo "Starting application on port ${PORT:-3000}..."
node index.js
