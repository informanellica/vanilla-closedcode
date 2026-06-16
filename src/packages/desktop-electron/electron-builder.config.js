/** @file electron-builder configuration for the desktop app: resolves the release channel, builds the shared base config (files/asarUnpack/fuses/platform targets), and exports the channel-specific config. */
// Code signing is intentionally NOT configured here: this config stays
// certificate-free. Release signing is handled separately by the release
// tooling, so no certificate thumbprint is ever stored in this repository.
const channel = (() => {
  const raw = process.env.CLOSEDCODE_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  return "prod";
})();
// True when a real Apple signing identity is available. Adhoc-only builds
// must NOT enable hardenedRuntime / notarize / dmg signing — those require
// a Developer ID and fail (or produce a broken bundle) without one.
const hasMacIdentity = process.platform === "darwin" && Boolean(
  process.env.CSC_LINK || process.env.CSC_NAME || process.env.APPLE_TEAM_ID,
);
/**
 * Build the channel-independent electron-builder configuration shared by every
 * channel: packaged files, asar-unpacked native/ESM externals, Electron fuses,
 * extra resources (native bindings, docs, runtime icons), and per-platform
 * (mac/win/nsis/linux) targets and signing behavior.
 * @returns {Object} The base electron-builder config object.
 */
const getBase = () => ({
  artifactName: "vanilla-closedcode-${os}-${arch}.${ext}",
  directories: {
    output: "../../dist",
    buildResources: "resources"
  },
  // Build-less: include src/ (main + preload + renderer entry) alongside
  // out/ (static assets, workspace source trees, sidecar). The vcc:// resolver
  // serves renderer modules from src/ and out/ with import rewriting.
  files: ["out/**/*", "src/**/*", "resources/**/*"],
  // The sidecar bundle uses ESM dynamic imports + sibling .wasm files; those
  // don't survive being placed inside app.asar (asar's fs hook isn't invoked
  // for ESM dynamic imports), so keep the whole sidecar dir unpacked.
  //
  // The sidecar imports `@lydell/node-pty` and `web-tree-sitter` as externals
  // at runtime. Node's ESM resolver walks up from the sidecar's location
  // looking for `node_modules/<pkg>` and cannot traverse into the asar
  // archive, so both packages must live in `app.asar.unpacked/node_modules/`.
  asarUnpack: [
    "out/main/closedcode-server/**",
    "node_modules/@lydell/**",
    "node_modules/web-tree-sitter/**",
    // The shell tool's command parser also loads the bash/powershell grammars
    // via require.resolve(); like web-tree-sitter they can't be read from inside
    // the asar archive, so they must be unpacked too.
    "node_modules/tree-sitter-bash/**",
    "node_modules/tree-sitter-powershell/**",
    // The file-tree real-time watcher uses @parcel/watcher's native binding
    // (loaded at runtime); like the others it can't be read from inside asar,
    // so unpack it (and its platform-specific binary) too.
    "node_modules/@parcel/watcher*/**",
    // ORM externals: the sidecar bundle requires sequelize + sqlite3 at
    // runtime (sqlite3 loads its native .node via bindings). Like
    // node-pty/web-tree-sitter above, they and their runtime deps must live
    // in app.asar.unpacked/node_modules/ for the unpacked sidecar layout.
    "node_modules/sqlite3/**",
    "node_modules/bindings/**",
    "node_modules/file-uri-to-path/**",
    "node_modules/sequelize/**",
    "node_modules/{debug,ms,dottie,inflection,lodash,moment,moment-timezone,pg-connection-string,retry-as-promised,semver,sequelize-pool,toposort-class,uuid,validator,wkx}/**",
  ],
  electronFuses: {
    runAsNode: true,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: true,
    enableNodeCliInspectArguments: true,
    enableEmbeddedAsarIntegrityValidation: false,
    onlyLoadAppFromAsar: false,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false
  },
  extraResources: [{
    from: "native/",
    to: "native/",
    filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"]
  }, {
    from: "resources/docs/",
    to: "docs/",
    filter: ["**/*"]
  }, {
    // Runtime window/dock icon: windows.js iconPath() reads
    // process.resourcesPath/icons/icon.{ico,png}, which lives OUTSIDE app.asar.
    // Copy icons there so the running app's taskbar/window icon resolves
    // (otherwise it falls back to a stale/default icon).
    from: "resources/icons/",
    to: "icons/",
    filter: ["**/*"]
  }],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    // hardenedRuntime + notarize require a real Developer ID. Without one,
    // electron-builder will skip signing entirely (identity:null) which on
    // Apple Silicon leaves the bundle unrunnable. `identity:"-"` requests an
    // ad-hoc signature applied to every signable artefact — that's what the
    // kernel needs to load the binary even though it isn't notarized.
    identity: hasMacIdentity ? undefined : "-",
    hardenedRuntime: hasMacIdentity,
    notarize: hasMacIdentity,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    target: ["dmg", "zip"]
  },
  dmg: {
    sign: hasMacIdentity,
  },
  protocols: {
    name: "vanilla-closedcode",
    schemes: ["closedcode"]
  },
  win: {
    icon: `resources/icons/icon.ico`,
    // Unsigned by default (forceCodeSigning:false) so builds without a signing
    // certificate still produce a runnable exe. Release signing is added by the
    // separate release tooling at build time.
    forceCodeSigning: false,
    target: ["nsis"],
    verifyUpdateCodeSignature: false
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"]
  }
});
/**
 * Compose the final electron-builder config by extending the base config with
 * channel-specific identifiers (appId, productName, protocols, rpm packageName)
 * for the resolved CLOSEDCODE_CHANNEL.
 * @returns {Object} The fully resolved electron-builder config for the current channel.
 */
function getConfig() {
  const base = getBase();
  switch (channel) {
    case "dev":
      {
        return {
          ...base,
          appId: "local.vanilla-closedcode.dev",
          productName: "vanilla-closedcode",
          rpm: {
            packageName: "vanilla-closedcode"
          }
        };
      }
    case "beta":
      {
        return {
          ...base,
          appId: "local.vanilla-closedcode.beta",
          productName: "vanilla-closedcode",
          protocols: {
            name: "vanilla-closedcode",
            schemes: ["closedcode"]
          },
          rpm: {
            packageName: "vanilla-closedcode"
          }
        };
      }
    case "prod":
      {
        return {
          ...base,
          appId: "local.vanilla-closedcode",
          productName: "vanilla-closedcode",
          protocols: {
            name: "vanilla-closedcode",
            schemes: ["closedcode"]
          },
          rpm: {
            packageName: "vanilla-closedcode"
          }
        };
      }
  }
}
export default getConfig();