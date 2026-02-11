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

  // 서버 깨우기 - 최대 60초까지 반복 시도 (Render 콜드 스타트 대응)
  const wakeUpServer = async (fileId: string): Promise<boolean> => {
    const MAX_ATTEMPTS = 8        // 최대 8번 시도
    const RETRY_DELAYS = [3000, 5000, 5000, 8000, 8000, 10000, 10000, 10000] // 점점 길게

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        updateFileStatus(fileId, {
          statusMessage: i === 0
            ? '서버 상태 확인 중...'
            : `서버를 깨우는 중... (${i}/${MAX_ATTEMPTS} 시도)`,
          progress: 5 + Math.min(i * 2, 10),
        })

        const response = await fetch('/api/ocr', { method: 'GET' })
        if (response.ok) {
          updateFileStatus(fileId, { statusMessage: '서버 연결 완료!' })
          return true
        }
      } catch {
        // 네트워크 오류 - 서버가 아직 깨어나는 중
      }

      // 마지막 시도가 아니면 대기 후 재시도
      if (i < MAX_ATTEMPTS - 1) {
        const delay = RETRY_DELAYS[i]
        updateFileStatus(fileId, {
          statusMessage: `서버가 잠들어 있습니다. 깨우는 중... (${Math.ceil(delay / 1000)}초 후 재시도)`,
        })
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    return false
  }

  // 안전한 JSON 파싱 (빈 응답이나 HTML 에러 페이지 대응)
  const safeJsonParse = async (response: Response): Promise<{ data: Record<string, unknown> | null; text: string }> => {
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      return { data, text }
    } catch {
      return { data: null, text }
    }
  }

  // 사용자 친화적 에러 메시지 변환
  const getFriendlyErrorMessage = (text: string, status: number): string => {
    if (status === 502 || status === 503 || status === 504) {
      return '서버가 응답하지 않습니다. "다시 시도" 버튼을 눌러주세요.'
    }
    if (status === 413) {
      return '파일 크기가 서버 허용 한도를 초과했습니다. 더 작은 파일로 시도해주세요.'
    }
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      return '서버가 정상적으로 응답하지 않았습니다. "다시 시도" 버튼을 눌러주세요.'
    }
    if (text === '' || text.length === 0) {
      return '서버로부터 빈 응답을 받았습니다. "다시 시도" 버튼을 눌러주세요.'
    }
    return `서버 오류 (${status}): "다시 시도" 버튼을 눌러주세요.`
  }

  const processFile = async (fileStatus: FileStatus) => {
    try {
      // 상태를 processing으로 변경
      updateFileStatus(fileStatus.id, {
        status: 'processing',
        progress: 3,
        statusMessage: '준비 중...',
        error: undefined,
      })

      // 1단계: 서버 깨우기 (최대 60초까지 인내심 있게 재시도)
      const isServerAwake = await wakeUpServer(fileStatus.id)
      if (!isServerAwake) {
        throw new Error('서버가 깨어나지 않습니다. 1~2분 후 "다시 시도" 버튼을 눌러주세요.')
      }

      // 2단계: FormData로 파일 전송
      updateFileStatus(fileStatus.id, {
        progress: 20,
        statusMessage: '파일 업로드 중...',
      })
      const formData = new FormData()
      formData.append('file', fileStatus.originalFile)
      formData.append('originalFileName', fileStatus.originalName)

      // 3단계: OCR API 호출 (최대 2회 시도)
      let response: Response | null = null
      let lastError = ''

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          updateFileStatus(fileStatus.id, {
            progress: attempt === 1 ? 30 : 25,
            statusMessage: attempt === 1 ? 'OCR 처리 요청 중...' : 'OCR 재시도 중...',
          })

          response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData,
          })

          // 502/503/504 에러면 재시도
          if (!response.ok && [502, 503, 504].includes(response.status) && attempt < 2) {
            updateFileStatus(fileStatus.id, {
              statusMessage: '서버 응답 오류, 5초 후 재시도...',
            })
            await new Promise(resolve => setTimeout(resolve, 5000))
            response = null
            continue
          }

          break // 성공하거나 재시도 불가능한 에러면 루프 종료
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError.message : '네트워크 오류'
          if (attempt < 2) {
            updateFileStatus(fileStatus.id, {
              progress: 25,
              statusMessage: '네트워크 오류 발생, 5초 후 재시도...',
            })
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        }
      }

      if (!response) {
        throw new Error(`서버 연결에 실패했습니다: ${lastError}. 인터넷 연결을 확인하고 "다시 시도" 버튼을 눌러주세요.`)
      }

      updateFileStatus(fileStatus.id, {
        progress: 70,
        statusMessage: '응답 처리 중...',
      })

      // 4단계: 안전한 응답 파싱
      const { data, text } = await safeJsonParse(response)

      if (!response.ok) {
        if (data && typeof data === 'object' && 'error' in data) {
          throw new Error(String(data.error))
        }
        throw new Error(getFriendlyErrorMessage(text, response.status))
      }

      if (!data) {
        throw new Error(getFriendlyErrorMessage(text, response.status))
      }

      // 5단계: OCR 완료된 PDF를 Blob으로 변환
      updateFileStatus(fileStatus.id, {
        progress: 90,
        statusMessage: 'PDF 생성 중...',
      })
      const pdfBlob = base64ToBlob(String(data.processedPdfBase64), 'application/pdf')
      
      updateFileStatus(fileStatus.id, {
        status: 'completed',
        progress: 100,
        statusMessage: undefined,
        newName: String(data.newFileName),
        processedBlob: pdfBlob,
        extractedText: String(data.extractedText),
      })
    } catch (error) {
      console.error('파일 처리 오류:', error)
      updateFileStatus(fileStatus.id, {
        status: 'error',
        statusMessage: undefined,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다',
      })
    }
  }

  // 에러 발생한 파일을 다시 시도
  const handleRetry = (fileStatus: FileStatus) => {
    updateFileStatus(fileStatus.id, {
      status: 'pending',
      progress: 0,
      error: undefined,
      statusMessage: undefined,
    })
    // 바로 재처리 시작
    const updatedFile = { ...fileStatus, status: 'pending' as const, progress: 0, error: undefined, statusMessage: undefined }
    processFile(updatedFile)
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
              onRetry={handleRetry}
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
