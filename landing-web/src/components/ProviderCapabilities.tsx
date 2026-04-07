import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Sparkles, Brain, Puzzle, ShieldCheck } from 'lucide-react';

/** Three distinct capability cards below the main Claude card */
const CAPABILITY_CARDS = [
  { key: 'smartModel', Icon: Brain },
  { key: 'skillSystem', Icon: Puzzle },
  { key: 'crossPlatform', Icon: ShieldCheck },
] as const;

export default function ProviderCapabilities() {
  const { t } = useTranslation();
  const claudeFeatures = t('providers.claude.features', { returnObjects: true }) as string[];

  return (
    <section className="py-20 md:py-32 bg-[#f0eee6] dark:bg-[#1a1918]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] mb-4">
            {t('providers.title')}
          </h2>
          <p className="text-[#6b6a68] dark:text-[#9a9893] text-lg max-w-2xl mx-auto">
            {t('providers.subtitle')}
          </p>
        </div>

        {/* Claude main card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="group p-8 bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] mb-8"
        >
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#ae5630]/10 dark:bg-[#ae5630]/15 text-[#ae5630] shrink-0">
              <Sparkles size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-[#141413] dark:text-[#faf9f5] mb-2">
                {t('providers.claude.title')}
              </h3>
              <p className="text-[#6b6a68] dark:text-[#9a9893] leading-relaxed mb-5">
                {t('providers.claude.desc')}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {claudeFeatures.map((feat, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-sm text-[#6b6a68] dark:text-[#9a9893]">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#ae5630] shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Three distinct capability cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CAPABILITY_CARDS.map(({ key, Icon }, i) => (
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
              <h3 className="text-base font-semibold text-[#141413] dark:text-[#faf9f5] mb-1">
                {t(`providers.capabilities.${key}.title`)}
              </h3>
              <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                {t(`providers.capabilities.${key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
