import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminStore } from '@/store/useAdminStore'
import AdminLayout from '@/components/layout/AdminLayout'

// ── Lazy-loaded pages (code splitting) ──────────────────────────
const LoginPage = lazy(() => import('@/pages/login'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const UserListPage = lazy(() => import('@/pages/users/UserList'))
const UserDetailPage = lazy(() => import('@/pages/users/UserDetail'))
const AdminListPage = lazy(() => import('@/pages/admins/AdminList'))
const ChannelListPage = lazy(() => import('@/pages/channels/ChannelList'))
const RechargeRecordsPage = lazy(() => import('@/pages/finance/RechargeRecords'))
const UsageRecordsPage = lazy(() => import('@/pages/finance/UsageRecords'))
const WithdrawalListPage = lazy(() => import('@/pages/finance/WithdrawalList'))
const RevenuePage = lazy(() => import('@/pages/finance/Revenue'))
const ModelListPage = lazy(() => import('@/pages/models/ModelList'))
const VersionListPage = lazy(() => import('@/pages/versions/VersionList'))
const AnnouncementListPage = lazy(() => import('@/pages/content/AnnouncementList'))
const PrivacyPolicyPage = lazy(() => import('@/pages/content/PrivacyPolicy'))
const TermsOfServicePage = lazy(() => import('@/pages/content/TermsOfService'))
const AboutUsPage = lazy(() => import('@/pages/content/AboutUs'))
const SystemConfigPage = lazy(() => import('@/pages/settings/SystemConfig'))
const ContentConfigPage = lazy(() => import('@/pages/settings/ContentConfig'))
const EmailConfigPage = lazy(() => import('@/pages/settings/EmailConfig'))
const PaymentConfigPage = lazy(() => import('@/pages/settings/PaymentConfig'))
const ReferralOverviewPage = lazy(() => import('@/pages/referrals/ReferralOverview'))
const ReferralConfigPage = lazy(() => import('@/pages/referrals/ReferralConfig'))
const CommissionListPage = lazy(() => import('@/pages/referrals/CommissionList'))
const DiscountListPage = lazy(() => import('@/pages/marketing/DiscountList'))
const RedeemCodeListPage = lazy(() => import('@/pages/marketing/RedeemCodeList'))
const PeriodCardListPage = lazy(() => import('@/pages/marketing/PeriodCardList'))
const PeriodCardSubscriptionsPage = lazy(() => import('@/pages/marketing/PeriodCardSubscriptions'))
const SkillListPage = lazy(() => import('@/pages/skills/SkillList'))
const ExternalSkillMarketPage = lazy(() => import('@/pages/skills/ExternalSkillMarket'))
const FraudListPage = lazy(() => import('@/pages/fraud/FraudList'))
const SyncOverviewPage = lazy(() => import('@/pages/sync/SyncOverview'))
const SyncUserDetailPage = lazy(() => import('@/pages/sync/SyncUserDetail'))

// ── Loading fallback ────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-[13px] text-muted-foreground">Loading...</span>
      </div>
    </div>
  )
}

// ── Full-screen loading (for auth check) ────────────────────────
function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    </div>
  )
}

// ── Auth guard ──────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAdminStore()

  if (isLoading) {
    return <FullScreenLoader />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAdminStore()

  if (isLoading) {
    return <FullScreenLoader />
  }

  if (!admin || admin.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// ── 404 page ────────────────────────────────────────────────────
function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-muted-foreground/30 mb-4">404</h1>
        <p className="text-lg text-muted-foreground mb-6">Page not found</p>
        <Button asChild>
          <a href="/dashboard">Back to Dashboard</a>
        </Button>
      </div>
    </div>
  )
}

// ── App root ────────────────────────────────────────────────────
export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />

                    <Route path="/users" element={<UserListPage />} />
                    <Route path="/users/:id" element={<UserDetailPage />} />
                    <Route
                      path="/admins"
                      element={(
                        <SuperAdminRoute>
                          <AdminListPage />
                        </SuperAdminRoute>
                      )}
                    />

                    <Route path="/finance" element={<RechargeRecordsPage />} />
                    <Route path="/finance/transactions" element={<UsageRecordsPage />} />
                    <Route path="/finance/withdrawals" element={<WithdrawalListPage />} />
                    <Route path="/finance/revenue" element={<RevenuePage />} />

                    <Route path="/channels" element={<ChannelListPage />} />

                    <Route path="/models" element={<ModelListPage />} />

                    <Route path="/skills" element={<SkillListPage />} />
                    <Route path="/skills/external" element={<ExternalSkillMarketPage />} />

                    <Route path="/fraud" element={<FraudListPage />} />

                    <Route path="/sync" element={<SyncOverviewPage />} />
                    <Route path="/sync/users/:userId" element={<SyncUserDetailPage />} />

                    <Route path="/versions" element={<VersionListPage />} />

                    <Route path="/content/announcements" element={<AnnouncementListPage />} />
                    <Route path="/content/privacy-policy" element={<PrivacyPolicyPage />} />
                    <Route path="/content/terms-of-service" element={<TermsOfServicePage />} />
                    <Route path="/content/about-us" element={<AboutUsPage />} />

                    <Route path="/referrals" element={<ReferralOverviewPage />} />
                    <Route path="/referrals/config" element={<ReferralConfigPage />} />
                    <Route path="/referrals/commissions" element={<CommissionListPage />} />

                    <Route path="/marketing/discounts" element={<DiscountListPage />} />
                    <Route path="/marketing/redeem-codes" element={<RedeemCodeListPage />} />
                    <Route path="/marketing/period-cards" element={<PeriodCardListPage />} />
                    <Route path="/marketing/period-cards/subscriptions" element={<PeriodCardSubscriptionsPage />} />

                    <Route path="/settings" element={<Navigate to="/settings/system" replace />} />
                    <Route path="/settings/system" element={<SystemConfigPage />} />
                    <Route path="/settings/content" element={<ContentConfigPage />} />
                    <Route path="/settings/email" element={<EmailConfigPage />} />
                    <Route path="/settings/payment" element={<PaymentConfigPage />} />

                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  )
}
