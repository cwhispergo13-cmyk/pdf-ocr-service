'use client'

import { FileStatus } from '../types'

interface FileListProps {
  files: FileStatus[]
  onDownload: (file: FileStatus) => void
  onRemove: (id: string) => void
  onRetry: (file: FileStatus) => void
}

export default function FileList({ files, onDownload, onRemove, onRetry }: FileListProps) {
  return (
    <div className="space-y-4">
      {files.map((file) => (
        <FileItem
          key={file.id}
          file={file}
          onDownload={onDownload}
          onRemove={onRemove}
          onRetry={onRetry}
        />
      ))}
    </div>
  )
}

interface FileItemProps {
  file: FileStatus
  onDownload: (file: FileStatus) => void
  onRemove: (id: string) => void
  onRetry: (file: FileStatus) => void
}

function FileItem({ file, onDownload, onRemove, onRetry }: FileItemProps) {
  const getStatusIcon = () => {
    switch (file.status) {
      case 'pending':
        return (
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'processing':
        return (
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        )
      case 'completed':
        return (
          <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
    }
  }

  const getStatusText = () => {
    switch (file.status) {
      case 'pending':
        return 'OCR 대기 중 (제거 가능)'
      case 'processing':
        return file.statusMessage || 'OCR 처리 중...'
      case 'completed':
        return '완료'
      case 'error':
        return '오류'
    }
  }

  const getStatusColor = () => {
    switch (file.status) {
      case 'pending':
        return 'text-gray-600'
      case 'processing':
        return 'text-primary-600'
      case 'completed':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="mt-1">{getStatusIcon()}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{file.originalName}</p>
            {file.newName && (
              <p className="text-sm text-primary-600 font-medium mt-1">
                → {file.newName}
              </p>
            )}
            <p className={`text-sm font-medium mt-1 ${getStatusColor()}`}>
              {getStatusText()}
            </p>
            {file.error && (
              <div className="mt-1">
                <p className="text-sm text-red-600">오류: {file.error}</p>
                <button
                  onClick={() => onRetry(file)}
                  className="mt-2 px-4 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
                >
                  다시 시도
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          {file.status === 'completed' && (
            <button
              onClick={() => onDownload(file)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
              title="다운로드"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
          {file.status === 'pending' ? (
            <button
              onClick={() => onRemove(file.id)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-sm hover:shadow-md"
              title="목록에서 제거"
            >
              제거
            </button>
          ) : (
            <button
              onClick={() => onRemove(file.id)}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              title="제거"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {file.status === 'processing' && (
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${file.progress}%` }}
          />
        </div>
      )}

      {/* Extracted Text Preview */}
      {file.extractedText && file.status === 'completed' && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-primary-600">
            추출된 텍스트 미리보기
          </summary>
          <div className="mt-2 p-3 bg-white rounded border border-gray-200 max-h-40 overflow-y-auto">
            <p className="text-xs text-gray-600 whitespace-pre-wrap">
              {file.extractedText.substring(0, 500)}
              {file.extractedText.length > 500 && '...'}
            </p>
          </div>
        </details>
      )}
    </div>
  )
}
