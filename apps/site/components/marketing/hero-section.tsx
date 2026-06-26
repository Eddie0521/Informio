'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { docsHref, marketingCopy } from '@/lib/marketing-copy';
import { APP_RELEASES_URL } from '@informio/brand/meta';

type HeroSectionProps = {
  locale: Locale;
};

export function HeroSection({ locale }: HeroSectionProps) {
  const copy = marketingCopy[locale].hero;
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden pt-16 md:pt-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 md:grid-cols-2 md:items-center md:gap-12 md:px-6 md:pb-24">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl"
        >
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--informio-text)] md:text-5xl lg:text-6xl lg:leading-[1.05]">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-[var(--informio-muted)] md:text-lg">
            {copy.subtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={APP_RELEASES_URL}
              className="inline-flex h-11 items-center rounded-full bg-[var(--informio-accent)] px-6 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-[var(--informio-accent-hover)]"
            >
              {copy.download}
            </a>
            <Link
              href={docsHref(locale)}
              className="inline-flex h-11 items-center rounded-full border border-[var(--informio-border)] bg-white px-6 text-sm font-medium text-[var(--informio-text)] transition active:scale-[0.98] hover:bg-[var(--informio-sidebar)]"
            >
              {copy.documentation}
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="overflow-hidden rounded-xl border border-[var(--informio-border)] bg-white shadow-[0_24px_80px_rgb(17_24_32_/_0.08)]">
            <Image
              src="/screenshots/hero.png"
              alt={locale === 'cn' ? 'Informio 界面预览' : 'Informio interface preview'}
              width={1600}
              height={1000}
              priority
              className="h-auto w-full"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
