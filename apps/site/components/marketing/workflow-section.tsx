'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';

type WorkflowSectionProps = {
  locale: Locale;
};

export function WorkflowSection({ locale }: WorkflowSectionProps) {
  const copy = marketingCopy[locale].workflow;
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 md:grid-cols-2 md:items-center md:px-6">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{copy.title}</h2>
          <ol className="mt-10 space-y-8">
            {copy.steps.map((step, index) => (
              <motion.li
                key={step.title}
                initial={reduceMotion ? false : { opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="flex gap-4"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--informio-accent)_12%,white)] text-sm font-medium text-[var(--informio-accent)]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--informio-muted)]">{step.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.55 }}
          className="overflow-hidden rounded-xl border border-[var(--informio-border)] shadow-[0_20px_60px_rgb(17_24_32_/_0.06)]"
        >
          <Image
            src="/screenshots/editor.jpg"
            alt={locale === 'cn' ? 'Informio 编辑区预览' : 'Informio editor preview'}
            width={1400}
            height={900}
            className="h-auto w-full"
          />
        </motion.div>
      </div>
    </section>
  );
}
