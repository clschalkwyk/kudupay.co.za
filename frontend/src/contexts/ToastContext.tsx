import React, { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Toast, ToastType } from '../components/Toast'
import { ToastContainer } from '../components/Toast'

interface ToastContextType {
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => void
  removeToast: (id: string) => void
  showSuccess: (title: string, message?: string, duration?: number) => void
  showError: (title: string, message?: string, duration?: number) => void
  showWarning: (title: string, message?: string, duration?: number) => void
  showInfo: (title: string, message?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const generateId = useCallback(() => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }, [])

  const addToast = useCallback((
    type: ToastType, 
    title: string, 
    message?: string, 
    duration?: number
  ) => {
    const id = generateId()
    const newToast: Toast = {
      id,
      type,
      title,
      message,
      duration: duration || 5000
    }

    setToasts(prevToasts => [...prevToasts, newToast])
  }, [generateId])

  const removeToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id))
  }, [])

  // Convenience methods for different toast types
  const showSuccess = useCallback((title: string, message?: string, duration?: number) => {
    addToast('success', title, message, duration)
  }, [addToast])

  const showError = useCallback((title: string, message?: string, duration?: number) => {
    addToast('error', title, message, duration)
  }, [addToast])

  const showWarning = useCallback((title: string, message?: string, duration?: number) => {
    addToast('warning', title, message, duration)
  }, [addToast])

  const showInfo = useCallback((title: string, message?: string, duration?: number) => {
    addToast('info', title, message, duration)
  }, [addToast])

  const contextValue: ToastContextType = {
    addToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export default ToastContext