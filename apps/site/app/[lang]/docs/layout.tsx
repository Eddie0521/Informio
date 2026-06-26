import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import Link from 'next/link';
import { baseOptions } from '@/lib/layout.shared';
import { isLocale } from '@/lib/i18n';
import { source } from '@/lib/source';
import { homeHref } from '@/lib/marketing-copy';
import { notFound } from 'next/navigation';

export default async function DocsRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  return (
    <DocsLayout
      tree={source.getPageTree(lang)}
      {...baseOptions(lang)}
      sidebar={{
        tabs: {
          transform(option, node) {
            if (!node.icon) return option;
            return {
              ...option,
              icon: <span className="text-[var(--informio-accent)]">{node.icon}</span>,
            };
          },
        },
      }}
      nav={{
        ...baseOptions(lang).nav,
        children: (
          <div className="flex items-center gap-3">
            <Link
              href={homeHref(lang)}
              className="text-sm text-[var(--informio-muted)] transition hover:text-[var(--informio-text)]"
            >
              {lang === 'cn' ? '返回首页' : 'Back to home'}
            </Link>
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
