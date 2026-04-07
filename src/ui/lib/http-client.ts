/**
 * HTTP 客户端工具
 * 用于在Electron环境中进行HTTP API调用
 */

import { useAuthStore } from '@/ui/store/useAuthStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

interface HttpResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<HttpResponse<T>> {
  try {
    const token = useAuthStore.getState().accessToken;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network request failed',
    };
  }
}

export const httpClient = {
  get: <T = any>(path: string): Promise<HttpResponse<T>> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    return request<T>(url, { method: 'GET' });
  },

  post: <T = any>(path: string, body?: any): Promise<HttpResponse<T>> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    return request<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch: <T = any>(path: string, body?: any): Promise<HttpResponse<T>> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    return request<T>(url, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put: <T = any>(path: string, body?: any): Promise<HttpResponse<T>> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    return request<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete: <T = any>(path: string): Promise<HttpResponse<T>> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    return request<T>(url, { method: 'DELETE' });
  },
};
