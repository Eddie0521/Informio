'use client';

import {
  BookOpenText,
  FolderOpen,
  LockKey,
  MagnifyingGlass,
  Sparkle,
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';
import type { ComponentType } from 'react';

const icons = [FolderOpen, MagnifyingGlass, LockKey, Sparkle, BookOpenText] as Array<
  ComponentType<{ className?: string; weight?: 'regular' | 'bold' | 'fill' | 'duotone' | 'thin' | 'light' }>
>;

type FeaturesSectionProps = {
  locale: Locale;
};

export function FeaturesSection({ locale }: FeaturesSectionProps) {
  const copy = marketingCopy[locale].features;
  const reduceMotion = useReducedMotion();

  const spanClass = [
    'md:col-span-3 md:row-span-2',
    'md:col-span-3',
    'md:col-span-2',
    'md:col-span-2',
    'md:col-span-2',
  ];

  return (
    <section id="features" className="py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16, filter: 'blur(6px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
        >
          <span className="inline-block rounded-full bg-black/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--informio-muted)]">
            {locale === 'cn' ? '核心能力' : 'Capabilities'}
          </span>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
            {copy.title}
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-4 md:grid-cols-6 md:grid-rows-2 md:gap-5">
          {copy.items.map((item, index) => {
            const Icon = icons[index];

            return (
              <motion.article
                key={item.title}
                initial={reduceMotion ? false : { opacity: 0, y: 20, filter: 'blur(6px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, delay: index * 0.06, ease: [0.32, 0.72, 0, 1] }}
                className={`rounded-[1.5rem] bg-black/[0.02] p-1.5 ring-1 ring-black/[0.04] ${spanClass[index]}`}
              >
                <div className="flex h-full flex-col rounded-[calc(1.5rem-0.375rem)] bg-white p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] md:p-8">
                  <Icon className="h-5 w-5 text-[var(--informio-accent)]" weight="light" />
                  <h3 className="mt-5 text-lg font-medium tracking-tight">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--informio-muted)]">{item.body}</p>
                  {index === 0 && (
                    <div className="mt-auto pt-6">
                      <div className="h-32 rounded-xl bg-gradient-to-br from-emerald-50 to-transparent" />
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
