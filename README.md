# PDF OCR Service - Google Vision API

Google Cloud Vision API를 활용하여 PDF 문서를 OCR 처리하고, 자동으로 파일명을 변경하는 웹 서비스입니다.

## 주요 기능

- 📄 PDF 파일 업로드 (드래그 앤 드롭 또는 파일 선택)
- 🔍 Google Vision API를 통한 고품질 OCR 처리
- 📝 자동 파일명 변경: `원본파일명_OCR.pdf`
- 📊 실시간 처리 진행 상황 표시
- 💾 개별 다운로드 및 전체 다운로드 지원
- 🎨 직관적이고 아름다운 UI/UX

## 기술 스택

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **PDF Processing**: pdf-lib
- **OCR Engine**: Google Cloud Vision API
- **Backend**: Next.js API Routes

## 설치 방법

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 Google Vision API 키를 설정합니다:

```env
GOOGLE_VISION_API_KEY=your_api_key_here
```

#### Google Vision API 키 발급 방법

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. "API 및 서비스" > "라이브러리" 메뉴로 이동
4. "Cloud Vision API" 검색 후 활성화
5. "API 및 서비스" > "사용자 인증 정보" 메뉴로 이동
6. "+ 사용자 인증 정보 만들기" > "API 키" 선택
7. 생성된 API 키를 `.env.local` 파일에 복사

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

## 사용 방법

1. 웹 페이지의 업로드 영역에 PDF 파일을 드래그하거나 클릭하여 선택
2. 여러 파일을 동시에 선택 가능
3. OCR 처리가 자동으로 진행되며, 진행 상황을 실시간으로 확인
4. 처리가 완료되면 개별 다운로드 또는 전체 다운로드 가능
5. 모든 파일은 `원본파일명_OCR.pdf` 형식으로 저장됨

## 파일 구조

```
pdf-ocr-service/
├── app/
│   ├── api/
│   │   └── ocr/
│   │       └── route.ts          # OCR API 엔드포인트
│   ├── components/
│   │   ├── FileUploader.tsx      # 파일 업로드 컴포넌트
│   │   └── FileList.tsx          # 파일 목록 및 진행 상황 표시
│   ├── types/
│   │   └── index.ts              # TypeScript 타입 정의
│   ├── globals.css               # 전역 스타일
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 메인 페이지
├── .env.local.example            # 환경변수 예제
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 핵심 로직

### 파일명 변경 규칙

모든 OCR 처리된 파일은 다음 규칙에 따라 파일명이 변경됩니다:

- 입력: `보고서.pdf` → 출력: `보고서_OCR.pdf`
- 입력: `문서.PDF` → 출력: `문서_OCR.pdf`
- 입력: `파일` → 출력: `파일_OCR.pdf`

```typescript
function generateOCRFileName(originalFileName: string): string {
  const lastDotIndex = originalFileName.lastIndexOf('.')
  
  if (lastDotIndex === -1) {
    return `${originalFileName}_OCR.pdf`
  }
  
  const nameWithoutExt = originalFileName.substring(0, lastDotIndex)
  const extension = originalFileName.substring(lastDotIndex).toLowerCase()
  
  if (extension === '.pdf') {
    return `${nameWithoutExt}_OCR.pdf`
  } else {
    return `${nameWithoutExt}_OCR.pdf`
  }
}
```

### OCR 처리 흐름

1. 클라이언트에서 PDF를 Base64로 인코딩
2. API 라우트로 전송
3. Google Vision API로 텍스트 추출
4. pdf-lib로 PDF 메타데이터 업데이트
5. 처리된 PDF를 Base64로 반환
6. 클라이언트에서 Blob으로 변환 후 다운로드 준비

## 빌드 및 배포

### 프로덕션 빌드

```bash
npm run build
```

### 프로덕션 서버 실행

```bash
npm run start
```

## 주의사항

- Google Vision API는 유료 서비스입니다. [가격 정보](https://cloud.google.com/vision/pricing)를 확인하세요
- API 키는 절대 공개 저장소에 커밋하지 마세요
- 대용량 PDF 파일 처리 시 시간이 오래 걸릴 수 있습니다
- Next.js API Routes의 요청 크기 제한(50MB)을 초과하는 파일은 처리할 수 없습니다

## 라이선스

MIT License
