import type { Locale } from '@/lib/i18n';

export type MarketingCopy = {
  nav: {
    features: string;
    agent: string;
    docs: string;
    download: string;
  };
  hero: {
    title: string;
    subtitle: string;
    download: string;
    documentation: string;
  };
  agents: {
    title: string;
  };
  features: {
    title: string;
    items: Array<{ title: string; body: string }>;
  };
  workflow: {
    title: string;
    steps: Array<{ title: string; body: string }>;
  };
  quote: {
    text: string;
    author: string;
  };
  download: {
    title: string;
    body: string;
    cta: string;
    note: string;
  };
  footer: {
    docs: string;
    github: string;
    issues: string;
    source: string;
    license: string;
  };
};

export const marketingCopy: Record<Locale, MarketingCopy> = {
  en: {
    nav: {
      features: 'Features',
      agent: 'Agent',
      docs: 'Documentation',
      download: 'Download',
    },
    hero: {
      title: 'Write in place. Think with context.',
      subtitle:
        'A local-first Markdown cockpit for research notes, PDFs, and Agents that see your full workspace.',
      download: 'Download',
      documentation: 'Documentation',
    },
    agents: {
      title: 'Works with the Agents you already run locally',
    },
    features: {
      title: 'Built for writing first',
      items: [
        {
          title: 'Project-based',
          body: 'Add the folders you actually use. Files stay where they already live.',
        },
        {
          title: 'Focused',
          body: 'Review Markdown, PDF, images, and media in one workspace without context switching.',
        },
        {
          title: 'Safe',
          body: 'Local-first with no data collection. Lock sensitive notes behind a passphrase.',
        },
        {
          title: 'Simple',
          body: 'No database and no setup maze. Open Informio, add a project, start writing.',
        },
        {
          title: 'Research-friendly',
          body: 'Highlight PDFs, keep Markdown records, and let Agents read the full working context.',
        },
      ],
    },
    workflow: {
      title: 'Agent assistance stays adjacent to writing',
      steps: [
        {
          title: 'Select context',
          body: 'Start from selected text, the open document, or the project tree.',
        },
        {
          title: 'Choose your Agent',
          body: 'Pick Claude Code, Codex, or OpenCode from settings. Your local login carries over.',
        },
        {
          title: 'Work locally',
          body: 'Agents run on your machine with workspace context. Private notes stay out of view.',
        },
      ],
    },
    quote: {
      text: 'I write entirely to find out what I\'m thinking.',
      author: 'Joan Didion',
    },
    download: {
      title: 'Ready to write?',
      body: 'Download the latest build for macOS or Windows. Prefer fewer Gatekeeper prompts? Build from source.',
      cta: 'Download',
      note: 'macOS users: see the Gatekeeper guide in Documentation if the app is marked as damaged.',
    },
    footer: {
      docs: 'Documentation',
      github: 'GitHub',
      issues: 'Issues',
      source: 'Source available on GitHub',
      license: 'AGPL-3.0-only',
    },
  },
  cn: {
    nav: {
      features: '功能',
      agent: 'Agent',
      docs: '文档',
      download: '下载',
    },
    hero: {
      title: '就地写作，上下文思考',
      subtitle: '本地优先的 Markdown 工作台，整合研究笔记、PDF 与能看见完整工作区的 Agent。',
      download: '下载',
      documentation: '文档',
    },
    agents: {
      title: '兼容你本地已在运行的 Agent',
    },
    features: {
      title: '写作体验优先',
      items: [
        {
          title: '项目制',
          body: '添加你实际使用的文件夹，文件留在原来的位置。',
        },
        {
          title: '专注',
          body: '在一个工作区审阅 Markdown、PDF、图片与媒体，无需来回切换工具。',
        },
        {
          title: '安全',
          body: '本地优先，无数据收集。敏感笔记可用口令锁定。',
        },
        {
          title: '简单',
          body: '无数据库，无复杂引导。打开 Informio，导入项目，直接开始写作。',
        },
        {
          title: '适合研究整理',
          body: 'PDF 高亮、Markdown 记录、Agent 直接读取完整上下文。',
        },
      ],
    },
    workflow: {
      title: 'Agent 辅助紧贴写作，不喧宾夺主',
      steps: [
        {
          title: '选择上下文',
          body: '从选中文本、当前文档或项目树开始。',
        },
        {
          title: '选择 Agent',
          body: '在设置中选择 Claude Code、Codex 或 OpenCode，复用本地登录状态。',
        },
        {
          title: '本地执行',
          body: 'Agent 在你的机器上运行，读取工作区上下文，私人笔记保持不可见。',
        },
      ],
    },
    quote: {
      text: '我写作，完全是为了弄清自己在想什么。',
      author: 'Joan Didion',
    },
    download: {
      title: '准备好开始写作了吗？',
      body: '下载 macOS 或 Windows 最新版本。想减少 Gatekeeper 提示？可从源码自行打包。',
      cta: '下载',
      note: 'macOS 用户：若提示应用已损坏，请参阅文档中的 Gatekeeper 指南。',
    },
    footer: {
      docs: '文档',
      github: 'GitHub',
      issues: 'Issues',
      source: '源码托管于 GitHub',
      license: 'AGPL-3.0-only',
    },
  },
};

export function docsHref(locale: Locale) {
  return locale === 'en' ? '/docs' : `/${locale}/docs`;
}

export function homeHref(locale: Locale) {
  return locale === 'en' ? '/' : `/${locale}`;
}

export function switchLocalePath(currentLocale: Locale, targetLocale: Locale, pathname: string) {
  const withoutLocale = pathname.replace(/^\/(en|cn)/, '') || '/';
  if (targetLocale === 'en') {
    return withoutLocale === '/' ? '/' : withoutLocale;
  }
  return `/${targetLocale}${withoutLocale === '/' ? '' : withoutLocale}`;
}
