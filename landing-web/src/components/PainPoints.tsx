import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageSquareX, CreditCard, CloudOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PainPointItem {
  readonly key: string;
  readonly Icon: LucideIcon;
}

const PAIN_POINTS: readonly PainPointItem[] = [
  { key: 'item1', Icon: MessageSquareX },
  { key: 'item2', Icon: CreditCard },
  { key: 'item3', Icon: CloudOff },
] as const;

export default function PainPoints() {
  const { t } = useTranslation();

  return (
    <section
      id="pain-points"
      className="py-20 md:py-32 bg-[#f0eee6] dark:bg-[#1a1918]"
      aria-labelledby="pain-points-heading"
    >
      <div className="max-w-6xl mx-auto px-6">
        <motion.h2
          id="pain-points-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.5 }}
          className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] text-center mb-16"
        >
          {t('painPoints.title')}
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PAIN_POINTS.map(({ key, Icon }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group p-6 bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] hover:border-[#14141333] dark:hover:border-[#faf9f533] transition-all"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#ae5630]/10 dark:bg-[#ae5630]/15 text-[#ae5630] mb-4 group-hover:bg-[#ae5630]/20 dark:group-hover:bg-[#ae5630]/25 transition-colors">
                <Icon size={24} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-[#141413] dark:text-[#faf9f5] mb-2">
                {t(`painPoints.${key}.title`)}
              </h3>
              <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                {t(`painPoints.${key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
