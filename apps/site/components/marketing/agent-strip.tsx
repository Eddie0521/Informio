'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';

const agents = [
  { name: 'Claude', slug: 'anthropic', href: 'https://www.anthropic.com/claude-code' },
  { name: 'Codex', slug: 'openai', href: 'https://openai.com/codex/' },
  { name: 'OpenCode', slug: 'opencode', href: 'https://opencode.ai/' },
] as const;

type AgentStripProps = {
  locale: Locale;
};

export function AgentStrip({ locale }: AgentStripProps) {
  const copy = marketingCopy[locale].agents;
  const reduceMotion = useReducedMotion();

  return (
    <section id="agent" className="border-y border-[var(--informio-border)] bg-white py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center text-sm text-[var(--informio-muted)]"
        >
          {copy.title}
        </motion.p>
        <div className="flex flex-wrap items-center justify-center gap-10 md:gap-14">
          {agents.map((agent, index) => (
            <motion.a
              key={agent.name}
              href={agent.href}
              target="_blank"
              rel="noreferrer"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
              className="opacity-70 transition hover:opacity-100"
              aria-label={agent.name}
            >
              <img
                src={`https://cdn.simpleicons.org/${agent.slug}/64748b`}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
              />
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
