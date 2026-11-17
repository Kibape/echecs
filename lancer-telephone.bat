@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
echo.
echo Sur le telephone (meme Wi-Fi), ouvre l'adresse IPv4 ci-dessous suivie de :5173
ipconfig | findstr /i "IPv4"
echo.
set HOST=0.0.0.0
node server.js
