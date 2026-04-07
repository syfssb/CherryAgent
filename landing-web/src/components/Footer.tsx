import { useTranslation } from 'react-i18next';
import { getDownloadUrl } from '../lib/constants';

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#faf9f51a] py-12 bg-[#141413]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="text-lg font-bold text-[#faf9f5] mb-2">Cherry Agent</div>
            <p className="text-sm text-[#9a9893] mb-3">
              {t('footer.copyright', { year: currentYear })}
            </p>
            <p className="text-xs text-[#6b6a68]">
              {t('footer.company.operatedBy')}<br />
              <a
                href="https://find-and-update.company-information.service.gov.uk/company/16096119"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#ae5630] transition-colors underline"
              >
                {t('footer.company.numberLabel', { number: '16096119' })}
              </a>
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-[#faf9f5] mb-3">{t('footer.product')}</h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-sm text-[#9a9893] hover:text-[#ae5630] transition-colors">
                  {t('footer.links.features')}
                </a>
              </li>
              <li>
                <a
                  href={getDownloadUrl()}
                  className="text-sm text-[#9a9893] hover:text-[#ae5630] transition-colors"
                >
                  {t('footer.links.download')}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Us */}
          <div>
            <h4 className="text-sm font-semibold text-[#faf9f5] mb-3">{t('footer.contact')}</h4>
            <ul className="space-y-2">
              <li className="text-sm text-[#9a9893]">
                <span className="font-medium">{t('footer.contactInfo.wechat')}:</span> JsnonoChat
              </li>
              <li>
                <a
                  href="mailto:1073634403@qq.com"
                  className="text-sm text-[#9a9893] hover:text-[#ae5630] transition-colors"
                >
                  <span className="font-medium">{t('footer.contactInfo.email')}:</span> 1073634403@qq.com
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/+rF_DXgP1QiQ3Y2Zl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#9a9893] hover:text-[#ae5630] transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
