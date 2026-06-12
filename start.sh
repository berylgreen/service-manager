#!/bin/bash

cd "$(dirname "$0")"

if [ "$1" = "stop" ]; then
    echo "Stopping Service Manager..."
    pkill -f "node server.js"
    exit 0
fi

if [ "$1" = "restart" ]; then
    echo "Stopping old Service Manager..."
    pkill -f "node server.js"
    sleep 1
fi

echo "Starting Service Manager on http://localhost:8080 in background..."
export PORT=8080
nohup node server.js > service-manager.log 2>&1 &
echo "Service Manager started! Log is in service-manager.log"

sleep 1
if [ -f admin_password.txt ]; then
    echo ""
    echo "==================================================="
    echo "  访问地址: http://67.215.236.189:8080/"
    echo "  登录账号: admin"
    echo "  登录密码: $(cat admin_password.txt)"
    echo "==================================================="
fi
