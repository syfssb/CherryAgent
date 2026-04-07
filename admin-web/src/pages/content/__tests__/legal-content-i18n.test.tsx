/**
 * 法律内容页面多语言功能集成测试
 *
 * 测试范围：
 * - 中英文内容的编辑和保存
 * - Markdown 预览功能
 * - 数据持久化
 * - API 调用
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PrivacyPolicyPage from '../PrivacyPolicy'
import TermsOfServicePage from '../TermsOfService'
import AboutUsPage from '../AboutUs'
import { legalContentsService } from '@/services/legal-contents'

// Mock 服务
vi.mock('@/services/legal-contents', () => ({
  legalContentsService: {
    getLegalContent: vi.fn(),
    updateLegalContent: vi.fn(),
  },
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('法律内容页面多语言功能测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('隐私政策页面', () => {
    const mockData = {
      data: {
        legalContent: {
          id: '1',
          type: 'privacy_policy',
          content: '# Privacy Policy\n\nThis is our privacy policy.',
          i18n: {
            zh: {
              content: '# 隐私政策\n\n这是我们的隐私政策。',
            },
            ja: {
              content: '# プライバシーポリシー\n\nこれは私たちのプライバシーポリシーです。',
            },
          },
          version: '1.0.0',
          isActive: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          updatedBy: null,
        },
      },
    }

    it('应该正确加载和显示多语言内容', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 验证版本信息
      expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument()

      // 验证英文内容（默认显示）
      const englishTab = screen.getByRole('tab', { name: /English/i })
      expect(englishTab).toHaveAttribute('data-state', 'active')
    })

    it('应该支持切换语言标签', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 切换到中文标签
      const chineseTab = screen.getByRole('tab', { name: /中文/i })
      await user.click(chineseTab)

      await waitFor(() => {
        expect(chineseTab).toHaveAttribute('data-state', 'active')
      })

      // 切换到日文标签
      const japaneseTab = screen.getByRole('tab', { name: /日本語/i })
      await user.click(japaneseTab)

      await waitFor(() => {
        expect(japaneseTab).toHaveAttribute('data-state', 'active')
      })
    })

    it('应该支持编辑和保存多语言内容', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)
      vi.mocked(legalContentsService.updateLegalContent).mockResolvedValue({
        data: { legalContent: mockData.data.legalContent },
      })

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 编辑英文内容
      const textarea = screen.getByPlaceholderText(/请输入内容/)
      await user.clear(textarea)
      await user.type(textarea, '# Updated Privacy Policy\n\nNew content.')

      // 保存
      const saveButton = screen.getByRole('button', { name: /保存更新/i })
      await user.click(saveButton)

      await waitFor(() => {
        expect(legalContentsService.updateLegalContent).toHaveBeenCalledWith(
          'privacy_policy',
          expect.objectContaining({
            content: expect.stringContaining('Updated Privacy Policy'),
          })
        )
      })
    })

    it('应该支持 Markdown 预览功能', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 切换到预览模式
      const previewButton = screen.getByRole('button', { name: /预览/i })
      await user.click(previewButton)

      await waitFor(() => {
        expect(previewButton).toHaveClass('bg-background')
      })
    })

    it('应该验证必填字段', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 清空英文内容
      const textarea = screen.getByPlaceholderText(/请输入内容/)
      await user.clear(textarea)

      // 尝试保存
      const saveButton = screen.getByRole('button', { name: /保存更新/i })
      await user.click(saveButton)

      // 应该显示错误提示
      await waitFor(() => {
        expect(legalContentsService.updateLegalContent).not.toHaveBeenCalled()
      })
    })
  })

  describe('服务条款页面', () => {
    it('应该正确加载服务条款内容', async () => {
      const mockData = {
        data: {
          legalContent: {
            id: '2',
            type: 'terms_of_service',
            content: '# Terms of Service',
            i18n: { zh: { content: '# 服务条款' } },
            version: '1.0.0',
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: null,
          },
        },
      }

      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      render(<TermsOfServicePage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('服务条款')).toBeInTheDocument()
      })

      expect(legalContentsService.getLegalContent).toHaveBeenCalledWith('terms_of_service')
    })
  })

  describe('关于我们页面', () => {
    it('应该正确加载关于我们内容', async () => {
      const mockData = {
        data: {
          legalContent: {
            id: '3',
            type: 'about_us',
            content: '# About Us',
            i18n: { zh: { content: '# 关于我们' } },
            version: '1.0.0',
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: null,
          },
        },
      }

      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)

      render(<AboutUsPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('关于我们')).toBeInTheDocument()
      })

      expect(legalContentsService.getLegalContent).toHaveBeenCalledWith('about_us')
    })
  })

  describe('I18nEditor 组件功能', () => {
    it('应该正确提取和构建 i18n 数据', async () => {
      const mockData = {
        data: {
          legalContent: {
            id: '1',
            type: 'privacy_policy',
            content: 'English content',
            i18n: {
              zh: { content: '中文内容' },
              ja: { content: '日本語コンテンツ' },
              'zh-TW': { content: '繁體中文內容' },
            },
            version: '1.0.0',
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: null,
          },
        },
      }

      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)
      vi.mocked(legalContentsService.updateLegalContent).mockResolvedValue({
        data: { legalContent: mockData.data.legalContent },
      })

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      // 验证所有语言标签都存在
      expect(screen.getByRole('tab', { name: /English/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /中文/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /日本語/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /繁體中文/i })).toBeInTheDocument()

      // 编辑并保存
      const saveButton = screen.getByRole('button', { name: /保存更新/i })
      await user.click(saveButton)

      await waitFor(() => {
        expect(legalContentsService.updateLegalContent).toHaveBeenCalledWith(
          'privacy_policy',
          expect.objectContaining({
            content: 'English content',
            i18n: expect.objectContaining({
              zh: expect.objectContaining({ content: '中文内容' }),
              ja: expect.objectContaining({ content: '日本語コンテンツ' }),
              'zh-TW': expect.objectContaining({ content: '繁體中文內容' }),
            }),
          })
        )
      })
    })
  })

  describe('错误处理', () => {
    it('应该处理加载失败的情况', async () => {
      vi.mocked(legalContentsService.getLegalContent).mockRejectedValue(
        new Error('Network error')
      )

      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/加载失败/i)).toBeInTheDocument()
      })
    })

    it('应该处理保存失败的情况', async () => {
      const mockData = {
        data: {
          legalContent: {
            id: '1',
            type: 'privacy_policy',
            content: 'Content',
            i18n: {},
            version: '1.0.0',
            isActive: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            updatedBy: null,
          },
        },
      }

      vi.mocked(legalContentsService.getLegalContent).mockResolvedValue(mockData)
      vi.mocked(legalContentsService.updateLegalContent).mockRejectedValue(
        new Error('Save failed')
      )

      const user = userEvent.setup()
      render(<PrivacyPolicyPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('隐私政策')).toBeInTheDocument()
      })

      const saveButton = screen.getByRole('button', { name: /保存更新/i })
      await user.click(saveButton)

      await waitFor(() => {
        expect(legalContentsService.updateLegalContent).toHaveBeenCalled()
      })
    })
  })
})
