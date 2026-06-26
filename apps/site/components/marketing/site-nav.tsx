'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { docsHref, homeHref, marketingCopy, switchLocalePath } from '@/lib/marketing-copy';
import { APP_RELEASES_URL } from '@informio/brand/meta';

type SiteNavProps = {
  locale: Locale;
};

export function SiteNav({ locale }: SiteNavProps) {
  const copy = marketingCopy[locale];
  const pathname = usePathname() ?? homeHref(locale);
  const docsPath = docsHref(locale);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--informio-border)] bg-[color-mix(in_srgb,var(--informio-surface)_92%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-6">
        <Link href={homeHref(locale)} className="flex items-center gap-2.5 font-semibold tracking-tight">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
          <span>Informio</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-[var(--informio-muted)] lg:flex">
          <a href="#features" className="transition-colors hover:text-[var(--informio-text)]">
            {copy.nav.features}
          </a>
          <a href="#agent" className="transition-colors hover:text-[var(--informio-text)]">
            {copy.nav.agent}
          </a>
          <Link href={docsPath} className="transition-colors hover:text-[var(--informio-text)]">
            {copy.nav.docs}
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher currentLocale={locale} pathname={pathname} />
          <a
            href={APP_RELEASES_URL}
            className="inline-flex h-9 items-center rounded-full bg-[var(--informio-accent)] px-4 text-sm font-medium text-white transition active:scale-[0.98] hover:bg-[var(--informio-accent-hover)]"
          >
            {copy.nav.download}
          </a>
        </div>
      </div>
    </header>
  );
}

function LocaleSwitcher({ currentLocale, pathname }: { currentLocale: Locale; pathname: string }) {
  const otherLocale: Locale = currentLocale === 'en' ? 'cn' : 'en';
  const label = otherLocale === 'cn' ? '中文' : 'EN';

  return (
    <Link
      href={switchLocalePath(currentLocale, otherLocale, pathname)}
      className="inline-flex h-9 items-center rounded-full border border-[var(--informio-border)] bg-white px-3 text-sm text-[var(--informio-muted)] transition hover:text-[var(--informio-text)]"
    >
      {label}
    </Link>
  );
}
