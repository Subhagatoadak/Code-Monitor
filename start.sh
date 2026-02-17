#!/bin/bash

# Code Monitor - Easy Startup Script

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════╗"
echo "║          Code Monitor - Startup Script           ║"
echo "╔═══════════════════════════════════════════════════╗"
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo -e "${YELLOW}⚠️  Please edit .env and add your OPENAI_API_KEY${NC}"
        echo ""
    else
        echo -e "${RED}❌ .env.example not found!${NC}"
        exit 1
    fi
fi

# Show menu
echo "Select deployment mode:"
echo ""
echo "  1) Development (Hot Reload) - Frontend & Backend separate containers"
echo "  2) Production (Optimized) - All-in-one container"
echo "  3) Legacy (agent-compose.yml) - Original setup"
echo "  4) Stop all containers"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo -e "${BLUE}🚀 Starting Development Mode...${NC}"
        echo -e "${GREEN}Frontend: http://localhost:5173${NC}"
        echo -e "${GREEN}Backend API: http://localhost:4381${NC}"
        echo -e "${GREEN}Swagger Docs: http://localhost:4381/docs${NC}"
        echo ""
        docker compose up --build
        ;;
    2)
        echo -e "${BLUE}🚀 Starting Production Mode...${NC}"
        echo -e "${GREEN}Dashboard: http://localhost:4381${NC}"
        echo -e "${GREEN}Swagger Docs: http://localhost:4381/docs${NC}"
        echo ""
        docker compose -f docker-compose.prod.yml up --build
        ;;
    3)
        echo -e "${BLUE}🚀 Starting Legacy Mode...${NC}"
        echo -e "${GREEN}Dashboard: http://localhost:4381${NC}"
        echo ""
        docker compose -f agent-compose.yml up --build
        ;;
    4)
        echo -e "${YELLOW}🛑 Stopping all containers...${NC}"
        docker compose down 2>/dev/null || true
        docker compose -f docker-compose.prod.yml down 2>/dev/null || true
        docker compose -f agent-compose.yml down 2>/dev/null || true
        echo -e "${GREEN}✓ All containers stopped${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac
