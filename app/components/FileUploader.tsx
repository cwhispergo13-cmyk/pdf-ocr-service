'use client'

import { useCallback, useState } from 'react'

const MAX_FILES = 20
const MAX_FILE_SIZE_MB = 10  // 서버 안정성 (10MB·5페이지 이하 권장)
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

interface FileUploaderProps {
  currentFileCount: number
  onFilesSelected: (files: File[]) => void
}

export default function FileUploader({ currentFileCount, onFilesSelected }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const validateFiles = useCallback((files: File[]): File[] => {
    const errors: string[] = []
    const remainingSlots = MAX_FILES - currentFileCount

    if (remainingSlots <= 0) {
      setErrorMessage(`파일은 최대 ${MAX_FILES}개까지만 추가할 수 있습니다. 기존 파일을 제거한 후 다시 시도하세요.`)
      return []
    }

    // 갯수 제한 초과 체크
    if (files.length > remainingSlots) {
      errors.push(`추가 가능한 파일 수를 초과했습니다. (현재 ${currentFileCount}개 / 최대 ${MAX_FILES}개, 추가 가능 ${remainingSlots}개)`)
      files = files.slice(0, remainingSlots)
    }

    // 크기 제한 초과 체크
    const oversizedFiles = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES)
    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map((f) => f.name).join(', ')
      errors.push(`${MAX_FILE_SIZE_MB}MB를 초과하는 파일은 제외됩니다: ${names}`)
    }

    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES)

    if (errors.length > 0) {
      setErrorMessage(errors.join('\n'))
    } else {
      setErrorMessage(null)
    }

    return validFiles
  }, [currentFileCount])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const pdfFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === 'application/pdf'
      )

      if (pdfFiles.length === 0) {
        setErrorMessage('PDF 파일만 업로드할 수 있습니다.')
        return
      }

      const validFiles = validateFiles(pdfFiles)
      if (validFiles.length > 0) {
        onFilesSelected(validFiles)
      }
    },
    [onFilesSelected, validateFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        const pdfFiles = Array.from(files).filter(
          (file) => file.type === 'application/pdf'
        )

        if (pdfFiles.length === 0) {
          setErrorMessage('PDF 파일만 업로드할 수 있습니다.')
        } else {
          const validFiles = validateFiles(pdfFiles)
          if (validFiles.length > 0) {
            onFilesSelected(validFiles)
          }
        }
      }
      // Reset input value to allow selecting the same file again
      e.target.value = ''
    },
    [onFilesSelected, validateFiles]
  )

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer
        transition-all duration-300 ease-in-out
        ${
          isDragging
            ? 'border-primary-500 bg-primary-50 scale-105'
            : 'border-gray-300 bg-white hover:border-primary-400 hover:bg-gray-50'
        }
        shadow-lg hover:shadow-xl
      `}
    >
      <input
        type="file"
        multiple
        accept="application/pdf"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      
      <div className="pointer-events-none">
        <svg
          className={`mx-auto h-16 w-16 mb-4 transition-colors ${
            isDragging ? 'text-primary-500' : 'text-gray-400'
          }`}
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        
        <p className="text-xl font-semibold text-gray-700 mb-2">
          {isDragging ? 'PDF 파일을 놓으세요' : 'PDF 파일을 드래그하거나 클릭하세요'}
        </p>
        
        <p className="text-sm text-gray-500">
          최대 {MAX_FILES}개 / 개당 {MAX_FILE_SIZE_MB}MB 이하
        </p>
        
        <div className="mt-6 inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium shadow-md hover:bg-primary-700 transition-colors">
          파일 선택
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-start">
            <p className="whitespace-pre-wrap">{errorMessage}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setErrorMessage(null)
              }}
              className="ml-3 text-red-500 hover:text-red-700 font-bold flex-shrink-0"
            >
              X
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
