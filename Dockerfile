FROM node:20-slim

# Install Python, Tesseract OCR, ocrmypdf, and language packs
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    tesseract-ocr-jpn \
    tesseract-ocr-chi-sim \
    ghostscript \
    unpaper \
    pngquant \
    && pip3 install --break-system-packages ocrmypdf \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
