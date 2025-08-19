import React, { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastComponentProps {
  toast: Toast
  onRemove: (id: string) => void
}

const ToastComponent: React.FC<ToastComponentProps> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, toast.duration || 5000)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-green-100 border-green-500',
          icon: '✅',
          iconBg: 'bg-green-500',
          textColor: 'text-green-800'
        }
      case 'error':
        return {
          container: 'bg-red-100 border-red-500',
          icon: '❌',
          iconBg: 'bg-red-500',
          textColor: 'text-red-800'
        }
      case 'warning':
        return {
          container: 'bg-yellow-100 border-yellow-500',
          icon: '⚠️',
          iconBg: 'bg-yellow-500',
          textColor: 'text-yellow-800'
        }
      case 'info':
        return {
          container: 'bg-blue-100 border-blue-500',
          icon: 'ℹ️',
          iconBg: 'bg-blue-500',
          textColor: 'text-blue-800'
        }
      default:
        return {
          container: 'bg-gray-100 border-gray-500',
          icon: 'ℹ️',
          iconBg: 'bg-gray-500',
          textColor: 'text-gray-800'
        }
    }
  }

  const styles = getToastStyles(toast.type)

  return (
    <div className={`
      ${styles.container} 
      border-l-4 
      rounded-r-lg 
      shadow-lg 
      p-4 
      mb-3 
      transform 
      transition-all 
      duration-300 
      ease-in-out
      animate-slide-in-right
      max-w-md
      min-w-80
    `}>
      <div className="flex items-start gap-3">
        <div className={`
          w-8 h-8 
          ${styles.iconBg} 
          rounded-full 
          flex 
          items-center 
          justify-center 
          flex-shrink-0
        `}>
          <span className="text-white text-sm">{styles.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold ${styles.textColor} text-sm mb-1`}>
            {toast.title}
          </h4>
          {toast.message && (
            <p className="text-charcoal-light text-sm leading-relaxed">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="text-charcoal-light hover:text-charcoal transition-colors flex-shrink-0 ml-2"
          aria-label="Close notification"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

export default ToastComponent