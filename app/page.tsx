'use client'

import { useState, useRef, useCallback } from 'react'
import FileUploader from './components/FileUploader'
import FileList from './components/FileList'
import { FileStatus } from './types'

export default function Home() {
  const [files, setFiles] = useState<FileStatus[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const processingRef = useRef(false) // 순차 처리 제어용

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
    const MAX_ATTEMPTS = 8
    const RETRY_DELAYS = [3000, 5000, 5000, 8000, 8000, 10000, 10000, 10000]

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

  // 에러 응답에서 메시지 추출
  const extractErrorMessage = async (response: Response): Promise<string> => {
    const status = response.status

    if (status === 502 || status === 503 || status === 504) {
      return 'OCR 처리 중 서버가 중단되었을 수 있습니다. 1~2분 기다린 뒤 "다시 시도" 해 주세요.'
    }
    if (status === 413) {
      return '파일 크기가 서버 허용 한도를 초과했습니다. 더 작은 파일로 시도해주세요.'
    }

    try {
      const text = await response.text()
      // JSON 에러 응답인지 확인
      try {
        const data = JSON.parse(text)
        if (data && data.error) return String(data.error)
      } catch {
        // JSON이 아닌 경우
      }
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        return '서버가 정상적으로 응답하지 않았습니다. "다시 시도" 버튼을 눌러주세요.'
      }
      if (!text || text.length === 0) {
        return '서버로부터 빈 응답을 받았습니다. "다시 시도" 버튼을 눌러주세요.'
      }
    } catch {
      // 읽기 실패
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

      // 1단계: 서버 깨우기
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

      // 3단계: OCR API 호출 (최대 3회 시도, 502/503/504 시 대기 후 재시도)
      let response: Response | null = null
      let lastError = ''

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          updateFileStatus(fileStatus.id, {
            progress: attempt === 1 ? 30 : 20 + attempt * 5,
            statusMessage: attempt === 1 ? 'OCR 처리 중... (1~2분 걸릴 수 있습니다)' : `${attempt}차 재시도 중...`,
          })

          response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData,
          })

          // 502/503/504 에러면 10초 대기 후 재시도 (서버 재시작 대기)
          if (!response.ok && [502, 503, 504].includes(response.status) && attempt < 3) {
            updateFileStatus(fileStatus.id, {
              statusMessage: '서버 응답 없음, 10초 후 재시도...',
            })
            await new Promise(resolve => setTimeout(resolve, 10000))
            response = null
            continue
          }

          break
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError.message : '네트워크 오류'
          if (attempt < 3) {
            updateFileStatus(fileStatus.id, {
              progress: 25,
              statusMessage: '연결 실패, 10초 후 재시도...',
            })
            await new Promise(resolve => setTimeout(resolve, 10000))
          }
        }
      }

      if (!response) {
        throw new Error(`서버 연결에 실패했습니다: ${lastError}. "다시 시도" 버튼을 눌러주세요.`)
      }

      // 4단계: 응답 처리
      updateFileStatus(fileStatus.id, {
        progress: 70,
        statusMessage: '응답 처리 중...',
      })

      if (!response.ok) {
        const errorMsg = await extractErrorMessage(response)
        throw new Error(errorMsg)
      }

      // 성공 응답: 바이너리 PDF를 직접 Blob으로 받기 (Base64 변환 없음 → 메모리 절약)
      updateFileStatus(fileStatus.id, {
        progress: 85,
        statusMessage: 'PDF 다운로드 중...',
      })

      const pdfBlob = await response.blob()
      const newFileName = decodeURIComponent(
        response.headers.get('X-OCR-FileName') || `${fileStatus.originalName.replace('.pdf', '')}_OCR.pdf`
      )

      updateFileStatus(fileStatus.id, {
        status: 'completed',
        progress: 100,
        statusMessage: undefined,
        newName: newFileName,
        processedBlob: pdfBlob,
        extractedText: 'OCR 처리가 완료되었습니다. 다운로드된 PDF에서 텍스트를 드래그하여 확인하세요.',
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

  // 파일들을 순차적으로 1개씩 처리 (서버 메모리 보호)
  const processFilesSequentially = useCallback(async (filesToProcess: FileStatus[]) => {
    if (processingRef.current) return // 이미 처리 중이면 중복 실행 방지
    processingRef.current = true
    setIsProcessing(true)

    for (const fileStatus of filesToProcess) {
      await processFile(fileStatus)
    }

    processingRef.current = false
    setIsProcessing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 에러 발생한 파일을 다시 시도
  const handleRetry = (fileStatus: FileStatus) => {
    updateFileStatus(fileStatus.id, {
      status: 'pending',
      progress: 0,
      error: undefined,
      statusMessage: undefined,
    })
    const updatedFile = { ...fileStatus, status: 'pending' as const, progress: 0, error: undefined, statusMessage: undefined }
    processFilesSequentially([updatedFile])
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
    processFilesSequentially(pendingFiles)
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
            자동으로 <span className="font-semibold text-primary-600">&quot;원본파일명_OCR.pdf&quot;</span> 형식으로 변경합니다
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
                      disabled={isProcessing}
                      className={`px-6 py-2 text-white rounded-lg transition-colors font-medium shadow-md hover:shadow-lg ${
                        isProcessing
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isProcessing
                        ? 'OCR 처리 중...'
                        : `OCR 시작 (${files.filter(f => f.status === 'pending').length}개)`
                      }
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

            {/* 순차 처리 안내 */}
            {isProcessing && (
              <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  서버 메모리 보호를 위해 파일을 <span className="font-semibold">1개씩 순차적으로</span> 처리합니다.
                </p>
              </div>
            )}

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
              <li>최대 20개, 개당 20MB 이하의 파일을 업로드할 수 있습니다</li>
              <li>업로드된 파일 목록을 확인하고 원하지 않는 파일은 제거할 수 있습니다</li>
              <li>&quot;OCR 시작&quot; 버튼을 눌러 처리를 시작하면, 진행 상황을 실시간으로 확인할 수 있습니다</li>
              <li>서버 보호를 위해 파일은 1개씩 순차적으로 처리됩니다</li>
              <li>처리가 완료되면 개별 다운로드 또는 전체 다운로드가 가능합니다</li>
              <li>모든 파일은 <span className="font-semibold">&quot;원본파일명_OCR.pdf&quot;</span> 형식으로 저장됩니다</li>
            </ol>
          </div>
        )}
      </div>
    </main>
  )
}
