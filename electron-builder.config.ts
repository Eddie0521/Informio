import type { Configuration } from "electron-builder";
import { APP_GITHUB_REPOSITORY, APP_ID, APP_NAME } from "./src/shared/appMeta";

const [githubOwner = "", githubRepo = ""] = APP_GITHUB_REPOSITORY.split("/");

const config: Configuration = {
  appId: APP_ID,
  productName: APP_NAME,
  directories: {
    output: "release",
    buildResources: "build"
  },
  files: ["out/**/*", "package.json"],
  asar: true,
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  publish: githubOwner && githubRepo
    ? [
        {
          provider: "github",
          owner: githubOwner,
          repo: githubRepo
        }
      ]
    : undefined,
  mac: {
    category: "public.app-category.productivity",
    icon: "build/icon.icns",
    target: ["dmg", "zip"],
    hardenedRuntime: true,
    notarize: true
  },
  dmg: {
    sign: true
  },
  win: {
    icon: "build/icon.ico",
    target: ["nsis"],
    signAndEditExecutable: true
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false
  }
};

export default config;
