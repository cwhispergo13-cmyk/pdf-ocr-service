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

# standalone 모드: static 파일과 public 파일을 standalone 디렉토리로 복사
RUN cp -r .next/static .next/standalone/.next/static
RUN if [ -d "public" ]; then cp -r public .next/standalone/public; fi

# ocr_plugin.py를 standalone 디렉토리에도 복사
RUN cp ocr_plugin.py .next/standalone/

EXPOSE 3000

# standalone 서버로 실행
CMD ["node", ".next/standalone/server.js"]
