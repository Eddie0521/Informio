'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { docsHref, marketingCopy } from '@/lib/marketing-copy';
import { APP_RELEASES_URL } from '@informio/brand/meta';

type DownloadSectionProps = {
  locale: Locale;
};

export function DownloadSection({ locale }: DownloadSectionProps) {
  const copy = marketingCopy[locale].download;
  const reduceMotion = useReducedMotion();

  return (
    <section className="py-20 md:py-24">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-3xl rounded-2xl border border-[var(--informio-border)] bg-white px-6 py-12 text-center md:px-10"
      >
        <h2 className="text-3xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--informio-muted)] md:text-base">
          {copy.body}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href={APP_RELEASES_URL}
            className="inline-flex h-11 items-center rounded-full bg-[var(--informio-accent)] px-8 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-[var(--informio-accent-hover)]"
          >
            {copy.cta}
          </a>
          <p className="max-w-md text-xs leading-relaxed text-[var(--informio-muted)]">
            {copy.note}{' '}
            <Link href={`${docsHref(locale)}/getting-started/macos-gatekeeper`} className="text-[var(--informio-accent)] hover:underline">
              {locale === 'cn' ? '查看指南' : 'Read the guide'}
            </Link>
          </p>
        </div>
      </motion.div>
    </section>
  );
}
