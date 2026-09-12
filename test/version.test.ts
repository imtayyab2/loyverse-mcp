import { describe, expect, it } from "vitest";
import { SERVER_VERSION } from "../src/server.js";
import pkg from "../package.json" with { type: "json" };
import serverJson from "../server.json" with { type: "json" };

/**
 * The version is written in four places: package.json, the SERVER_VERSION the
 * MCP handshake reports, and twice inside server.json for the registry. They
 * drift silently, so pin them together.
 */
describe("version consistency", () => {
  it("reports the package version over the MCP handshake", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it("declares the same version to the MCP Registry", () => {
    expect(serverJson.version).toBe(pkg.version);
    for (const p of serverJson.packages) {
      expect(p.version, `${p.registryType} package entry`).toBe(pkg.version);
    }
  });

  it("points the bundle download at the matching release tag", () => {
    const mcpb = serverJson.packages.find((p) => p.registryType === "mcpb");
    expect(mcpb?.identifier).toContain(`/releases/download/v${pkg.version}/`);
  });

  it("ties the npm package to the registry listing for ownership checks", () => {
    expect(pkg.mcpName).toBe(serverJson.name);
    const npmPackage = serverJson.packages.find((p) => p.registryType === "npm");
    expect(npmPackage?.identifier).toBe(pkg.name);
  });
});
