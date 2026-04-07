import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function WhatItIs() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  });

  const opacity1 = useTransform(scrollYProgress, [0, 0.3], [0, 1]);
  const opacity2 = useTransform(scrollYProgress, [0.2, 0.5], [0, 1]);
  const opacity3 = useTransform(scrollYProgress, [0.4, 0.7], [0, 1]);
  const y1 = useTransform(scrollYProgress, [0, 0.3], [40, 0]);
  const y2 = useTransform(scrollYProgress, [0.2, 0.5], [40, 0]);
  const y3 = useTransform(scrollYProgress, [0.4, 0.7], [30, 0]);

  return (
    <section ref={ref} className="py-32 md:py-48 bg-[#faf9f5] dark:bg-[#141413]">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.p
          style={{ opacity: opacity1, y: y1 }}
          className="text-3xl md:text-5xl lg:text-6xl font-bold text-[#87867f] dark:text-[#6b6a68] leading-tight"
        >
          {t('whatItIs.line1')}
        </motion.p>
        <motion.p
          style={{ opacity: opacity2, y: y2 }}
          className="text-3xl md:text-5xl lg:text-6xl font-bold text-[#ae5630] leading-tight mt-2"
        >
          {t('whatItIs.line2')}
        </motion.p>
        <motion.p
          style={{ opacity: opacity3, y: y3 }}
          className="mt-8 text-lg md:text-xl text-[#6b6a68] dark:text-[#9a9893] max-w-2xl mx-auto leading-relaxed"
        >
          {t('whatItIs.description')}
        </motion.p>
      </div>
    </section>
  );
}
