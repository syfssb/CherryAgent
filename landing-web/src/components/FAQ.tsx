import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function FAQ() {
  const { t } = useTranslation();
  const items = t('faq.items', { returnObjects: true }) as Array<{ q: string; a: string }>;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(prev => (prev === i ? null : i));
  };

  return (
    <section id="faq" className="py-20 md:py-32 bg-[#f0eee6] dark:bg-[#1a1918]">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] text-center mb-16">
          {t('faq.title')}
        </h2>

        <div className="space-y-4">
          {items.map((item, i) => {
            const panelId = `faq-panel-${i}`;
            const triggerId = `faq-trigger-${i}`;
            const isOpen = openIndex === i;

            return (
              <div
                key={i}
                className="group bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl overflow-hidden shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] transition-all duration-300 hover:border-[#14141333] dark:hover:border-[#faf9f533]"
              >
                <button
                  id={triggerId}
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span className="text-[#141413] dark:text-[#faf9f5] font-semibold text-base md:text-lg pr-4 group-hover:text-[#ae5630] transition-colors">
                    {item.q}
                  </span>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-[#87867f] dark:text-[#6b6a68] group-hover:text-[#ae5630] transition-all duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      role="region"
                      aria-labelledby={triggerId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 pt-1">
                        <p className="text-sm md:text-base text-[#6b6a68] dark:text-[#9a9893] leading-relaxed">
                          {item.a}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
