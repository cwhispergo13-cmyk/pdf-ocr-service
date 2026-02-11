FROM node:20-slim

# Install Python, Tesseract OCR, Ghostscript (메모리 최적화: unpaper, pngquant 제거)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    ghostscript \
    && pip3 install --break-system-packages ocrmypdf requests \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Node.js 메모리 제한: 256MB (나머지 256MB를 Python/Ghostscript에 할당)
ENV NODE_OPTIONS="--max-old-space-size=256"

WORKDIR /app

# Copy plugin first (rarely changes)
COPY ocr_plugin.py ./

# Install Node.js dependencies (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
