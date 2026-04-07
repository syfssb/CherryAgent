import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n/config';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((code: LanguageCode) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
    setFocusedIndex(-1);
  }, [i18n]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIdx = SUPPORTED_LANGUAGES.findIndex(l => l.code === i18n.language);
        setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % SUPPORTED_LANGUAGES.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + SUPPORTED_LANGUAGES.length) % SUPPORTED_LANGUAGES.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          handleSelect(SUPPORTED_LANGUAGES[focusedIndex].code);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(SUPPORTED_LANGUAGES.length - 1);
        break;
    }
  }, [isOpen, focusedIndex, handleSelect]);

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        onClick={() => {
          setIsOpen(prev => !prev);
          if (!isOpen) {
            const currentIdx = SUPPORTED_LANGUAGES.findIndex(l => l.code === i18n.language);
            setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
          }
        }}
        className="group flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-all duration-200 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface border border-transparent hover:border-light-border dark:hover:border-dark-border shadow-sm hover:shadow-md"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('a11y.selectLanguage')}
      >
        <Globe size={16} className="transition-transform group-hover:scale-110" />
        <span className="min-w-[4rem] text-left">{currentLang.label}</span>
        <ChevronDown
          size={14}
          className={`transition-all duration-300 ${isOpen ? 'rotate-180' : ''} group-hover:text-brand-primary`}
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={t('a11y.languageOptions')}
          aria-activedescendant={focusedIndex >= 0 ? `lang-option-${SUPPORTED_LANGUAGES[focusedIndex].code}` : undefined}
          className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-surface backdrop-blur-xl border border-light-border dark:border-dark-border rounded-2xl overflow-hidden shadow-2xl z-50 animate-fade-in"
          style={{
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang, idx) => (
            <li key={lang.code}>
              <button
                id={`lang-option-${lang.code}`}
                role="option"
                aria-selected={lang.code === i18n.language}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-center px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  lang.code === i18n.language
                    ? 'text-brand-primary dark:text-brand-primary bg-brand-primary/10 dark:bg-brand-primary/20'
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-bg'
                } ${idx === focusedIndex ? 'ring-2 ring-inset ring-brand-primary/50' : ''}`}
              >
                <span className="relative">
                  {lang.label}
                  {lang.code === i18n.language && (
                    <span className="absolute -right-5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-brand-primary rounded-full" />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
