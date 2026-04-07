import { useTranslation } from 'react-i18next';
import { ShieldAlert, Info, X } from 'lucide-react';

interface AntivirusModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function AntivirusModal({ open, onConfirm, onClose }: AntivirusModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-2xl max-w-md w-full p-6 z-10 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ShieldAlert size={28} className="text-amber-500" />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('antivirusModal.title')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary leading-relaxed">
              {t('antivirusHint')}
            </p>
          </div>

          {/* 安装引导提示 */}
          <div className="w-full">
            <div className="flex items-start gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Info size={16} className="text-blue-500" />
              </div>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary leading-relaxed text-left">
                {t('antivirusModal.installHint')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <img
                src="/windowsfangyu1.png"
                alt="安装引导步骤1"
                className="w-full sm:w-1/2 rounded-lg border border-gray-200 dark:border-gray-700"
                loading="lazy"
                decoding="async"
              />
              <img
                src="/windowsfangyu2.png"
                alt="安装引导步骤2"
                className="w-full sm:w-1/2 rounded-lg border border-gray-200 dark:border-gray-700"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>

          <button
            onClick={onConfirm}
            className="w-full py-3 px-6 bg-brand-primary text-white rounded-xl font-semibold hover:bg-brand-hover transition-colors"
          >
            {t('antivirusModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
