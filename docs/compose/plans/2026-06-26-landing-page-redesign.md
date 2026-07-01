# Landing Page Premium Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Informio's marketing landing page from generic template quality to Vercel/Linear-tier premium design using Soft Structuralism archetype.

**Architecture:** Pure CSS/component-level changes to existing Next.js marketing components. No new dependencies beyond `geist` font package. Each component is redesigned in-place following Double-Bezel card architecture, floating pill nav, and generous whitespace rhythm.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, motion/react, Geist font

## Global Constraints

- All transitions use `ease-[cubic-bezier(0.32,0.72,0,1)]` — no `linear` or default `ease-in-out`
- Section padding minimum `py-28 md:py-36` for macro-whitespace
- All cards use Double-Bezel: outer shell (`bg-black/[0.03] ring-1 ring-black/5 rounded-[2rem] p-1.5`) + inner core (white bg, `rounded-[calc(2rem-0.375rem)]`, inset shadow)
- Scroll entry animations: `translate-y-16 blur-md opacity-0` → resolved, duration 800ms+
- Mobile: all asymmetric layouts collapse to `w-full px-4` below 768px
- Only animate `transform` and `opacity` — no layout-triggering properties
- `backdrop-blur` only on fixed/sticky elements
- Banned: Inter, Roboto, Arial, standard borders, harsh shadows

---

### Task 1: Geist Font + Global CSS Foundation

**Files:**
- Modify: `apps/site/package.json`
- Modify: `apps/site/app/global.css`

**Interfaces:**
- Produces: `--informio-font-sans` updated to Geist, new utility classes available globally

- [ ] **Step 1: Install Geist font package**

```bash
cd apps/site && pnpm add geist
```

- [ ] **Step 2: Update global.css — import Geist and refine variables**

Replace the font imports and `:root` block in `apps/site/app/global.css`:

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';
@import 'lxgw-wenkai-webfont/lxgwwenkaimono-regular.css';
@import 'lxgw-wenkai-webfont/lxgwwenkaimono-bold.css';
@import 'geist/font/sans.css';
@import 'geist/font/mono.css';

@theme {
  --font-sans: var(--informio-font-sans);
  --font-mono: var(--informio-font-mono);
}

:root {
  --informio-font-en: 'Geist', system-ui, -apple-system, sans-serif;
  --informio-font-cn: 'LXGW WenKai Mono', '霞鹜文楷 Mono', ui-monospace, monospace;
  --informio-font-sans: var(--informio-font-en);
  --informio-font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --informio-accent: #059669;
  --informio-accent-hover: #047857;
  --informio-text: #0a0a0a;
  --informio-muted: #71717a;
  --informio-surface: #ffffff;
  --informio-page-bg: #fafafa;
  --informio-sidebar: #f8fafc;
  --informio-border: #e4e4e7;

  --fd-primary: #059669;
  --fd-primary-foreground: #ffffff;
  --fd-background: #ffffff;
  --fd-foreground: #0a0a0a;
  --fd-muted: #f8fafc;
  --fd-muted-foreground: #71717a;
  --fd-border: #e4e4e7;
  --fd-accent: #f8fafc;
  --fd-accent-foreground: #0a0a0a;
}

html:lang(zh-CN) {
  --informio-font-sans: var(--informio-font-cn);
  --informio-font-mono: var(--informio-font-cn);
}

html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::selection {
  background: rgb(5 150 105 / 0.18);
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/site && pnpm build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

---

### Task 2: SiteNav → Floating Glass Pill

**Files:**
- Modify: `apps/site/components/marketing/site-nav.tsx`

**Interfaces:**
- Consumes: same props `{ locale: Locale }`
- Produces: visually transformed floating pill nav, fixed position

- [ ] **Step 1: Rewrite SiteNav component**

Replace the entire `SiteNav` function in `apps/site/components/marketing/site-nav.tsx`:

```tsx
export function SiteNav({ locale }: SiteNavProps) {
  const copy = marketingCopy[locale];
  const pathname = usePathname() ?? homeHref(locale);
  const home = homeHref(locale);

  return (
    <header className="fixed top-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-6 rounded-full border border-white/60 bg-white/80 px-5 py-2.5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <Link href={home} className="flex shrink-0 items-center gap-2 font-medium tracking-tight">
          <AppLogo size={24} />
          <span className="text-sm">Informio</span>
        </Link>

        <div className="hidden h-4 w-px bg-black/[0.08] md:block" />

        <MarketingNavLinks locale={locale} className="hidden md:flex" />

        <div className="flex items-center gap-2">
          <LocaleSwitcher currentLocale={locale} pathname={pathname} />
          <a
            href={APP_RELEASES_URL}
            className="inline-flex h-8 items-center rounded-full bg-[var(--informio-text)] px-4 text-xs font-medium text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] hover:bg-black/80"
          >
            {copy.nav.download}
          </a>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Update LocaleSwitcher styling**

Replace the `LocaleSwitcher` function:

```tsx
function LocaleSwitcher({ currentLocale, pathname }: { currentLocale: Locale; pathname: string }) {
  const otherLocale: Locale = currentLocale === 'en' ? 'cn' : 'en';
  const label = otherLocale === 'cn' ? '中文' : 'EN';

  return (
    <Link
      href={switchLocalePath(currentLocale, otherLocale, pathname)}
      className="inline-flex h-8 items-center rounded-full bg-black/[0.04] px-2.5 text-xs font-medium text-[var(--informio-muted)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-black/[0.08] hover:text-[var(--informio-text)]"
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 3: HeroSection → Editorial Split with Double-Bezel

**Files:**
- Modify: `apps/site/components/marketing/hero-section.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, marketingCopy, APP_RELEASES_URL
- Produces: redesigned hero with massive typography + Double-Bezel screenshot

- [ ] **Step 1: Rewrite HeroSection**

Replace the entire component in `apps/site/components/marketing/hero-section.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 4: FeaturesSection → Asymmetrical Bento with Double-Bezel

**Files:**
- Modify: `apps/site/components/marketing/features-section.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, marketingCopy features data, Phosphor icons
- Produces: asymmetrical bento grid with Double-Bezel cards

- [ ] **Step 1: Rewrite FeaturesSection**

Replace the entire component in `apps/site/components/marketing/features-section.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 5: AgentStrip → Minimal Separator

**Files:**
- Modify: `apps/site/components/marketing/agent-strip.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, agents data
- Produces: borderless agent strip with subtle visual separation

- [ ] **Step 1: Rewrite AgentStrip**

Replace the section JSX in `apps/site/components/marketing/agent-strip.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 6: WorkflowSection → Refined with Double-Bezel

**Files:**
- Modify: `apps/site/components/marketing/workflow-section.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, marketingCopy workflow data
- Produces: cleaner workflow section with Double-Bezel screenshot

- [ ] **Step 1: Rewrite WorkflowSection**

Replace the entire component in `apps/site/components/marketing/workflow-section.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 7: QuoteSection + DownloadSection → Premium Spacing

**Files:**
- Modify: `apps/site/components/marketing/quote-section.tsx`
- Modify: `apps/site/components/marketing/download-section.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, marketingCopy quote/download data
- Produces: refined quote and download sections

- [ ] **Step 1: Rewrite QuoteSection**

Replace the entire component in `apps/site/components/marketing/quote-section.tsx`:

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { Locale } from '@/lib/i18n';
import { marketingCopy } from '@/lib/marketing-copy';

type QuoteSectionProps = {
  locale: Locale;
};

export function QuoteSection({ locale }: QuoteSectionProps) {
  const copy = marketingCopy[locale].quote;
  const reduceMotion = useReducedMotion();

  return (
    <section className="py-28 md:py-36">
      <motion.blockquote
        initial={reduceMotion ? false : { opacity: 0, y: 20, filter: 'blur(8px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto max-w-4xl px-4 text-center md:px-6"
      >
        <p className="text-3xl font-medium leading-snug tracking-tight text-[var(--informio-text)] md:text-4xl lg:text-5xl">
          &ldquo;{copy.text}&rdquo;
        </p>
        <footer className="mt-8 text-sm text-[var(--informio-muted)]">{copy.author}</footer>
      </motion.blockquote>
    </section>
  );
}
```

- [ ] **Step 2: Rewrite DownloadSection**

Replace the entire component in `apps/site/components/marketing/download-section.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 8: SiteFooter → Minimal

**Files:**
- Modify: `apps/site/components/marketing/site-footer.tsx`

**Interfaces:**
- Consumes: `{ locale: Locale }`, marketingCopy footer data
- Produces: cleaner, more minimal footer

- [ ] **Step 1: Rewrite SiteFooter**

Replace the entire component in `apps/site/components/marketing/site-footer.tsx`:

```tsx
import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';
import type { Locale } from '@/lib/i18n';
import { docsHref, homeHref, marketingCopy } from '@/lib/marketing-copy';
import { APP_GITHUB_URL, APP_ISSUES_URL } from '@informio/brand/meta';

type SiteFooterProps = {
  locale: Locale;
};

export function SiteFooter({ locale }: SiteFooterProps) {
  const copy = marketingCopy[locale].footer;

  return (
    <footer className="border-t border-black/[0.06] py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-2.5">
          <AppLogo size={22} className="rounded-md" />
          <span className="text-sm font-medium">Informio</span>
        </div>

        <nav className="flex flex-wrap gap-6 text-sm text-[var(--informio-muted)]">
          <Link href={docsHref(locale)} className="transition-colors duration-300 hover:text-[var(--informio-text)]">
            {copy.docs}
          </Link>
          <a href={APP_GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors duration-300 hover:text-[var(--informio-text)]">
            {copy.github}
          </a>
          <a href={APP_ISSUES_URL} target="_blank" rel="noreferrer" className="transition-colors duration-300 hover:text-[var(--informio-text)]">
            {copy.issues}
          </a>
          <Link href={homeHref(locale)} className="transition-colors duration-300 hover:text-[var(--informio-text)]">
            {locale === 'cn' ? '首页' : 'Home'}
          </Link>
        </nav>

        <div className="text-xs text-[var(--informio-muted)]">
          <a href={APP_GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors duration-300 hover:text-[var(--informio-text)]">
            {copy.source}
          </a>
          <span className="mx-2 text-black/15">·</span>
          <span>{copy.license}</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/site && npx tsc --noEmit 2>&1 | head -20
```

---

### Task 9: Build Verification + Dev Preview

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

```bash
cd apps/site && pnpm build 2>&1 | tail -30
```

Expected: Build completes successfully.

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/site && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Start dev server for visual verification**

```bash
cd apps/site && pnpm dev
```

Visit `http://localhost:3001` and verify:
- Nav is floating pill, centered, glass effect
- Hero has massive typography + Double-Bezel screenshot
- Features are asymmetrical bento grid
- All animations are smooth with blur entry
- Mobile responsive below 768px
