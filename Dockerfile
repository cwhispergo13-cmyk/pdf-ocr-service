# Render에서 "Timed out" 시: Dashboard → Service → Settings → Build & Deploy
# 에서 Build timeout(또는 Max build duration)을 25분 등으로 늘려 주세요.
# BuildKit 사용 (캐시 마운트로 재빌드 시 apt/pip 단계 대폭 단축)
# syntax=docker/dockerfile:1
FROM node:20-slim

# apt 캐시 마운트 → 두 번째 빌드부터 이 단계가 훨씬 빨라짐
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-kor \
    tesseract-ocr-eng \
    ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# pip 캐시 마운트 → 재빌드 시 패키지 재다운로드 생략
RUN --mount=type=cache,target=/root/.cache/pip \
    pip3 install --break-system-packages ocrmypdf requests

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
