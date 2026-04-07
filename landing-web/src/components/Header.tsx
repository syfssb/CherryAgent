import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import { getDownloadUrl, detectPlatform } from '../lib/constants';
import AntivirusModal from './AntivirusModal';

export default function Header() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const navLinks = [
    { key: 'features', href: '#features' },
    { key: 'steps', href: '#steps' },
    { key: 'faq', href: '#faq' },
  ];

  const handleNavClick = () => setMobileOpen(false);

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setMobileOpen(false);
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
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'bg-[#faf9f5]/90 dark:bg-[#141413]/90 backdrop-blur-md border-b border-[#1414131a] dark:border-[#faf9f51a]'
          : 'bg-transparent'
      }`}
    >
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <a href="#" className="flex items-center gap-2 text-xl font-bold text-[#141413] dark:text-[#faf9f5] tracking-tight">
          <img src="/app-icon.png" alt="Cherry Agent" className="w-8 h-8" />
          Cherry Agent
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(link => (
            <a
              key={link.key}
              href={link.href}
              className="text-sm text-[#6b6a68] dark:text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5] transition-colors"
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <a
            href="/register"
            className="hidden sm:inline-flex text-sm px-4 py-2 border border-[#ae5630] text-[#ae5630] dark:text-[#ae5630] rounded-lg font-medium hover:bg-[#ae5630]/10 transition-colors"
          >
            {t('nav.register')}
          </a>
          <a
            href={getDownloadUrl()}
            onClick={handleDownloadClick}
            className="hidden sm:inline-flex text-sm px-4 py-2 bg-[#ae5630] text-white rounded-lg font-medium hover:bg-[#c4633a] transition-colors"
          >
            {t('nav.download')}
          </a>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="md:hidden text-[#6b6a68] dark:text-[#87867f] hover:text-[#141413] dark:hover:text-[#faf9f5] transition-colors p-1"
            aria-label={mobileOpen ? t('a11y.closeMenu') : t('a11y.openMenu')}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#1414131a] dark:border-[#faf9f51a] bg-[#faf9f5]/95 dark:bg-[#141413]/95 backdrop-blur-md">
          <div className="flex flex-col px-6 py-4 gap-3">
            {navLinks.map(link => (
              <a
                key={link.key}
                href={link.href}
                onClick={handleNavClick}
                className="text-base text-[#6b6a68] dark:text-[#9a9893] hover:text-[#141413] dark:hover:text-[#faf9f5] transition-colors py-2"
              >
                {t(`nav.${link.key}`)}
              </a>
            ))}
            <a
              href="/register"
              onClick={handleNavClick}
              className="inline-flex items-center justify-center text-sm px-4 py-2.5 border border-[#ae5630] text-[#ae5630] dark:text-[#ae5630] rounded-lg font-medium hover:bg-[#ae5630]/10 transition-colors mt-1"
            >
              {t('nav.register')}
            </a>
            <a
              href={getDownloadUrl()}
              onClick={handleDownloadClick}
              className="inline-flex items-center justify-center text-sm px-4 py-2.5 bg-[#ae5630] text-white rounded-lg font-medium hover:bg-[#c4633a] transition-colors"
            >
              {t('nav.download')}
            </a>
          </div>
        </div>
      )}

      <AntivirusModal
        open={showModal}
        onConfirm={handleConfirm}
        onClose={() => setShowModal(false)}
      />
    </header>
  );
}
