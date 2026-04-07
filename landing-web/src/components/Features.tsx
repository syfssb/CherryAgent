import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Brain, Shield, Package, Route } from 'lucide-react';

const FEATURE_ICONS = [Brain, Shield, Package, Route] as const;
const FEATURE_KEYS = ['memory', 'privacy', 'skills', 'extensible'] as const;

export default function Features() {
  const { t } = useTranslation();

  return (
    <section id="features" className="py-20 md:py-32 bg-white dark:bg-[#2b2a27]">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] text-center mb-16">
          {t('features.title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {FEATURE_KEYS.map((key, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="group p-6 bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] hover:border-[#14141333] dark:hover:border-[#faf9f533] transition-all"
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#ae5630]/10 dark:bg-[#ae5630]/15 text-[#ae5630] mb-4 group-hover:bg-[#ae5630]/20 dark:group-hover:bg-[#ae5630]/25 transition-colors">
                  <Icon size={20} />
                </div>
                <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] mb-2">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                  {t(`features.${key}.desc`)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
