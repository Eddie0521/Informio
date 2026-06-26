import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { docsHref, homeHref, marketingCopy } from '@/lib/marketing-copy';
import { APP_GITHUB_URL, APP_ISSUES_URL } from '@informio/brand/meta';

type SiteFooterProps = {
  locale: Locale;
};

export function SiteFooter({ locale }: SiteFooterProps) {
  const copy = marketingCopy[locale].footer;

  return (
    <footer className="border-t border-[var(--informio-border)] bg-white py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" width={24} height={24} className="rounded-md" />
          <span className="font-medium">Informio</span>
        </div>

        <nav className="flex flex-wrap gap-5 text-sm text-[var(--informio-muted)]">
          <Link href={docsHref(locale)} className="hover:text-[var(--informio-text)]">
            {copy.docs}
          </Link>
          <a href={APP_GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-[var(--informio-text)]">
            {copy.github}
          </a>
          <a href={APP_ISSUES_URL} target="_blank" rel="noreferrer" className="hover:text-[var(--informio-text)]">
            {copy.issues}
          </a>
          <Link href={homeHref(locale)} className="hover:text-[var(--informio-text)]">
            {locale === 'cn' ? '首页' : 'Home'}
          </Link>
        </nav>

        <div className="text-sm text-[var(--informio-muted)]">
          <a href={APP_GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-[var(--informio-text)]">
            {copy.source}
          </a>
          <span className="mx-2">·</span>
          <span>{copy.license}</span>
        </div>
      </div>
    </footer>
  );
}
