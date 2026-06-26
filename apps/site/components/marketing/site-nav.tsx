'use client';

import { AppLogo } from '@/components/brand/app-logo';
import { MarketingNavLinks } from '@/components/marketing/marketing-nav-links';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { homeHref, marketingCopy, switchLocalePath } from '@/lib/marketing-copy';
import { APP_RELEASES_URL } from '@informio/brand/meta';

type SiteNavProps = {
  locale: Locale;
};

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
