import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FolderOpen, Receipt, Database, FileText } from 'lucide-react';

const USECASE_ICONS = [
  FolderOpen,
  Receipt,
  Database,
  FileText
] as const;

const USECASE_KEYS = [
  'fileManagement',
  'receiptProcessing',
  'dataAnalysis',
  'meetingNotes'
] as const;

export default function UseCases() {
  const { t } = useTranslation();

  return (
    <section id="usecases" className="py-20 md:py-32 bg-carbon-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">
            {t('useCases.title')}
          </h2>
          <p className="text-sage-400 text-lg max-w-2xl mx-auto">
            {t('useCases.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {USECASE_KEYS.map((key, i) => {
            const Icon = USECASE_ICONS[i];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group p-6 bg-carbon-850 border border-carbon-700 rounded-2xl hover:border-accent-green/50 transition-all hover:shadow-lg hover:shadow-accent-green/10"
              >
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-accent-green/15 text-accent-green mb-4 group-hover:bg-accent-green/25 transition-colors">
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {t(`useCases.${key}.title`)}
                </h3>
                <p className="text-sm text-sage-400 leading-relaxed mb-4">
                  {t(`useCases.${key}.desc`)}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sage-500 line-through">
                    {t(`useCases.${key}.timeBefore`)}
                  </span>
                  <span className="text-sage-400">→</span>
                  <span className="text-accent-green font-semibold">
                    {t(`useCases.${key}.timeAfter`)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
