import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const STEP_KEYS = ['step1', 'step2', 'step3'] as const;

export default function Steps() {
  const { t } = useTranslation();

  return (
    <section id="steps" className="py-20 md:py-32 bg-white dark:bg-[#2b2a27]">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] text-center mb-16">
          {t('steps.title')}
        </h2>

        <div className="space-y-8">
          {STEP_KEYS.map((key, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5 }}
              className="flex items-start gap-6 p-6 bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] hover:border-[#14141333] dark:hover:border-[#faf9f533] transition-all"
            >
              <div className="shrink-0 w-14 h-14 flex items-center justify-center rounded-xl bg-[#ae5630]/10 dark:bg-[#ae5630]/15 text-[#ae5630] font-bold text-xl font-mono">
                {t(`steps.${key}.number`)}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] mb-1">
                  {t(`steps.${key}.title`)}
                </h3>
                <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                  {t(`steps.${key}.desc`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
