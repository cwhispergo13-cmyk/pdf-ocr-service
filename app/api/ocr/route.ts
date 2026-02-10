import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'

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

// Google Vision API로 PDF OCR 수행 (REST API 직접 호출)
async function performOCR(pdfBuffer: Buffer, apiKey: string): Promise<string> {
  const base64Content = pdfBuffer.toString('base64')
  
  // PDF 페이지 수 확인
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const totalPages = pdfDoc.getPageCount()
  
  // Google Vision API는 동기 요청 시 최대 5페이지까지 처리 가능
  // 5페이지 이하면 한 번에, 초과하면 5페이지씩 나눠서 처리
  const allTexts: string[] = []
  const batchSize = 5
  
  for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, totalPages)
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
    
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
    
    // 각 페이지의 텍스트 추출
    const fileResponses = data.responses?.[0]?.responses || []
    for (const pageResponse of fileResponses) {
      const pageText = pageResponse.fullTextAnnotation?.text || ''
      if (pageText) {
        allTexts.push(pageText)
      }
    }
  }

  return allTexts.join('\n\n--- 페이지 구분 ---\n\n')
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

    // Google Vision API로 PDF OCR 수행
    const extractedText = await performOCR(pdfBuffer, apiKey)

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지가 아닌 PDF이거나 빈 문서일 수 있습니다.' },
        { status: 400 }
      )
    }

    // PDF 문서 로드 (메타데이터 업데이트)
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    pdfDoc.setTitle(`${originalFileName} - OCR Processed`)
    pdfDoc.setProducer('PDF OCR Service - Google Vision API')
    pdfDoc.setCreationDate(new Date())
    
    const processedPdfBytes = await pdfDoc.save()
    const processedPdfBase64 = Buffer.from(processedPdfBytes).toString('base64')

    // 새 파일명 생성 (원본파일명_OCR.pdf)
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
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: 'OCR 처리 중 알 수 없는 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
