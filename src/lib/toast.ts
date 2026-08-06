import { create } from 'zustand'

interface ToastState {
  message: string | null
  kind: 'info' | 'error'
  show: (message: string, kind?: 'info' | 'error') => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: null,
  kind: 'info',
  show: (message, kind = 'info') => {
    set({ message, kind })
    clearTimeout(timer)
    timer = setTimeout(() => set({ message: null }), 3200)
  },
}))

export const toast = (message: string, kind: 'info' | 'error' = 'info') =>
  useToast.getState().show(message, kind)
