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

  return (
    <section id="features" className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h2>

        <div className="mt-10 grid gap-4 md:grid-cols-6 md:grid-rows-2 md:gap-5">
          {copy.items.map((item, index) => {
            const Icon = icons[index];
            const spanClass =
              index === 0
                ? 'md:col-span-3 md:row-span-2'
                : index === 1
                  ? 'md:col-span-3'
                  : index === 2
                    ? 'md:col-span-2'
                    : index === 3
                      ? 'md:col-span-2'
                      : 'md:col-span-2';

            const bgClass =
              index === 0
                ? 'bg-white'
                : index === 1
                  ? 'bg-[#f8fafc]'
                  : index === 4
                    ? 'bg-[linear-gradient(135deg,#f8fafc_0%,#ecfdf5_100%)]'
                    : 'bg-white';

            return (
              <motion.article
                key={item.title}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={`rounded-xl border border-[var(--informio-border)] p-6 ${spanClass} ${bgClass}`}
              >
                <Icon className="h-6 w-6 text-[var(--informio-accent)]" weight="duotone" />
                <h3 className="mt-4 text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--informio-muted)]">{item.body}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
