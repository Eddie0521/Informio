import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from '@/lib/i18n';
import { APP_GITHUB_URL, APP_NAME } from '@informio/brand/meta';

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    i18n,
    nav: {
      title: (
        <div className="flex items-center gap-2 font-semibold text-[var(--informio-text)]">
          <img src="/icon.svg" alt="" width={24} height={24} className="rounded-md" />
          {APP_NAME}
        </div>
      ),
    },
    links: [
      {
        text: 'GitHub',
        url: APP_GITHUB_URL,
        external: true,
      },
    ],
    themeSwitch: {
      enabled: false,
    },
  };
}
