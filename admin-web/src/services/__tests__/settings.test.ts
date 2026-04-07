import { describe, it, expect, vi, beforeEach } from 'vitest'
import { systemConfigService, emailConfigService, paymentConfigService } from '@/services/settings'
import type { SystemConfig, EmailConfig, PaymentChannel } from '@/types/settings'

// Mock fetch
global.fetch = vi.fn()

describe('Settings Services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('SystemConfig Service', () => {
    it('should get system config', async () => {
      const mockConfig: SystemConfig = {
        siteName: 'Test Site',
        siteDescription: 'Test Description',
        siteUrl: 'https://test.com',
        maintenanceMode: false,
        maintenanceMessage: '',
        registrationEnabled: true,
        emailVerificationRequired: false,
        defaultBalance: 10,
        minRechargeAmount: 1,
        maxRechargeAmount: 10000,
        inviteBonus: 5,
        inviteRewardRate: 0.1,
        rateLimitPerMinute: 60,
        maxRequestsPerDay: 1000,
        sessionTimeout: 3600,
        enableInviteSystem: true,
        enableReferralSystem: false,
        supportEmail: 'support@test.com',
        updatedAt: new Date().toISOString(),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockConfig }),
      })

      const response = await systemConfigService.getConfig()
      expect(response.success).toBe(true)
      expect(response.data?.siteName).toBe('Test Site')
    })

    it('should update system config', async () => {
      const updateData = { siteName: 'Updated Site' }
      const mockResponse: SystemConfig = {
        siteName: 'Updated Site',
        siteDescription: 'Test',
        siteUrl: 'https://test.com',
        maintenanceMode: false,
        maintenanceMessage: '',
        registrationEnabled: true,
        emailVerificationRequired: false,
        defaultBalance: 10,
        minRechargeAmount: 1,
        maxRechargeAmount: 10000,
        inviteBonus: 5,
        inviteRewardRate: 0.1,
        rateLimitPerMinute: 60,
        maxRequestsPerDay: 1000,
        sessionTimeout: 3600,
        enableInviteSystem: true,
        enableReferralSystem: false,
        supportEmail: 'support@test.com',
        updatedAt: new Date().toISOString(),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockResponse }),
      })

      const response = await systemConfigService.updateConfig(updateData)
      expect(response.success).toBe(true)
      expect(response.data?.siteName).toBe('Updated Site')
    })
  })

  describe('EmailConfig Service', () => {
    it('should get email config', async () => {
      const mockConfig: EmailConfig = {
        enabled: true,
        provider: 'smtp',
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'user@test.com',
        smtpPassword: 'password',
        fromEmail: 'noreply@test.com',
        fromName: 'Test Site',
        updatedAt: new Date().toISOString(),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockConfig }),
      })

      const response = await emailConfigService.getConfig()
      expect(response.success).toBe(true)
      expect(response.data?.smtpHost).toBe('smtp.test.com')
    })

    it('should test email config', async () => {
      const mockResult = {
        success: true,
        message: 'Test passed',
        timestamp: new Date().toISOString(),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockResult }),
      })

      const response = await emailConfigService.testConfig('test@example.com')
      expect(response.success).toBe(true)
      expect(response.data?.success).toBe(true)
    })
  })

  describe('PaymentConfig Service', () => {
    it('should get payment channels', async () => {
      const mockChannels: PaymentChannel[] = [
        {
          id: '1',
          name: 'Alipay Official',
          provider: 'alipay',
          enabled: true,
          isDefault: true,
          priority: 1,
          config: {},
          supportedMethods: ['qrcode'],
          minAmount: 1,
          maxAmount: 10000,
          feeRate: 0.01,
          fixedFee: 0,
          totalTransactions: 100,
          totalAmount: 50000,
          successRate: 0.99,
          avgProcessTime: 2,
          testMode: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockChannels }),
      })

      const response = await paymentConfigService.getChannels()
      expect(response.success).toBe(true)
      expect(response.data?.length).toBe(1)
      expect(response.data?.[0].provider).toBe('alipay')
    })

    it('should toggle payment channel', async () => {
      const mockChannel: PaymentChannel = {
        id: '1',
        name: 'Alipay',
        provider: 'alipay',
        enabled: false,
        isDefault: false,
        priority: 1,
        config: {},
        supportedMethods: ['qrcode'],
        minAmount: 1,
        maxAmount: 10000,
        feeRate: 0.01,
        fixedFee: 0,
        totalTransactions: 100,
        totalAmount: 50000,
        successRate: 0.99,
        avgProcessTime: 2,
        testMode: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockChannel }),
      })

      const response = await paymentConfigService.toggleChannel('1', false)
      expect(response.success).toBe(true)
      expect(response.data?.enabled).toBe(false)
    })
  })
})
