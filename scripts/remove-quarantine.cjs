const { execSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

exports.default = async function afterPack(context) {
  if (process.platform !== "darwin") return;
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!existsSync(appPath)) return;
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: "ignore" });
    console.log(`✓ Removed quarantine attribute from ${appPath}`);
  } catch {
    // xattr may not be available in all environments, ignore
  }
};
