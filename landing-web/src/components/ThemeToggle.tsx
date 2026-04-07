import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-all duration-300 hover:bg-brand-primary/10"
      aria-label={theme === 'light' ? t('a11y.switchToDarkMode') : t('a11y.switchToLightMode')}
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" />
      ) : (
        <Sun className="w-5 h-5 text-light-text-secondary dark:text-dark-text-secondary" />
      )}
    </button>
  );
}
