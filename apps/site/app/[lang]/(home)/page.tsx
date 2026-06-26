import type { Locale } from '@/lib/i18n';
import { AgentStrip } from '@/components/marketing/agent-strip';
import { DownloadSection } from '@/components/marketing/download-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { HeroSection } from '@/components/marketing/hero-section';
import { QuoteSection } from '@/components/marketing/quote-section';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteNav } from '@/components/marketing/site-nav';
import { WorkflowSection } from '@/components/marketing/workflow-section';

type HomePageProps = {
  params: Promise<{ lang: Locale }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { lang } = await params;

  return (
    <>
      <SiteNav locale={lang} />
      <main>
        <HeroSection locale={lang} />
        <AgentStrip locale={lang} />
        <FeaturesSection locale={lang} />
        <WorkflowSection locale={lang} />
        <QuoteSection locale={lang} />
        <DownloadSection locale={lang} />
      </main>
      <SiteFooter locale={lang} />
    </>
  );
}
