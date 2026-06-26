import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { i18n, isLocale } from '@/lib/i18n';
import { APP_NAME, APP_TAGLINE_CN, APP_TAGLINE_EN } from '@informio/brand/meta';
import { notFound } from 'next/navigation';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './../global.css';

const { provider } = defineI18nUI(i18n, {
  translations: {
    en: {
      displayName: 'English',
      search: 'Search documentation',
    },
    cn: {
      displayName: '中文',
      search: '搜索文档',
    },
  },
});

export async function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const description = lang === 'cn' ? APP_TAGLINE_CN : APP_TAGLINE_EN;

  return {
    title: {
      default: APP_NAME,
      template: `%s · ${APP_NAME}`,
    },
    description,
    icons: {
      icon: [{ url: '/icon.png', type: 'image/png', sizes: '32x32' }],
      apple: '/icon-512.png',
    },
  };
}

export default async function RootLayout({
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
    <html lang={lang === 'cn' ? 'zh-CN' : 'en'} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-[100dvh] bg-[var(--informio-page-bg)] font-sans text-[var(--informio-text)] antialiased">
        <RootProvider i18n={provider(lang)}>{children}</RootProvider>
      </body>
    </html>
  );
}
