/**
 * Builds the MCP Bundle staging directory at bundle/.
 *
 * The server is bundled into a single file so the .mcpb carries no
 * node_modules tree, and the tool list in the manifest is generated from the
 * registry so it cannot drift from what the server actually exposes.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// Single place for the public URLs the manifest and review both depend on.
const REPO = "https://github.com/imtayyab2/loyverse-mcp";
const URLS = {
  repository: `${REPO}.git`,
  homepage: REPO,
  documentation: `${REPO}#readme`,
  support: `${REPO}/issues`,
  privacy: [`${REPO}#privacy-policy`, "https://loyverse.com/privacy-policy"],
};

rmSync("bundle", { recursive: true, force: true });
mkdirSync("bundle/server", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "bundle/server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  sourcemap: false,
  // ESM output needs these shims because some dependencies reach for CJS globals.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});

const { tools } = await import("../dist/registry.js");

const manifest = {
  manifest_version: "0.3",
  name: "loyverse",
  display_name: "Loyverse",
  version: pkg.version,
  description: pkg.description,
  long_description:
    "Read and manage a Loyverse point-of-sale account: catalogue, stock, customers, " +
    "receipts, shifts and webhooks. Includes a sales summary that aggregates a date " +
    "range into totals and a ranked breakdown by day, item, category, payment type, " +
    "employee or store in a single call, rather than paging through raw receipts.\n\n" +
    "Unofficial and not affiliated with Loyverse. Requires a Loyverse account and an " +
    "access token, created in the back office under Settings then Access tokens.\n\n" +
    "Note two limits of the Loyverse API itself: sales history stops at 31 days " +
    "without the Unlimited Sales History add-on, and receipts created through the API " +
    "can carry only one payment type.",
  author: {
    name: "Tayyab Sarwar",
    url: "https://github.com/imtayyab2",
  },
  icon: "icon.png",
  repository: { type: "git", url: URLS.repository },
  homepage: URLS.homepage,
  documentation: URLS.documentation,
  support: URLS.support,
  license: pkg.license,
  keywords: ["loyverse", "pos", "point of sale", "retail", "hospitality", "sales", "inventory"],
  privacy_policies: URLS.privacy,
  server: {
    type: "node",
    entry_point: "server/index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server/index.js"],
      env: {
        LOYVERSE_ACCESS_TOKEN: "${user_config.access_token}",
      },
    },
  },
  user_config: {
    access_token: {
      type: "string",
      title: "Loyverse access token",
      description:
        "Create one in the Loyverse back office under Settings > Access tokens. It grants full access to the account, so treat it as a password.",
      required: true,
      sensitive: true,
    },
  },
  tools: tools.map((t) => ({ name: t.name, description: t.description })),
  tools_generated: false,
  compatibility: {
    platforms: ["darwin", "win32", "linux"],
    runtimes: { node: ">=20.0.0" },
  },
};

writeFileSync("bundle/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
cpSync("assets/icon.png", "bundle/icon.png");
cpSync("README.md", "bundle/README.md");
cpSync("LICENSE", "bundle/LICENSE");

const readOnly = tools.filter((t) => t.annotations.readOnlyHint).length;
console.log(
  `bundle/ staged: ${tools.length} tools (${readOnly} read-only, ` +
    `${tools.filter((t) => t.annotations.destructiveHint).length} destructive)`,
);
