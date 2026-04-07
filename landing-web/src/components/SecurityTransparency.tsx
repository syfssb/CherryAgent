import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ShieldCheck, Building2, Lock } from 'lucide-react';

const SECURITY_ITEMS = [
  { key: 'permissions', Icon: ShieldCheck },
  { key: 'enterprise', Icon: Building2 },
  { key: 'data', Icon: Lock },
] as const;

export default function SecurityTransparency() {
  const { t } = useTranslation();

  return (
    <section className="py-20 md:py-32 bg-[#faf9f5] dark:bg-[#141413]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] mb-4">
            {t('security.title')}
          </h2>
          <p className="text-[#6b6a68] dark:text-[#9a9893] text-lg max-w-2xl mx-auto">
            {t('security.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SECURITY_ITEMS.map(({ key, Icon }, i) => (
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
                {t(`security.${key}.title`)}
              </h3>
              <p className="text-sm text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                {t(`security.${key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
