import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { getDownloadUrl, detectPlatform } from '../lib/constants';
import { trackDownloadClick } from '../lib/analytics';
import AntivirusModal from './AntivirusModal';

export default function BottomCTA() {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    trackDownloadClick(detectPlatform());
    if (detectPlatform() === 'win_x64') {
      setShowModal(true);
    } else {
      window.location.href = getDownloadUrl();
    }
  };

  const handleConfirm = () => {
    setShowModal(false);
    window.location.href = getDownloadUrl();
  };

  return (
    <section className="py-20 md:py-32 bg-[#141413] dark:bg-[#0f0f0e]">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-[#faf9f5] mb-4">
          {t('bottomCta.title')}
        </h2>
        <p className="text-[#9a9893] mb-10">
          {t('bottomCta.description')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={getDownloadUrl()}
            onClick={handleDownloadClick}
            className="flex items-center gap-2 px-7 py-3.5 bg-[#ae5630] text-white rounded-xl font-semibold hover:bg-[#c4633a] active:scale-[0.98] transition-all duration-200"
          >
            <Download size={18} />
            {t('bottomCta.downloadBtn')}
          </a>
        </div>
      </div>

      <AntivirusModal
        open={showModal}
        onConfirm={handleConfirm}
        onClose={() => setShowModal(false)}
      />
    </section>
  );
}
