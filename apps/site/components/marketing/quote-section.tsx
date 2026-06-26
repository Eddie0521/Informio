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
    <section className="py-16 md:py-20">
      <motion.blockquote
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-3xl px-4 text-center md:px-6"
      >
        <p className="text-2xl font-medium leading-snug tracking-tight text-[var(--informio-text)] md:text-3xl">
          “{copy.text}”
        </p>
        <footer className="mt-4 text-sm text-[var(--informio-muted)]">{copy.author}</footer>
      </motion.blockquote>
    </section>
  );
}
