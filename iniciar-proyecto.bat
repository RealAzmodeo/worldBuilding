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

if not exist "%~dp0world-building" (
    color 0c
    echo [ERROR] La carpeta "%~dp0world-building" no existe.
    echo Asegurate de que este archivo .bat este al lado de la carpeta "world-building".
    goto fin
)

cd /d "%~dp0world-building"

echo.
echo ========================================================
echo  ¡Listo! El servidor web de desarrollo se iniciara ahora.
echo  Abre tu navegador en: http://localhost:3002
echo ========================================================
echo.

:: Ejecutamos npm y evitamos que cierre la ventana si falla
call npm run dev

:fin
echo.
echo ========================================================
echo El script ha finalizado. Presiona una tecla para salir.
echo ========================================================
pause >nul