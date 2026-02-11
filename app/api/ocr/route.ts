import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 파일명에서 확장자 추출 및 _OCR 추가
function generateOCRFileName(originalFileName: string): string {
  const lastDotIndex = originalFileName.lastIndexOf('.')

  if (lastDotIndex === -1) {
    return `${originalFileName}_OCR.pdf`
  }

  const nameWithoutExt = originalFileName.substring(0, lastDotIndex)
  return `${nameWithoutExt}_OCR.pdf`
}

// 서버 헬스체크용 GET 엔드포인트 (서버 깨우기 + 상태 확인)
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: Date.now() })
}

export async function POST(request: NextRequest) {
  let inputPath = ''
  let outputPath = ''

  try {
    // Google Vision API 키 확인
    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_VISION_API_KEY가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    // FormData로 파일 수신
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const originalFileName = formData.get('originalFileName') as string | null

    if (!file || !originalFileName) {
      return NextResponse.json(
        { error: 'PDF 파일과 파일명이 필요합니다' },
        { status: 400 }
      )
    }

    // 파일 크기 체크 (무료 플랜 메모리 512MB 대응: 20MB 이하만 허용)
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > 20) {
      return NextResponse.json(
        { error: `파일 크기(${fileSizeMB.toFixed(1)}MB)가 너무 큽니다. 20MB 이하의 파일만 처리할 수 있습니다.` },
        { status: 413 }
      )
    }

    // File → Buffer 변환
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // 임시 파일 경로 생성
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    inputPath = path.join(tmpdir(), `ocr-input-${timestamp}-${random}.pdf`)
    outputPath = path.join(tmpdir(), `ocr-output-${timestamp}-${random}.pdf`)

    // 입력 PDF를 임시 파일로 저장
    await writeFile(inputPath, pdfBuffer)

    // ocrmypdf 실행: 극한 메모리 최적화
    const pluginPath = path.join(process.cwd(), 'ocr_plugin.py')
    const command = [
      'ocrmypdf',
      `--plugin "${pluginPath}"`,  // Google Vision API OCR 엔진
      '--force-ocr',               // 강제 OCR 적용
      '-j 1',                      // ★ 핵심: 1페이지씩 순차 처리 (병렬 금지 → 메모리 대폭 절약)
      '--optimize 0',              // ★ 최적화 단계 건너뛰기 (추가 메모리 사용 방지)
      '--output-type pdf',         // 출력 형식 명시
      '--skip-big 25',             // 25메가픽셀 이상 이미지 건너뜀
      '--jpeg-quality 60',         // JPEG 품질 낮춤 (중간 파일 크기 감소)
      '--fast-web-view 0',         // Fast Web View 비활성화 (메모리 절약)
      `"${inputPath}"`,
      `"${outputPath}"`,
    ].join(' ')

    await execAsync(command, {
      timeout: 600000, // 10분 타임아웃 (순차 처리라 더 오래 걸림)
      maxBuffer: 5 * 1024 * 1024, // 5MB (로그용)
      env: {
        ...process.env,
        GOOGLE_VISION_API_KEY: apiKey,
      },
    })

    // 출력 PDF를 바이너리로 직접 응답 (Base64 인코딩 제거 → 메모리 ~33% 절약)
    const outputBuffer = await readFile(outputPath)
    const newFileName = generateOCRFileName(originalFileName)

    // 바이너리 PDF 스트림으로 응답 (JSON + Base64 대신)
    return new Response(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(newFileName)}`,
        'Content-Length': String(outputBuffer.length),
        'X-OCR-FileName': encodeURIComponent(newFileName),
      },
    })
  } catch (error) {
    console.error('OCR 처리 오류:', error)

    if (error instanceof Error) {
      let errorMessage = error.message

      if (errorMessage.includes('No such file or directory')) {
        errorMessage =
          'OCR 엔진이 설치되지 않았습니다. 서버 관리자에게 문의하세요.'
      } else if (errorMessage.includes('PriorOcrFoundError')) {
        errorMessage = '이 PDF에는 이미 텍스트 레이어가 존재합니다.'
      } else if (errorMessage.includes('timeout')) {
        errorMessage =
          'OCR 처리 시간이 초과되었습니다. 더 작은 파일로 시도해주세요.'
      } else if (errorMessage.includes('GOOGLE_VISION_API_KEY')) {
        errorMessage = 'Google Vision API 키가 설정되지 않았습니다.'
      } else if (errorMessage.includes('MemoryError') || errorMessage.includes('ENOMEM') || errorMessage.includes('Killed')) {
        errorMessage = '서버 메모리가 부족합니다. 더 작은 파일(10페이지 이하)로 시도해주세요.'
      }

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    return NextResponse.json(
      { error: 'OCR 처리 중 알 수 없는 오류가 발생했습니다' },
      { status: 500 }
    )
  } finally {
    // 임시 파일 정리
    try {
      if (inputPath) await unlink(inputPath)
    } catch {
      /* ignore */
    }
    try {
      if (outputPath) await unlink(outputPath)
    } catch {
      /* ignore */
    }
  }
}
