/**
 * Toast Hook
 * Simple toast notification system
 */

import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning';
  duration?: number;
}

let toastCount = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++toastCount}`;
    const duration = options.duration ?? 3000;

    const newToast: Toast = {
      id,
      ...options,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    toast,
    dismiss,
    dismissAll,
  };
}

// 创建一个全局 toast 实例 (简化版)
let globalToastFn: ((options: ToastOptions) => string) | null = null;

export function setGlobalToast(toastFn: (options: ToastOptions) => string) {
  globalToastFn = toastFn;
}

export function toast(options: ToastOptions) {
  if (globalToastFn) {
    return globalToastFn(options);
  }
  console.warn('[toast] Global toast not initialized');
  return '';
}
