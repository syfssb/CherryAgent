import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@/ui/hooks/useRouter';
import { cn } from '@/ui/components/ui';
import { apiClient } from '@/ui/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReferralCode {
  id: string;
  code: string;
  inviteUrl?: string;
  description: string | null;
  usageCount: number;
  maxUsage: number | null;
  isActive: boolean;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  totalCommission: number;
  availableCommission: number;
  pendingCommission: number;
  paidCommission: number;
  withdrawingAmount: number;
  availableForWithdrawal: number;
}

interface Commission {
  id: string;
  referredEmail: string;
  referredName: string | null;
  orderAmount: string;
  commissionRate: string;
  commissionAmount: string;
  level: number;
  status: string;
  createdAt: string;
}

interface Withdrawal {
  id: string;
  amount: string;
  status: string;
  paymentMethod: string | null;
  paymentAccount: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

type TabType = 'overview' | 'commissions' | 'withdraw';

// ─── Shared Styles ───────────────────────────────────────────────────────────

/** Anthropic three-layer micro-shadow */
const CARD_SHADOW = '0 2px 2px rgba(0,0,0,0.012), 0 4px 4px rgba(0,0,0,0.02), 0 16px 24px rgba(0,0,0,0.04)';

/** Reusable card wrapper classes */
const cardBase = 'bg-white dark:bg-[#3d3d3a] rounded-2xl border border-[#1414130a] dark:border-[#faf9f50a]';

// ─── Root Page ───────────────────────────────────────────────────────────────

export function ReferralPage() {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs: { value: TabType; label: string }[] = [
    { value: 'overview', label: '推荐概览' },
    { value: 'commissions', label: '佣金记录' },
    { value: 'withdraw', label: '申请提现' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#faf9f5] dark:bg-[#141413]">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-[#1414130a] dark:border-[#faf9f50a]">
        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-1.5 mr-3 rounded-lg px-2.5 py-1.5 text-[13px] text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5] transition-colors duration-150"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('common.back', '返回')}
        </button>

        <div className="w-px h-5 bg-[#1414131a] dark:bg-[#faf9f51a] mr-1" />

        {/* Tab pills */}
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'px-4 py-1.5 text-[13px] font-medium rounded-full transition-colors duration-150',
              activeTab === tab.value
                ? 'bg-[#ae5630] text-white'
                : 'text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'commissions' && <CommissionsTab />}
        {activeTab === 'withdraw' && <WithdrawTab />}
      </div>
    </div>
  );
}

// ─── Loading Spinner ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-5 h-5 border-2 border-[#ae5630] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  const [code, setCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [codeRes, statsRes] = await Promise.all([
        apiClient.get<ReferralCode>('/referrals/my-code', { requireAuth: true }),
        apiClient.get<ReferralStats>('/referrals/stats', { requireAuth: true }),
      ]);

      if (codeRes.success && codeRes.data) {
        setCode(codeRes.data);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyLink = async () => {
    if (!code?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(code.inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-[#87867f] mb-4 text-[13px]" style={{ fontFamily: 'Georgia, serif' }}>{error}</p>
        <button onClick={loadData} className="text-[#ae5630] hover:text-[#c4633a] text-[13px] font-medium transition-colors">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* ── Invite Code Card ── */}
      {code && (
        <div className={cardBase} style={{ padding: '28px 28px 24px', boxShadow: CARD_SHADOW }}>
          {/* Section label */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-4">
            我的邀请码
          </p>

          {/* Code + copy */}
          <div className="flex items-center gap-3 mb-1">
            <span
              className="text-[24px] font-semibold text-[#141413] dark:text-[#faf9f5] tracking-[0.15em]"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
            >
              {code.code}
            </span>
            <button
              onClick={handleCopy}
              className="px-3 py-1 rounded-full text-[12px] font-medium bg-[#ae563014] text-[#ae5630] hover:bg-[#ae563020] transition-colors duration-150"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>

          {/* Usage count */}
          <p className="text-[12px] text-[#87867f] mb-5">
            已使用 {code.usageCount} 次
            {code.maxUsage !== null && ` / 上限 ${code.maxUsage} 次`}
          </p>

          {/* Invite link */}
          {code.inviteUrl && (
            <div className="pt-5 border-t border-[#1414130a] dark:border-[#faf9f50a]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-2.5">
                邀请链接
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={code.inviteUrl}
                  className="flex-1 text-[13px] text-[#141413] dark:text-[#faf9f5] bg-[#faf9f5] dark:bg-[#2b2a27] rounded-xl border border-[#1414130a] dark:border-[#faf9f50a] px-3.5 py-2.5 truncate outline-none"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                />
                <button
                  onClick={handleCopyLink}
                  className="shrink-0 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-[#ae5630] text-white hover:bg-[#c4633a] transition-colors duration-150"
                >
                  {copiedLink ? '已复制' : '复制链接'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stats Grid ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="推荐人数" value={stats.totalReferrals} suffix="人" />
          <StatCard label="总佣金" value={stats.totalCommission.toFixed(2)} suffix="元" />
          <StatCard label="待审核" value={stats.pendingCommission.toFixed(2)} suffix="元" />
          <StatCard label="可提现" value={stats.availableForWithdrawal.toFixed(2)} suffix="元" highlight />
        </div>
      )}

      {/* ── Rules Card ── */}
      <div className={cardBase} style={{ padding: '24px 28px', boxShadow: CARD_SHADOW }}>
        <p className="text-[14px] font-semibold text-[#141413] dark:text-[#faf9f5] mb-4" style={{ fontFamily: 'system-ui, sans-serif' }}>
          推荐规则
        </p>
        <ol className="space-y-2.5">
          {[
            '分享您的邀请码给好友，好友注册时输入邀请码即可建立推荐关系',
            '好友每次充值，您将获得相应比例的佣金奖励',
            '佣金经审核通过后可申请提现',
            '每位用户只能使用一次邀请码',
          ].map((text, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-[1.6] text-[#87867f]" style={{ fontFamily: 'Georgia, serif' }}>
              <span className="shrink-0 text-[#ae5630] font-semibold" style={{ fontFamily: 'system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}.
              </span>
              {text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Commissions Tab ─────────────────────────────────────────────────────────

function CommissionsTab() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadCommissions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{ commissions: Commission[] }>(
        `/referrals/commissions?page=${page}&limit=20`,
        { requireAuth: true }
      );
      if (res.success && res.data) {
        setCommissions(res.data.commissions);
        setTotal((res as any).meta?.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadCommissions();
  }, [loadCommissions]);

  if (loading && commissions.length === 0) return <Spinner />;

  return (
    <div className="max-w-2xl mx-auto">
      {commissions.length === 0 ? (
        <div className="text-center py-20 text-[#87867f] text-[13px]" style={{ fontFamily: 'Georgia, serif' }}>
          暂无佣金记录
        </div>
      ) : (
        <div className={cardBase} style={{ boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
          {commissions.map((c, index) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between px-6 py-4',
                index < commissions.length - 1 && 'border-b border-[#1414130a] dark:border-[#faf9f50a]'
              )}
            >
              {/* Left: user + meta */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-[13px] font-medium text-[#141413] dark:text-[#faf9f5] truncate">
                    {c.referredName || c.referredEmail}
                  </span>
                  <StatusBadge status={c.status} type="commission" />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-[#87867f]" style={{ fontFamily: 'Georgia, serif' }}>
                    订单 ¥{c.orderAmount} x {c.commissionRate}%
                  </span>
                  <span className="text-[11px] text-[#87867f]/60">
                    {new Date(c.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>

              {/* Right: amount */}
              <span
                className="shrink-0 text-[15px] font-semibold text-[#ae5630] ml-4"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                +¥{c.commissionAmount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <Pagination page={page} total={total} pageSize={20} onPageChange={setPage} />
      )}
    </div>
  );
}

// ─── Withdraw Tab ────────────────────────────────────────────────────────────

function WithdrawTab() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, withdrawalsRes] = await Promise.all([
        apiClient.get<ReferralStats>('/referrals/stats', { requireAuth: true }),
        apiClient.get<{ withdrawals: Withdrawal[] }>(
          `/referrals/withdrawals?page=${page}&limit=20`,
          { requireAuth: true }
        ),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (withdrawalsRes.success && withdrawalsRes.data) {
        setWithdrawals(withdrawalsRes.data.withdrawals);
        setTotal((withdrawalsRes as any).meta?.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    if (!amount || !paymentAccount) {
      setError('请填写完整信息');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('请输入有效金额');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const res = await apiClient.post('/referrals/withdraw', {
        amount: numAmount,
        paymentMethod,
        paymentAccount,
      }, { requireAuth: true });

      if (res.success) {
        setSuccess('提现申请已提交，请等待审核');
        setAmount('');
        setPaymentAccount('');
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '提现失败');
    } finally {
      setSubmitting(false);
    }
  };

  const paymentMethodLabel = (method: string | null) => {
    const map: Record<string, string> = {
      alipay: '支付宝',
      wechat: '微信',
      bank: '银行卡',
    };
    return method ? map[method] || method : '-';
  };

  if (loading && withdrawals.length === 0) return <Spinner />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Withdraw Stats ── */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="可提现金额"
            value={stats.availableForWithdrawal.toFixed(2)}
            suffix="元"
            highlight
          />
          <StatCard
            label="提现中金额"
            value={stats.withdrawingAmount.toFixed(2)}
            suffix="元"
          />
          <StatCard
            label="已提现金额"
            value={stats.paidCommission.toFixed(2)}
            suffix="元"
          />
        </div>
      )}

      {/* ── Alerts ── */}
      {error && (
        <div className="rounded-xl border border-[#DC2626]/15 bg-[#FEE2E2] dark:bg-[rgba(220,38,38,0.12)] px-4 py-3 text-[13px] text-[#DC2626]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-[#16A34A]/15 bg-[#DCFCE7] dark:bg-[rgba(52,211,153,0.18)] px-4 py-3 text-[13px] text-[#16A34A] dark:text-[#34D399]">
          {success}
        </div>
      )}

      {/* ── Withdraw Form ── */}
      <div className={cardBase} style={{ padding: '28px', boxShadow: CARD_SHADOW }}>
        <p className="text-[14px] font-semibold text-[#141413] dark:text-[#faf9f5] mb-5" style={{ fontFamily: 'system-ui, sans-serif' }}>
          申请提现
        </p>

        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Amount */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-1.5">
              提现金额 (元)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="请输入提现金额"
              min={0}
              step={0.01}
              className="w-full rounded-xl border border-[#1414130a] dark:border-[#faf9f50a] bg-transparent px-3.5 py-2.5 text-[13px] text-[#141413] dark:text-[#faf9f5] placeholder:text-[#87867f]/50 outline-none transition-colors focus:border-[#ae5630]/30 focus:ring-1 focus:ring-[#ae5630]/20"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-1.5">
              收款方式
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-[#1414130a] dark:border-[#faf9f50a] bg-transparent px-3.5 py-2.5 text-[13px] text-[#141413] dark:text-[#faf9f5] outline-none transition-colors focus:border-[#ae5630]/30 focus:ring-1 focus:ring-[#ae5630]/20"
            >
              <option value="alipay">支付宝</option>
              <option value="wechat">微信</option>
              <option value="bank">银行卡</option>
            </select>
          </div>

          {/* Account */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-1.5">
              收款账号
            </label>
            <input
              type="text"
              value={paymentAccount}
              onChange={(e) => setPaymentAccount(e.target.value)}
              placeholder="请输入收款账号"
              className="w-full rounded-xl border border-[#1414130a] dark:border-[#faf9f50a] bg-transparent px-3.5 py-2.5 text-[13px] text-[#141413] dark:text-[#faf9f5] placeholder:text-[#87867f]/50 outline-none transition-colors focus:border-[#ae5630]/30 focus:ring-1 focus:ring-[#ae5630]/20"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl bg-[#ae5630] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#c4633a] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting ? '提交中...' : '申请提现'}
        </button>

        {/* Contact */}
        <div className="pt-4 mt-5 border-t border-[#1414130a] dark:border-[#faf9f50a]">
          <p className="text-[12px] text-[#87867f] text-center" style={{ fontFamily: 'Georgia, serif' }}>
            如有疑问，请联系客服微信：<span className="font-semibold text-[#ae5630]">JsnonoChat</span>
          </p>
        </div>
      </div>

      {/* ── Withdrawal History ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-3 px-1">
          提现记录
        </p>

        {withdrawals.length === 0 ? (
          <div className="text-center py-16 text-[#87867f] text-[13px]" style={{ fontFamily: 'Georgia, serif' }}>
            暂无提现记录
          </div>
        ) : (
          <div className={cardBase} style={{ boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
            {withdrawals.map((w, index) => (
              <div
                key={w.id}
                className={cn(
                  'px-6 py-4',
                  index < withdrawals.length - 1 && 'border-b border-[#1414130a] dark:border-[#faf9f50a]'
                )}
              >
                {/* Top row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="text-[17px] font-semibold text-[#ae5630]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      ¥{w.amount}
                    </span>
                    <StatusBadge status={w.status} type="withdrawal" />
                  </div>
                  <span className="text-[12px] text-[#87867f]">
                    {paymentMethodLabel(w.paymentMethod)}
                  </span>
                </div>

                {/* Details */}
                {w.paymentAccount && (
                  <p className="text-[12px] text-[#87867f] mb-0.5" style={{ fontFamily: 'Georgia, serif' }}>
                    收款账号：{w.paymentAccount}
                  </p>
                )}
                {w.note && (
                  <p className="text-[12px] text-[#87867f] mb-0.5" style={{ fontFamily: 'Georgia, serif' }}>
                    备注：{w.note}
                  </p>
                )}

                {/* Timestamps */}
                <div className="flex items-center justify-between mt-2 text-[11px] text-[#87867f]/60">
                  <span>申请时间：{new Date(w.createdAt).toLocaleString('zh-CN')}</span>
                  {w.processedAt && (
                    <span>处理时间：{new Date(w.processedAt).toLocaleString('zh-CN')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > 20 && (
          <Pagination page={page} total={total} pageSize={20} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

/** Stat card with optional accent highlight (left border emphasis). */
function StatCard({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-[#3d3d3a] rounded-xl border border-[#1414130a] dark:border-[#faf9f50a] p-4',
        highlight && 'border-l-[3px] border-l-[#ae5630]'
      )}
      style={{ boxShadow: highlight ? CARD_SHADOW : undefined }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#87867f] mb-1.5">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'text-[24px] font-semibold',
            highlight ? 'text-[#ae5630]' : 'text-[#141413] dark:text-[#faf9f5]'
          )}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-[12px] text-[#87867f]">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/** Status badge for commissions and withdrawals. */
function StatusBadge({
  status,
  type,
}: {
  status: string;
  type: 'commission' | 'withdrawal';
}) {
  const commissionMap: Record<string, { text: string; className: string }> = {
    pending:  { text: '待审核', className: 'text-[#D97706] bg-[#FEF3C7]' },
    approved: { text: '已通过', className: 'text-[#16A34A] bg-[#DCFCE7] dark:text-[#34D399] dark:bg-[rgba(52,211,153,0.18)]' },
    paid:     { text: '已支付', className: 'text-[#2563EB] bg-[#DBEAFE]' },
    rejected: { text: '已拒绝', className: 'text-[#DC2626] bg-[#FEE2E2]' },
  };

  const withdrawalMap: Record<string, { text: string; className: string }> = {
    pending:  { text: '审核中', className: 'text-[#D97706] bg-[#FEF3C7]' },
    approved: { text: '已审批', className: 'text-[#2563EB] bg-[#DBEAFE]' },
    paid:     { text: '已打款', className: 'text-[#16A34A] bg-[#DCFCE7] dark:text-[#34D399] dark:bg-[rgba(52,211,153,0.18)]' },
    rejected: { text: '已拒绝', className: 'text-[#DC2626] bg-[#FEE2E2]' },
  };

  const map = type === 'commission' ? commissionMap : withdrawalMap;
  const badge = map[status] || { text: status, className: 'text-[#87867f] bg-[#1414130a]' };

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium leading-tight ${badge.className}`}>
      {badge.text}
    </span>
  );
}

/** Simple prev/next pagination. */
function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-5 pt-5">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="text-[13px] text-[#87867f] hover:text-[#ae5630] transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        上一页
      </button>
      <span
        className="text-[12px] text-[#87867f]/60"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        第 {page} 页
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page * pageSize >= total}
        className="text-[13px] text-[#87867f] hover:text-[#ae5630] transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        下一页
      </button>
    </div>
  );
}
