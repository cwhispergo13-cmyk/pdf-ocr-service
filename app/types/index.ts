export interface FileStatus {
  id: string
  originalFile: File
  originalName: string
  newName: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
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
