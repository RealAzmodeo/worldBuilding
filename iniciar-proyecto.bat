@echo off
title Visual Worldbuilder - Cargador
color 0b

echo ========================================================
echo        INICIANDO VISUAL WORLDBUILDER CON IA LOCAL
echo ========================================================
echo.

:: 1. Comprobar si Ollama ya está ejecutándose
echo [1/2] Comprobando servicio de Ollama...
tasklist /FI "IMAGENAME eq ollama app.exe" 2>NUL | find /I "ollama app.exe" >NUL
if "%ERRORLEVEL%"=="1" (
    echo [OLLAMA] No activo. Iniciando aplicacion de Ollama...
    start "" "%LOCALAPPDATA%\Ollama\ollama app.exe"
    :: Esperar 4 segundos a que responda el servicio
    timeout /t 4 /nobreak >nul
) else (
    echo [OLLAMA] Servicio activo en segundo plano.
)

echo.

:: 2. Cambiar al directorio del proyecto e iniciar Vite
echo [2/2] Accediendo a los archivos de la app...
cd /d "%~dp0world-building"

echo.
echo ========================================================
echo  ¡Listo! El servidor web de desarrollo se iniciara ahora.
echo  Abre tu navegador en: http://localhost:3002
echo ========================================================
echo.
npm run dev
