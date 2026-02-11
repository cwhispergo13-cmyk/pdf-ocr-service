FROM node:20-slim

# Google Vision 플러그인만 사용 → Tesseract 제거로 apt 설치 시간 대폭 단축
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ghostscript \
    && pip3 install --break-system-packages --no-cache-dir ocrmypdf requests \
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
