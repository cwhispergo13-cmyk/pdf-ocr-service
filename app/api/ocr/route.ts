import { NextRequest, NextResponse } from 'next/server'
import vision from '@google-cloud/vision'
import { PDFDocument } from 'pdf-lib'

// Google Vision API 클라이언트 초기화
const getVisionClient = () => {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  
  if (!apiKey) {
    throw new Error('GOOGLE_VISION_API_KEY가 설정되지 않았습니다')
  }

  return new vision.ImageAnnotatorClient({
    apiKey: apiKey,
  })
}

// 파일명에서 확장자 추출 및 _OCR 추가
function generateOCRFileName(originalFileName: string): string {
  // 파일명과 확장자 분리
  const lastDotIndex = originalFileName.lastIndexOf('.')
  
  if (lastDotIndex === -1) {
    // 확장자가 없는 경우
    return `${originalFileName}_OCR.pdf`
  }
  
  const nameWithoutExt = originalFileName.substring(0, lastDotIndex)
  const extension = originalFileName.substring(lastDotIndex).toLowerCase()
  
  // .pdf 확장자인지 확인
  if (extension === '.pdf') {
    return `${nameWithoutExt}_OCR.pdf`
  } else {
    // .pdf가 아닌 경우에도 .pdf로 저장
    return `${nameWithoutExt}_OCR.pdf`
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pdfBase64, originalFileName } = body

    if (!pdfBase64 || !originalFileName) {
      return NextResponse.json(
        { error: 'PDF 데이터와 파일명이 필요합니다' },
        { status: 400 }
      )
    }

    // Vision API 클라이언트 생성
    const client = getVisionClient()

    // PDF를 이미지로 변환하고 OCR 수행
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    
    // Google Vision API로 PDF OCR 수행
    const [result] = await client.documentTextDetection({
      image: {
        content: pdfBuffer,
      },
    })

    const fullTextAnnotation = result.fullTextAnnotation
    const extractedText = fullTextAnnotation?.text || ''

    if (!extractedText) {
      return NextResponse.json(
        { error: 'PDF에서 텍스트를 추출할 수 없습니다' },
        { status: 400 }
      )
    }

    // PDF 문서 로드 (메타데이터 유지를 위해)
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    
    // PDF 저장 (원본 유지, 메타데이터만 업데이트)
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
      extractedText: extractedText.substring(0, 1000), // 첫 1000자만 반환
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
