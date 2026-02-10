'use client'

import { useState } from 'react'
import FileUploader from './components/FileUploader'
import FileList from './components/FileList'
import { FileStatus } from './types'

export default function Home() {
  const [files, setFiles] = useState<FileStatus[]>([])

  const handleFilesSelected = (selectedFiles: File[]) => {
    const newFiles: FileStatus[] = selectedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      originalFile: file,
      originalName: file.name,
      newName: '',
      status: 'pending',
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }

  const processFile = async (fileStatus: FileStatus) => {
    try {
      // 상태를 processing으로 변경
      updateFileStatus(fileStatus.id, { status: 'processing', progress: 10 })

      // FormData로 파일 전송 (Base64 대신 multipart 방식)
      const formData = new FormData()
      formData.append('file', fileStatus.originalFile)
      formData.append('originalFileName', fileStatus.originalName)

      updateFileStatus(fileStatus.id, { progress: 30 })

      // OCR API 호출
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      })

      updateFileStatus(fileStatus.id, { progress: 70 })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'OCR 처리 실패')
      }

      const result = await response.json()
      
      // OCR이 완료된 PDF를 Blob으로 변환
      const pdfBlob = base64ToBlob(result.processedPdfBase64, 'application/pdf')
      
      updateFileStatus(fileStatus.id, {
        status: 'completed',
        progress: 100,
        newName: result.newFileName,
        processedBlob: pdfBlob,
        extractedText: result.extractedText,
      })
    } catch (error) {
      console.error('파일 처리 오류:', error)
      updateFileStatus(fileStatus.id, {
        status: 'error',
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }

  const updateFileStatus = (id: string, updates: Partial<FileStatus>) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...updates } : file))
    )
  }

  const handleDownload = (fileStatus: FileStatus) => {
    if (!fileStatus.processedBlob || !fileStatus.newName) return

    const url = URL.createObjectURL(fileStatus.processedBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileStatus.newName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const handleDownloadAll = () => {
    files
      .filter((file) => file.status === 'completed' && file.processedBlob)
      .forEach((file) => {
        setTimeout(() => handleDownload(file), 100)
      })
  }

  const handleStartOCR = () => {
    const pendingFiles = files.filter((file) => file.status === 'pending')
    pendingFiles.forEach((fileStatus) => processFile(fileStatus))
  }

  const handleRemoveAllPending = () => {
    setFiles((prev) => prev.filter((file) => file.status !== 'pending'))
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            PDF OCR Service
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Google Vision API를 활용하여 PDF 문서를 OCR 처리하고,
            <br />
            자동으로 <span className="font-semibold text-primary-600">"원본파일명_OCR.pdf"</span> 형식으로 변경합니다
          </p>
        </div>

        {/* File Uploader */}
        <div className="mb-8">
          <FileUploader currentFileCount={files.length} onFilesSelected={handleFilesSelected} />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                처리 현황 ({files.filter(f => f.status === 'completed').length}/{files.length})
              </h2>
              <div className="flex gap-3">
                {files.some((f) => f.status === 'pending') && (
                  <>
                    <button
                      onClick={handleRemoveAllPending}
                      className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium shadow-md hover:shadow-lg"
                    >
                      대기 파일 전체 제거
                    </button>
                    <button
                      onClick={handleStartOCR}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-md hover:shadow-lg"
                    >
                      OCR 시작 ({files.filter(f => f.status === 'pending').length}개)
                    </button>
                  </>
                )}
                {files.some((f) => f.status === 'completed') && (
                  <button
                    onClick={handleDownloadAll}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium shadow-md hover:shadow-lg"
                  >
                    전체 다운로드
                  </button>
                )}
              </div>
            </div>
            <FileList
              files={files}
              onDownload={handleDownload}
              onRemove={handleRemove}
            />
          </div>
        )}

        {/* Info Section */}
        {files.length === 0 && (
          <div className="mt-12 bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">사용 방법</h3>
            <ol className="list-decimal list-inside space-y-3 text-gray-600">
              <li>위의 업로드 영역에 PDF 파일을 드래그하거나 클릭하여 선택하세요</li>
              <li>최대 20개, 개당 100MB 이하의 파일을 업로드할 수 있습니다</li>
              <li>업로드된 파일 목록을 확인하고 원하지 않는 파일은 제거할 수 있습니다</li>
              <li>"OCR 시작" 버튼을 눌러 처리를 시작하면, 진행 상황을 실시간으로 확인할 수 있습니다</li>
              <li>처리가 완료되면 개별 다운로드 또는 전체 다운로드가 가능합니다</li>
              <li>모든 파일은 <span className="font-semibold">"원본파일명_OCR.pdf"</span> 형식으로 저장됩니다</li>
            </ol>
          </div>
        )}
      </div>
    </main>
  )
}

// Helper functions
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}
