FROM node:20-slim

# Install Python, Tesseract OCR (ocrmypdf dependency), Ghostscript, and tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    ghostscript \
    unpaper \
    pngquant \
    && pip3 install --break-system-packages ocrmypdf requests \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy plugin first (rarely changes)
COPY ocr_plugin.py ./

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
