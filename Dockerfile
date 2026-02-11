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

# NODE_OPTIONS는 빌드 시 제거 → Next.js 빌드가 충분한 메모리 사용 가능
# 실행 시에만 메모리 제한 적용 (CMD에서 설정)

WORKDIR /app

# Copy plugin first (rarely changes)
COPY ocr_plugin.py ./

# Install Node.js dependencies (빌드에 devDependencies 필요)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build Next.js (이 단계에서는 메모리 제한 없음)
RUN npm run build

EXPOSE 3000

# 런타임에만 Node 메모리 제한 적용 (OCR 서브프로세스에 메모리 여유)
CMD ["sh", "-c", "NODE_OPTIONS='--max-old-space-size=384' npm run start"]
