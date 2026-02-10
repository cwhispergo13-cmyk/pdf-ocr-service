import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const VISION_API_URL = 'https://vision.googleapis.com/v1/files:annotate'

// 파일명에서 확장자 추출 및 _OCR 추가
function generateOCRFileName(originalFileName: string): string {
  const lastDotIndex = originalFileName.lastIndexOf('.')

  if (lastDotIndex === -1) {
    return `${originalFileName}_OCR.pdf`
  }

  const nameWithoutExt = originalFileName.substring(0, lastDotIndex)
  return `${nameWithoutExt}_OCR.pdf`
}

// Vision API 응답 타입
interface VisionVertex {
  x?: number
  y?: number
}

interface VisionBoundingBox {
  vertices?: VisionVertex[]
  normalizedVertices?: VisionVertex[]
}

interface VisionSymbol {
  text?: string
  boundingBox?: VisionBoundingBox
}

interface VisionWord {
  symbols?: VisionSymbol[]
  boundingBox?: VisionBoundingBox
}

interface VisionParagraph {
  words?: VisionWord[]
  boundingBox?: VisionBoundingBox
}

interface VisionBlock {
  paragraphs?: VisionParagraph[]
  boundingBox?: VisionBoundingBox
}

interface VisionPage {
  width?: number
  height?: number
  blocks?: VisionBlock[]
}

interface VisionFullTextAnnotation {
  pages?: VisionPage[]
  text?: string
}

interface VisionPageResponse {
  fullTextAnnotation?: VisionFullTextAnnotation
}

// Google Vision API로 PDF OCR 수행 (페이지별 텍스트 + 위치 정보 반환)
async function performOCR(
  pdfBuffer: Buffer,
  apiKey: string,
  totalPages: number
): Promise<VisionPageResponse[]> {
  const base64Content = pdfBuffer.toString('base64')
  const allPageResponses: VisionPageResponse[] = []
  const batchSize = 5

  for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, totalPages)
    const pages = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i
    )

    const requestBody = {
      requests: [
        {
          inputConfig: {
            content: base64Content,
            mimeType: 'application/pdf',
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
            },
          ],
          pages: pages,
        },
      ],
    }

    const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.error?.message || `Vision API 오류: ${response.status}`
      )
    }

    const data = await response.json()
    const fileResponses: VisionPageResponse[] =
      data.responses?.[0]?.responses || []
    allPageResponses.push(...fileResponses)
  }

  return allPageResponses
}

// 투명 텍스트 레이어를 PDF에 오버레이하여 Searchable PDF 생성
async function createSearchablePDF(
  pdfBuffer: Buffer,
  ocrResults: VisionPageResponse[]
): Promise<{ pdfBytes: Uint8Array; extractedText: string }> {
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let fullExtractedText = ''

  for (let i = 0; i < pages.length && i < ocrResults.length; i++) {
    const page = pages[i]
    const ocrResult = ocrResults[i]

    if (!ocrResult?.fullTextAnnotation?.pages?.[0]) continue

    const visionPage = ocrResult.fullTextAnnotation.pages[0]
    const visionWidth = visionPage.width || 1
    const visionHeight = visionPage.height || 1

    const pdfWidth = page.getWidth()
    const pdfHeight = page.getHeight()

    // 스케일 팩터 계산 (Vision API 좌표 → PDF 좌표)
    const scaleX = pdfWidth / visionWidth
    const scaleY = pdfHeight / visionHeight

    const pageText = ocrResult.fullTextAnnotation.text || ''
    if (pageText) {
      fullExtractedText += pageText + '\n\n'
    }

    // 블록 → 문단 → 단어 순서로 순회하며 투명 텍스트 배치
    const blocks = visionPage.blocks || []
    for (const block of blocks) {
      const paragraphs = block.paragraphs || []
      for (const paragraph of paragraphs) {
        const words = paragraph.words || []
        for (const word of words) {
          const vertices = word.boundingBox?.vertices
          if (!vertices || vertices.length < 4) continue

          // 단어 텍스트 조합
          const wordText = (word.symbols || [])
            .map((s) => s.text || '')
            .join('')

          if (!wordText.trim()) continue

          // Vision API 좌표 (왼쪽 상단 원점, y 아래로 증가)
          const vx = vertices[0].x || 0
          const vy = vertices[0].y || 0
          const vx2 = vertices[2].x || 0
          const vy2 = vertices[2].y || 0

          // 단어의 높이로 폰트 크기 추정
          const wordHeight = Math.abs(vy2 - vy)
          const wordWidth = Math.abs(vx2 - vx)
          const fontSize = Math.max(wordHeight * scaleY * 0.85, 1)

          // PDF 좌표로 변환 (PDF는 왼쪽 하단 원점, y 위로 증가)
          const pdfX = vx * scaleX
          const pdfY = pdfHeight - vy2 * scaleY

          // 실제 텍스트 폭 계산 및 스케일 조정
          const textWidth = font.widthOfTextAtSize(wordText, fontSize)
          const targetWidth = wordWidth * scaleX
          const horizontalScale = textWidth > 0 ? targetWidth / textWidth : 1

          try {
            page.drawText(wordText, {
              x: pdfX,
              y: pdfY,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
              opacity: 0, // 투명 텍스트 (보이지 않지만 선택 가능)
              wordBreaks: [],
              maxWidth: targetWidth > 0 ? targetWidth / horizontalScale : undefined,
            })
          } catch {
            // 특수문자 등으로 인한 오류 무시 (해당 단어 건너뜀)
            continue
          }
        }
      }
    }
  }

  // 메타데이터 업데이트
  pdfDoc.setProducer('PDF OCR Service - Google Vision API')
  pdfDoc.setCreationDate(new Date())

  const pdfBytes = await pdfDoc.save()
  return { pdfBytes, extractedText: fullExtractedText }
}

export async function POST(request: NextRequest) {
  try {
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

    // File 객체를 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // PDF 페이지 수 확인
    const tempDoc = await PDFDocument.load(pdfBuffer)
    const totalPages = tempDoc.getPageCount()

    // Google Vision API로 OCR 수행 (텍스트 + 위치 정보)
    const ocrResults = await performOCR(pdfBuffer, apiKey, totalPages)

    if (!ocrResults || ocrResults.length === 0) {
      return NextResponse.json(
        {
          error:
            'PDF에서 텍스트를 인식할 수 없습니다. 스캔된 문서인지 확인해주세요.',
        },
        { status: 400 }
      )
    }

    // Searchable PDF 생성 (투명 텍스트 레이어 오버레이)
    const { pdfBytes, extractedText } = await createSearchablePDF(
      pdfBuffer,
      ocrResults
    )

    const processedPdfBase64 = Buffer.from(pdfBytes).toString('base64')
    const newFileName = generateOCRFileName(originalFileName)

    return NextResponse.json({
      success: true,
      newFileName,
      processedPdfBase64,
      extractedText: extractedText.substring(0, 1000),
    })
  } catch (error) {
    console.error('OCR 처리 오류:', error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { error: 'OCR 처리 중 알 수 없는 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
