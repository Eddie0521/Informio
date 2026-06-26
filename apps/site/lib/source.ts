import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';
import type { VirtualFile } from 'fumadocs-core/source';
import { i18n } from '@/lib/i18n';

const mdxSource = docs.toFumadocsSource() as unknown as {
  files: () => VirtualFile[];
};

export const source = loader({
  baseUrl: '/docs',
  i18n,
  source: {
    files: mdxSource.files(),
  },
});
