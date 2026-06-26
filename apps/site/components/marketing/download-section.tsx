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
    <section className="py-28 md:py-36">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto max-w-3xl rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/[0.04]"
      >
        <div className="rounded-[calc(2rem-0.5rem)] bg-white px-6 py-16 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] md:px-10">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[var(--informio-muted)] md:text-base">
            {copy.body}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <a
              href={APP_RELEASES_URL}
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[var(--informio-text)] pl-6 pr-2 text-sm font-medium text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] hover:bg-black/80"
            >
              {copy.cta}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
            <p className="max-w-md text-xs leading-relaxed text-[var(--informio-muted)]">
              {copy.note}{' '}
              <Link href={`${docsHref(locale)}/getting-started/macos-gatekeeper`} className="text-[var(--informio-accent)] hover:underline">
                {locale === 'cn' ? '查看指南' : 'Read the guide'}
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
