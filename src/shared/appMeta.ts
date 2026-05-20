const resolveGithubRepository = () => {
  const direct = process.env.INFORMIO_GITHUB_REPOSITORY?.trim() || process.env.GITHUB_REPOSITORY?.trim() || "";
  if (direct) return direct.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");

  const owner = process.env.INFORMIO_GITHUB_OWNER?.trim() || "";
  const repo = process.env.INFORMIO_GITHUB_REPO?.trim() || "";
  return owner && repo ? `${owner}/${repo}` : "";
};

export const APP_NAME = "Informio";
export const APP_ID = "com.informio.app";
export const APP_GITHUB_REPOSITORY = resolveGithubRepository();
export const APP_GITHUB_URL = APP_GITHUB_REPOSITORY ? `https://github.com/${APP_GITHUB_REPOSITORY}` : "";
