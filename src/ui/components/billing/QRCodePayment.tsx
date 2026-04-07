import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn } from '@/ui/components/ui';
import { useAuthStore } from '@/ui/store/useAuthStore';
import {
  useBillingStore,
  formatRMB,
  type RechargeOrder,
  type RechargeStatus,
} from '@/ui/store/useBillingStore';

/**
 * QRCodePayment 组件属性
 */
export interface QRCodePaymentProps {
  /** 充值订单 */
  order: RechargeOrder;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 支付成功回调 */
  onSuccess?: () => void;
  /** 支付失败回调 */
  onFailed?: () => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 轮询间隔（毫秒），默认 3000 */
  pollInterval?: number;
}

/**
 * 加载 Spinner 组件
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * 成功图标 SVG
 */
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * 失败图标 SVG
 */
function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

/**
 * 刷新图标 SVG
 */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/**
 * 微信支付图标
 */
function WechatPayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89l-.004-.031-.402-.001zm-2.05 2.865c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" fill="#07C160"/>
    </svg>
  );
}

/**
 * 支付宝图标
 */
function AlipayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.424 16.45c-1.721-.658-3.392-1.358-5.009-2.098l-.165-.08-.21-.103c1.04-1.6 1.755-3.341 2.106-5.17H20V7h-6V5h-2v2H6v2h8.152a14.3 14.3 0 0 1-1.631 3.988c-.935-.416-1.94-.81-3.021-1.175-2.12-.72-4.267-.998-5.5-.583-1.232.416-2 1.333-2 2.667 0 1.333.768 2.5 2.5 3.333 1.732.834 3.964.667 5.5-.083.89-.434 1.727-1.043 2.488-1.808a41.136 41.136 0 0 0 4.178 1.925c1.344.543 2.66 1.012 3.934 1.408V24h2V0h-2v16.45zM6.5 16.5c-1.333 0-2-.5-2-1.167 0-.666.333-1.166 1.333-1.5 1-.333 2.667 0 4 .5.667.25 1.253.526 1.744.833C10.267 16.833 8.5 16.5 6.5 16.5z" fill="#1677FF"/>
    </svg>
  );
}

/**
 * 格式化剩余时间
 */
function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 二维码支付组件
 * 显示支付二维码，倒计时，自动轮询支付状态
 */
export function QRCodePayment({
  order,
  className,
  onSuccess,
  onFailed,
  onCancel,
  pollInterval = 3000,
}: QRCodePaymentProps) {
  const { t } = useTranslation();
  const fetchBalance = useAuthStore((s) => s.fetchBalance);
  const pollPaymentStatus = useBillingStore((s) => s.pollPaymentStatus);

  // 状态
  const [status, setStatus] = useState<RechargeStatus>(order.status);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(true);

  // refs
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 计算剩余时间（秒）
   */
  const calculateRemainingTime = useCallback(() => {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((order.expiresAt - now) / 1000));
    return remaining;
  }, [order.expiresAt]);

  /**
   * 轮询支付状态
   */
  const checkStatus = useCallback(async () => {
    if (!isPolling) return;

    try {
      const newStatus = await pollPaymentStatus(order.id);
      setStatus(newStatus);

      if (newStatus === 'paid') {
        setIsPolling(false);
        // 刷新余额
        await fetchBalance();
        onSuccess?.();
      } else if (newStatus === 'failed' || newStatus === 'expired') {
        setIsPolling(false);
        onFailed?.();
      }
    } catch (error) {
      // 轮询失败，继续尝试
    }
  }, [isPolling, pollPaymentStatus, order.id, fetchBalance, onSuccess, onFailed]);

  /**
   * 支付渠道显示
   */
  const channelDisplay = useMemo(() => {
    if (order.channel === 'xunhu_wechat') {
      return {
        icon: <WechatPayIcon className="h-6 w-6" />,
        name: t('payment.wechat'),
        color: 'text-[#07C160]',
        bgColor: 'bg-[#07C160]/10',
      };
    }
    if (order.channel === 'xunhu_alipay') {
      return {
        icon: <AlipayIcon className="h-6 w-6" />,
        name: t('payment.alipay'),
        color: 'text-[#1677FF]',
        bgColor: 'bg-[#1677FF]/10',
      };
    }
    return {
      icon: null,
      name: '',
      color: '',
      bgColor: '',
    };
  }, [order.channel, t]);

  /**
   * 初始化倒计时和轮询
   */
  useEffect(() => {
    // 初始化剩余时间
    setRemainingTime(calculateRemainingTime());

    // 启动倒计时
    countdownTimerRef.current = setInterval(() => {
      const remaining = calculateRemainingTime();
      setRemainingTime(remaining);

      if (remaining <= 0) {
        setStatus('expired');
        setIsPolling(false);
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
        onFailed?.();
      }
    }, 1000);

    // 启动轮询
    pollTimerRef.current = setInterval(checkStatus, pollInterval);

    // 立即检查一次
    checkStatus();

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [calculateRemainingTime, checkStatus, pollInterval, onFailed]);

  /**
   * 手动刷新状态
   */
  const handleRefresh = useCallback(() => {
    checkStatus();
  }, [checkStatus]);

  /**
   * 取消支付
   */
  const handleCancel = useCallback(() => {
    setIsPolling(false);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    onCancel?.();
  }, [onCancel]);

  // 支付成功状态
  if (status === 'paid') {
    return (
      <div className={cn('flex flex-col items-center py-8', className)}>
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
          <CheckCircleIcon className="h-8 w-8 text-success" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 mb-2">
          {t('payment.success')}
        </h3>
        <p className="text-sm text-muted mb-4">
          {formatRMB(order.amount)}
        </p>
        <Button onClick={onSuccess}>{t('common.confirm')}</Button>
      </div>
    );
  }

  // 支付失败/过期状态
  if (status === 'failed' || status === 'expired') {
    return (
      <div className={cn('flex flex-col items-center py-8', className)}>
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-4">
          <XCircleIcon className="h-8 w-8 text-error" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 mb-2">
          {t('payment.failed')}
        </h3>
        <p className="text-sm text-muted mb-4">
          {status === 'expired'
            ? t('payment.paymentExpired')
            : t('payment.paymentFailedRetry', '支付失败，请重试')}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onCancel}>{t('common.retry')}</Button>
        </div>
      </div>
    );
  }

  // 等待支付状态
  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* 支付渠道标识 */}
      <div className={cn('flex items-center gap-2 px-4 py-2 rounded-full mb-4', channelDisplay.bgColor)}>
        {channelDisplay.icon}
        <span className={cn('text-sm font-medium', channelDisplay.color)}>
          {channelDisplay.name}
        </span>
      </div>

      {/* 支付金额 */}
      <div className="text-2xl font-bold text-ink-900 mb-4">
        {formatRMB(order.amount)}
      </div>

      {/* 二维码 */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="w-48 h-48 border-2 border-ink-400/20 rounded-xl p-2 bg-white">
          {order.qrCodeUrl ? (
            <img
              src={order.qrCodeUrl}
              alt={t('payment.qrCodeAlt', '支付二维码')}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-ink-100 rounded-lg">
              <LoadingSpinner className="h-8 w-8 text-muted" />
            </div>
          )}
        </div>

        {/* 轮询指示器（放在二维码下方，避免遮挡） */}
        {isPolling && (
          <div className="flex items-center gap-1 px-2 py-1 bg-surface rounded-full shadow-sm border border-ink-400/20">
            <LoadingSpinner className="h-3 w-3 text-accent" />
            <span className="text-xs text-muted">{t('payment.polling', '检测中')}</span>
          </div>
        )}
      </div>

      {/* 提示文本 */}
      <p className="text-sm text-muted mb-2">
        {t('payment.useChannelToScan', '请使用{{channel}}扫描二维码完成支付', {
          channel: channelDisplay.name,
        })}
      </p>

      {/* 倒计时 */}
      <div className={cn(
        'flex items-center gap-2 text-sm mb-4',
        remainingTime <= 60 ? 'text-warning' : 'text-muted'
      )}>
        <span>{t('payment.expiresIn', '有效期')}：</span>
        <span className="font-mono font-medium">
          {formatRemainingTime(remainingTime)}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshIcon className="h-4 w-4 mr-1" />
          {t('common.refresh')}
        </Button>
      </div>
    </div>
  );
}

export default QRCodePayment;
