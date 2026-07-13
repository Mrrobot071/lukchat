@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 ou mais recente nao foi encontrado.
  echo Instale o Node.js e execute este arquivo novamente.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if not exist .env (
  echo Criando configuracao inicial...
  call npm run setup
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" "http://127.0.0.1:3000"
call npm start
