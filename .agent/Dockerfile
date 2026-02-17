FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends git curl \
 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY agent.py .

# Expose port
EXPOSE 4381

CMD ["python", "agent.py"]
