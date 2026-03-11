const { execSync } = require("child_process");
const fs = require("fs");

function stripProtocol(domain) {
  let urlString = domain.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }
  return new URL(urlString).host;
}

const rawDomain =
  process.env.REPLIT_INTERNAL_APP_DOMAIN ||
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.EXPO_PUBLIC_DOMAIN;

if (!rawDomain) {
  console.error(
    "ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN or REPLIT_DEV_DOMAIN"
  );
  process.exit(1);
}

const domain = stripProtocol(rawDomain);
console.log(`Building Expo web app for domain: ${domain}`);

if (fs.existsSync("dist")) {
  fs.rmSync("dist", { recursive: true });
}

execSync("npx expo export -p web --output-dir dist", {
  env: { ...process.env, EXPO_PUBLIC_DOMAIN: domain },
  stdio: "inherit",
});

console.log("Web build complete");
