import { source } from '@/lib/source';
import type { Metadata } from 'next';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { isLocale } from '@/lib/i18n';
import type { ComponentType } from 'react';

import type { TOCItemType } from 'fumadocs-core/toc';

type DocPageData = {
  body: ComponentType<{ components?: Record<string, unknown> }>;
  toc?: TOCItemType[];
  full?: boolean;
  title: string;
  description?: string;
};

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}) {
  const { lang, slug } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const page = source.getPage(slug, lang);

  if (!page) {
    notFound();
  }

  const data = page.data as DocPageData;
  const MDX = data.body;

  return (
    <DocsPage toc={data.toc} full={data.full}>
      <DocsTitle>{data.title}</DocsTitle>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;

  if (!isLocale(lang)) {
    return {};
  }

  const page = source.getPage(slug, lang);

  if (!page) {
    notFound();
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
