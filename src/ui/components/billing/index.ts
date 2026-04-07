/**
 * Billing components barrel export file.
 * Import all billing-related components from a single location.
 *
 * @example
 * import { RechargeModal, BalanceDisplay, QRCodePayment } from "@/ui/components/billing"
 */

// BalanceDisplay - 余额显示组件
export { BalanceDisplay } from './BalanceDisplay';
export type { BalanceDisplayProps } from './BalanceDisplay';

// QRCodePayment - 二维码支付组件
export { QRCodePayment } from './QRCodePayment';
export type { QRCodePaymentProps } from './QRCodePayment';

// RechargeModal - 充值弹窗组件
export { RechargeModal } from './RechargeModal';
export type { RechargeModalProps } from './RechargeModal';
