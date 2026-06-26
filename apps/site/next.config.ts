import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@informio/brand'],
};

export default withMDX(nextConfig);
