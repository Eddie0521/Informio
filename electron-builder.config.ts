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
  fileAssociations: [
    {
      ext: "md",
      name: "Markdown Document",
      description: "Markdown document",
      role: "Editor"
    },
    {
      ext: "markdown",
      name: "Markdown Document",
      description: "Markdown document",
      role: "Editor"
    },
    {
      ext: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
      name: "Image",
      description: "Image file",
      role: "Viewer"
    },
    {
      ext: ["mp4", "mov", "webm"],
      name: "Video",
      description: "Video file",
      role: "Viewer"
    },
    {
      ext: ["mp3", "wav", "m4a", "ogg"],
      name: "Audio",
      description: "Audio file",
      role: "Viewer"
    },
    {
      ext: "pdf",
      name: "PDF Document",
      description: "PDF document",
      role: "Viewer"
    }
  ],
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
    notarize: true,
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "Markdown Document",
          CFBundleTypeRole: "Editor",
          CFBundleTypeExtensions: ["md", "markdown"],
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["net.daringfireball.markdown"]
        }
      ]
    }
  },
  dmg: {
    sign: true
  },
  win: {
    icon: "build/icon.ico",
    target: ["nsis"],
    signAndEditExecutable: false
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false
  },
  linux: {
    category: "Office",
    icon: "build/icons",
    target: ["AppImage"]
  }
};

export default config;
