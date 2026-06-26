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
    <section className="relative overflow-hidden pt-28 md:pt-36">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
          className="max-w-3xl"
        >
          <span className="inline-block rounded-full bg-black/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--informio-muted)]">
            {locale === 'cn' ? '本地优先 · AI 驱动' : 'Local-first · AI-native'}
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-[var(--informio-text)] md:text-6xl lg:text-7xl lg:leading-[1.02]">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-[55ch] text-lg leading-relaxed text-[var(--informio-muted)] md:text-xl">
            {copy.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href={APP_RELEASES_URL}
              className="group inline-flex h-12 items-center gap-3 rounded-full bg-[var(--informio-text)] pl-6 pr-2 text-sm font-medium text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] hover:bg-black/80"
            >
              {copy.download}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
                  <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
            <Link
              href={docsHref(locale)}
              className="inline-flex h-12 items-center rounded-full border border-black/[0.08] bg-white px-6 text-sm font-medium text-[var(--informio-text)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] hover:bg-black/[0.03]"
            >
              {copy.documentation}
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 32, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.32, 0.72, 0, 1] }}
          className="relative mt-16 md:mt-20"
        >
          <div className="rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/[0.04]">
            <div className="overflow-hidden rounded-[calc(2rem-0.5rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_24px_80px_-12px_rgba(0,0,0,0.08)]">
              <Image
                src="/screenshots/hero.png"
                alt={locale === 'cn' ? 'Informio 界面预览' : 'Informio interface preview'}
                width={1600}
                height={1000}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
