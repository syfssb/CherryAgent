import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function ProductShowcase() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [8, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.95, 1]);

  return (
    <section ref={ref} className="py-20 md:py-32 bg-[#faf9f5] dark:bg-[#141413]">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-[#141413] dark:text-[#faf9f5] mb-4">
          {t('showcase.title')}
        </h2>
        <p className="text-[#6b6a68] dark:text-[#9a9893] mb-12 max-w-xl mx-auto">
          {t('showcase.description')}
        </p>

        <motion.div
          style={{ y, rotateX, scale, perspective: 1200 }}
          className="relative mx-auto"
        >
          {/* Glow */}
          <div className="absolute -inset-4 bg-[#ae5630]/8 blur-3xl rounded-3xl" />

          {/* Screenshots Grid */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Screenshot 1 */}
            <div className="relative bg-white dark:bg-[#2b2a27] rounded-2xl border border-[#1414131a] dark:border-[#faf9f51a] overflow-hidden shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#f0eee6] dark:bg-[#141413] border-b border-[#1414131a] dark:border-[#faf9f51a]">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-4 text-xs text-[#87867f] font-mono">Cherry Agent</span>
              </div>

              {/* Desktop Screenshot */}
              <div className="relative">
                <img
                  src="/zhuomian.png"
                  alt={t('showcase.screenshot1Alt')}
                  className="w-full h-auto"
                />
              </div>
            </div>

            {/* Screenshot 2 */}
            <div className="relative bg-white dark:bg-[#2b2a27] rounded-2xl border border-[#1414131a] dark:border-[#faf9f51a] overflow-hidden shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)]">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#f0eee6] dark:bg-[#141413] border-b border-[#1414131a] dark:border-[#faf9f51a]">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-4 text-xs text-[#87867f] font-mono">Cherry Agent</span>
              </div>

              {/* Desktop Screenshot */}
              <div className="relative">
                <img
                  src="/zhuomian2.png"
                  alt={t('showcase.screenshot2Alt')}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
