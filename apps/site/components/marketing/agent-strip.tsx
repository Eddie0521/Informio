'use client';

import { motion, useReducedMotion } from 'motion/react';
import { siAnthropic, siOpencode } from 'simple-icons';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';
import { BrandIcon } from '@/components/marketing/brand-icon';

const agents = [
  {
    name: 'Claude',
    href: 'https://www.anthropic.com/claude-code',
    render: () => <BrandIcon icon={siAnthropic} label="Claude" />,
  },
  {
    name: 'Codex',
    href: 'https://openai.com/codex/',
    render: () => (
      <svg
        role="img"
        aria-label="Codex"
        viewBox="0 0 24 24"
        width={28}
        height={28}
        className="text-[var(--informio-muted)]"
        fill="currentColor"
      >
        <title>Codex</title>
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.747-7.073zm-9.022 12.608a4.476 4.476 0 0 1-2.876-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.681V9.131l2.02 1.169a.071.071 0 0 1 .038.053v5.582a4.504 4.504 0 0 1-4.495 4.494zm-9.661-4.125a4.471 4.471 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .781 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.814 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.386 2.015-1.164a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.677 8.104v-5.677a.79.79 0 0 0-.406-.668zm2.01-3.023-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.499 4.499 0 0 1 6.68 4.66zM8.306 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.499 4.499 0 0 1 7.376-3.454l-.142.08L8.704 5.459a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
  },
  {
    name: 'OpenCode',
    href: 'https://opencode.ai/',
    render: () => <BrandIcon icon={siOpencode} label="OpenCode" />,
  },
] as const;

type AgentStripProps = {
  locale: Locale;
};

export function AgentStrip({ locale }: AgentStripProps) {
  const copy = marketingCopy[locale].agents;
  const reduceMotion = useReducedMotion();

  return (
    <section id="agent" className="py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="mb-10 text-center text-xs font-medium uppercase tracking-[0.2em] text-[var(--informio-muted)]"
        >
          {copy.title}
        </motion.p>
        <div className="flex flex-wrap items-center justify-center gap-12 md:gap-16">
          {agents.map((agent, index) => (
            <motion.a
              key={agent.name}
              href={agent.href}
              target="_blank"
              rel="noreferrer"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: [0.32, 0.72, 0, 1] }}
              className="text-[var(--informio-muted)]/50 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[var(--informio-muted)]"
              aria-label={agent.name}
            >
              {agent.render()}
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
