'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';

type QuoteSectionProps = {
  locale: Locale;
};

export function QuoteSection({ locale }: QuoteSectionProps) {
  const copy = marketingCopy[locale].quote;
  const reduceMotion = useReducedMotion();

  return (
    <section className="py-28 md:py-36">
      <motion.blockquote
        initial={reduceMotion ? false : { opacity: 0, y: 20, filter: 'blur(8px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto max-w-4xl px-4 text-center md:px-6"
      >
        <p className="text-3xl font-medium leading-snug tracking-tight text-[var(--informio-text)] md:text-4xl lg:text-5xl">
          &ldquo;{copy.text}&rdquo;
        </p>
        <footer className="mt-8 text-sm text-[var(--informio-muted)]">{copy.author}</footer>
      </motion.blockquote>
    </section>
  );
}
