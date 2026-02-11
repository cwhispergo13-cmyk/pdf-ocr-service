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

    // ocrmypdf 실행: Google Vision API 플러그인 사용
    const pluginPath = path.join(process.cwd(), 'ocr_plugin.py')
    const command = [
      'ocrmypdf',
      `--plugin "${pluginPath}"`,  // Google Vision API OCR 엔진
      '--force-ocr',               // 강제 OCR 적용
      '--optimize 1',              // PDF 최적화
      '--clean',                   // 이미지 노이즈 제거
      '--deskew',                  // 기울기 자동 보정
      '--skip-big 100',            // 초대형 이미지 건너뜀
      `"${inputPath}"`,
      `"${outputPath}"`,
    ].join(' ')

    await execAsync(command, {
      timeout: 300000, // 5분 타임아웃
      maxBuffer: 100 * 1024 * 1024, // 100MB (대용량 PDF 처리)
      env: {
        ...process.env,
        GOOGLE_VISION_API_KEY: apiKey,
      },
    })

    // 출력 PDF 읽기
    const outputBuffer = await readFile(outputPath)
    const processedPdfBase64 = outputBuffer.toString('base64')

    // 새 파일명 생성
    const newFileName = generateOCRFileName(originalFileName)

    return NextResponse.json({
      success: true,
      newFileName,
      processedPdfBase64,
      extractedText:
        'OCR 처리가 완료되었습니다. 다운로드된 PDF에서 텍스트를 드래그하여 확인하세요.',
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
