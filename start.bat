@echo off
setlocal

echo ╔═══════════════════════════════════════════════════╗
echo ║          Code Monitor - Startup Script           ║
echo ╔═══════════════════════════════════════════════════╗
echo.

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found. Creating from .env.example...
    if exist .env.example (
        copy .env.example .env
        echo [SUCCESS] Created .env file
        echo [WARNING] Please edit .env and add your OPENAI_API_KEY
        echo.
    ) else (
        echo [ERROR] .env.example not found!
        exit /b 1
    )
)

echo Select deployment mode:
echo.
echo   1^) Development (Hot Reload) - Frontend ^& Backend separate containers
echo   2^) Production (Optimized) - All-in-one container
echo   3^) Legacy (agent-compose.yml) - Original setup
echo   4^) Stop all containers
echo.

set /p choice="Enter choice [1-4]: "

if "%choice%"=="1" (
    echo.
    echo [INFO] Starting Development Mode...
    echo [SUCCESS] Frontend: http://localhost:5173
    echo [SUCCESS] Backend API: http://localhost:4381
    echo [SUCCESS] Swagger Docs: http://localhost:4381/docs
    echo.
    docker compose up --build
) else if "%choice%"=="2" (
    echo.
    echo [INFO] Starting Production Mode...
    echo [SUCCESS] Dashboard: http://localhost:4381
    echo [SUCCESS] Swagger Docs: http://localhost:4381/docs
    echo.
    docker compose -f docker-compose.prod.yml up --build
) else if "%choice%"=="3" (
    echo.
    echo [INFO] Starting Legacy Mode...
    echo [SUCCESS] Dashboard: http://localhost:4381
    echo.
    docker compose -f agent-compose.yml up --build
) else if "%choice%"=="4" (
    echo.
    echo [INFO] Stopping all containers...
    docker compose down 2>nul
    docker compose -f docker-compose.prod.yml down 2>nul
    docker compose -f agent-compose.yml down 2>nul
    echo [SUCCESS] All containers stopped
) else (
    echo [ERROR] Invalid choice
    exit /b 1
)

endlocal
