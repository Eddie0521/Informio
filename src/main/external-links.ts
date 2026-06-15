const EXTERNAL_WEBSITE_PROTOCOLS = new Set(["http:", "https:"]);

export const normalizeExternalWebsiteUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (!EXTERNAL_WEBSITE_PROTOCOLS.has(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
};

export const isExternalWebsiteUrl = (value: string): boolean => normalizeExternalWebsiteUrl(value) !== null;
