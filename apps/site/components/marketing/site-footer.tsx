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
