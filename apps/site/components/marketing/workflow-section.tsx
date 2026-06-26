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
    <section className="bg-[var(--informio-page-bg)] py-28 md:py-36">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 md:grid-cols-2 md:px-6">
        <div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16, filter: 'blur(6px)' }}
            whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          >
            <span className="inline-block rounded-full bg-black/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--informio-muted)]">
              {locale === 'cn' ? '工作流' : 'Workflow'}
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              {copy.title}
            </h2>
          </motion.div>

          <ol className="mt-12 space-y-10">
            {copy.steps.map((step, index) => (
              <motion.li
                key={step.title}
                initial={reduceMotion ? false : { opacity: 0, x: -16, filter: 'blur(4px)' }}
                whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: index * 0.1, ease: [0.32, 0.72, 0, 1] }}
                className="flex gap-5"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-xs font-medium text-[var(--informio-muted)]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium tracking-tight">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--informio-muted)]">{step.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }}
          whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="rounded-[2rem] bg-black/[0.03] p-2 ring-1 ring-black/[0.04]">
            <div className="overflow-hidden rounded-[calc(2rem-0.5rem)] bg-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_20px_60px_-12px_rgba(0,0,0,0.06)]">
              <Image
                src="/screenshots/editor.jpg"
                alt={locale === 'cn' ? 'Informio 编辑区预览' : 'Informio editor preview'}
                width={1400}
                height={900}
                className="h-auto w-full"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
