export interface FileStatus {
  id: string
  originalFile: File
  originalName: string
  newName: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  statusMessage?: string  // 현재 진행 단계를 사용자에게 보여주는 메시지
  processedBlob?: Blob
  extractedText?: string
  error?: string
}

export interface OCRRequest {
  pdfBase64: string
  originalFileName: string
}

export interface OCRResponse {
  success: boolean
  newFileName: string
  processedPdfBase64: string
  extractedText: string
  error?: string
}
