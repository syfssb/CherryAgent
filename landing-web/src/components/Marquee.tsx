import { useTranslation } from 'react-i18next';

const MODELS = [
  'Claude Haiku 4.5',
  'Claude Sonnet 4.6',
  'Claude Opus 4.6',
];

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...MODELS, ...MODELS];

  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      {/* Two identical strips side by side for seamless loop */}
      <div className={`flex shrink-0 gap-6 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
        {items.map((model, i) => (
          <div
            key={`a-${model}-${i}`}
            className="flex items-center gap-2 px-5 py-2.5 bg-carbon-850 border border-carbon-700 rounded-full text-sm text-sage-400 whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-accent-green" />
            {model}
          </div>
        ))}
      </div>
      <div className={`flex shrink-0 gap-6 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
        {items.map((model, i) => (
          <div
            key={`b-${model}-${i}`}
            className="flex items-center gap-2 px-5 py-2.5 bg-carbon-850 border border-carbon-700 rounded-full text-sm text-sage-400 whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-accent-green" />
            {model}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Marquee() {
  const { t } = useTranslation();

  return (
    <section className="py-16 overflow-hidden">
      <p className="text-center text-sm text-sage-400 mb-8 tracking-widest uppercase">
        {t('marquee.title')}
      </p>
      <div className="space-y-4">
        <MarqueeRow />
        <MarqueeRow reverse />
      </div>
    </section>
  );
}
