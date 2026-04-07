import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ChevronDown } from 'lucide-react';
import { getDownloadUrl, detectPlatform, PLATFORM_LABELS, DOWNLOAD_URLS } from '../lib/constants';
import { trackDownloadClick } from '../lib/analytics';
import AntivirusModal from './AntivirusModal';

export default function Hero() {
  const { t } = useTranslation();
  const scenes = t('hero.typewriterScenes', { returnObjects: true }) as string[];
  const [displayText, setDisplayText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(false);

  // 所有打字机可变状态放 ref，避免触发 re-render 导致抖动
  const stateRef = useRef({ sceneIndex: 0, charIndex: 0, isDeleting: false });
  const scenesRef = useRef<string[]>(scenes);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保持 scenesRef 与最新翻译同步（语言切换场景）
  scenesRef.current = scenes;

  useEffect(() => {
    const tick = () => {
      const s = stateRef.current;
      const currentScene = scenesRef.current[s.sceneIndex] ?? '';

      if (!s.isDeleting) {
        if (s.charIndex < currentScene.length) {
          s.charIndex++;
          setDisplayText(currentScene.slice(0, s.charIndex));
          timeoutRef.current = setTimeout(tick, 60);
        } else {
          // 展示完整文字后暂停 2s 再删除
          timeoutRef.current = setTimeout(() => {
            s.isDeleting = true;
            timeoutRef.current = setTimeout(tick, 30);
          }, 2000);
        }
      } else {
        if (s.charIndex > 0) {
          s.charIndex--;
          setDisplayText(currentScene.slice(0, s.charIndex));
          timeoutRef.current = setTimeout(tick, 30);
        } else {
          // 删完后切换到下一句
          s.isDeleting = false;
          s.sceneIndex = (s.sceneIndex + 1) % scenesRef.current.length;
          timeoutRef.current = setTimeout(tick, 60);
        }
      }
    };

    timeoutRef.current = setTimeout(tick, 400);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []); // 只跑一次，打字机状态完全由 ref 管理

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
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 bg-[#faf9f5] dark:bg-[#141413]">
      <div className="max-w-4xl mx-auto px-6 text-center">
        {/* Title */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
          <span className="text-[#141413] dark:text-[#faf9f5]">{t('hero.title')}</span>
          <br />
          <span className="text-[#ae5630]">{t('hero.titleHighlight')}</span>
        </h1>

        {/* Description */}
        <p className="mt-6 text-lg md:text-xl text-[#6b6a68] dark:text-[#9a9893] max-w-2xl mx-auto leading-relaxed">
          {t('hero.description')}
        </p>

        {/* Typewriter */}
        <div className="mt-10 mx-auto max-w-xl">
          <div className="bg-[#f0eee6] dark:bg-[#2b2a27] border border-[#1414131a] dark:border-[#faf9f51a] rounded-xl px-5 py-4 text-left">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-green-500/70" />
            </div>
            <div className="font-mono text-sm md:text-base text-[#6b6a68] dark:text-[#9a9893] min-h-[1.75rem]" aria-live="polite" aria-atomic="true">
              <span>{displayText}</span>
              <span className="animate-blink text-[#ae5630]">|</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={getDownloadUrl()}
              onClick={handleDownloadClick}
              className="flex items-center gap-2 px-7 py-3.5 bg-[#ae5630] text-white rounded-xl font-semibold text-base hover:bg-[#c4633a] active:scale-[0.98] transition-all duration-200"
            >
              <Download size={18} />
              {t('hero.downloadBtn')} ({PLATFORM_LABELS[detectPlatform()]})
            </a>
          </div>
          <button
            onClick={() => setShowPlatforms(prev => !prev)}
            className="flex items-center gap-1 text-sm text-[#6b6a68] dark:text-[#9a9893] hover:text-[#ae5630] dark:hover:text-[#ae5630] transition-colors"
          >
            {t('hero.otherPlatforms', '其他版本')}
            <ChevronDown size={14} className={`transition-transform ${showPlatforms ? 'rotate-180' : ''}`} />
          </button>
          {showPlatforms && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {Object.entries(DOWNLOAD_URLS).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  onClick={(e) => {
                    e.preventDefault();
                    trackDownloadClick(key);
                    if (key === 'win_x64') {
                      setShowModal(true);
                    } else {
                      window.location.href = url;
                    }
                  }}
                  className="text-sm px-4 py-2 rounded-lg border border-[#1414131a] dark:border-[#faf9f51a] text-[#6b6a68] dark:text-[#9a9893] hover:border-[#ae5630] hover:text-[#ae5630] dark:hover:text-[#ae5630] transition-colors"
                >
                  {PLATFORM_LABELS[key]}
                </a>
              ))}
            </div>
          )}
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
