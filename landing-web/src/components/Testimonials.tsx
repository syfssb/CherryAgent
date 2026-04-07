import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

const TESTIMONIAL_KEYS = [
  'freelancer',
  'projectManager',
  'student',
  'salesPerson',
  'contentCreator'
] as const;

export default function Testimonials() {
  const { t } = useTranslation();

  return (
    <section id="testimonials" className="py-20 md:py-32 bg-[#f0eee6] dark:bg-[#1a1918]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold text-[#141413] dark:text-[#faf9f5] mb-4">
            {t('testimonials.title')}
          </h2>
          <p className="text-[#6b6a68] dark:text-[#9a9893] text-lg max-w-2xl mx-auto">
            {t('testimonials.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIAL_KEYS.map((key, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="p-6 bg-white dark:bg-[#3d3d3a] border border-[#1414131a] dark:border-[#faf9f51a] rounded-2xl shadow-[0_2px_2px_rgba(0,0,0,0.012),0_4px_4px_rgba(0,0,0,0.02),0_16px_24px_rgba(0,0,0,0.04)] hover:border-[#14141333] dark:hover:border-[#faf9f533] transition-all"
            >
              <div className="flex items-start gap-3 mb-4">
                <Quote className="text-[#ae5630]/50 flex-shrink-0" size={24} />
              </div>

              <p className="text-[#6b6a68] dark:text-[#9a9893] leading-relaxed mb-6 text-sm">
                {t(`testimonials.${key}.quote`)}
              </p>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#ae5630]/10 dark:bg-[#ae5630]/15 flex items-center justify-center text-[#ae5630] font-semibold">
                  {t(`testimonials.${key}.avatar`)}
                </div>
                <div>
                  <div className="text-[#141413] dark:text-[#faf9f5] font-semibold text-sm">
                    {t(`testimonials.${key}.name`)}
                  </div>
                  <div className="text-[#87867f] dark:text-[#6b6a68] text-xs">
                    {t(`testimonials.${key}.role`)}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
