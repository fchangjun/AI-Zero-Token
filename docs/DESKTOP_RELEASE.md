# AI Zero Token Desktop Release

This project ships the desktop app with Electron. The desktop main process starts the existing local Fastify gateway and loads the React management UI served by that gateway.

## macOS in-app updates (2.0.16+)

Installed macOS builds check the official GitHub latest stable release 10 seconds after startup and every 30 minutes while running, including when the main window is closed. The tray menu and management UI also provide **Check for updates**. A new version produces an in-app panel and a native notification (subject to macOS notification settings). Checks do not download or install automatically.

The user chooses **Download update**, sees progress, and can cancel during download. After verification and staging, **Install and restart** quits the app through the existing gateway shutdown flow. Accounts, settings, Codex configuration and usage data remain in their existing user directories. The gateway is briefly unavailable during installation/restart.

### Packaging and release requirements

- Continue to use `npm run dist:mac`. Keep ad-hoc signing and `hardenedRuntime: false` in both existing signing locations.
- The updater uses the existing `AI Zero Token-{version}-mac-{arm64|x64}.dmg` assets. GitHub's dotted filename normalization is supported. No mac ZIP, blockmap, or `latest-mac.yml` is required for this custom updater.
- Publish a stable `vX.Y.Z` GitHub Release with both DMGs fully uploaded. The matching asset must expose `state: uploaded`, a positive size, and `digest: sha256:…` through the GitHub Releases API. The uploader does not need an additional manifest. If GitHub has not supplied a digest, the UI offers manual installation and refuses automatic installation.
- The updater only accepts downloads from this repository over HTTPS and redirects to GitHub's release CDN. It compares the downloaded byte count and SHA-256 with the authenticated HTTPS API response, then verifies the DMG, bundle ID, version, executable name, CPU architecture, and ad-hoc signatures of the app/Electron Framework. Hardened Runtime must remain disabled. Trust rests on the official GitHub repository and HTTPS; this is not Apple publisher authentication.
- The build copies `preload.cjs` and `mac-update-helper.sh` into `dist/desktop/`; both must be present in `app.asar`. The main process copies the helper into a private update directory before executing it, so replacement cannot remove the running helper.
- Existing users must manually install a version containing this updater once. Development runs (`electron .`), the browser console, npm/CLI, and Windows retain their existing manual update flow.

### Installation and recovery

The app must run from a writable local installation directory. Running from a DMG, App Translocation, or a symlink is refused; the UI links to manual installation. The updater does not elevate privileges, remove quarantine attributes, or change Gatekeeper settings. macOS may still require user action for an unnotarized app; if startup cannot complete, the previous app is restored.

The new app is staged in a private `.azt-update-*` sibling directory on the same filesystem. The helper waits up to five minutes for the old process to exit, renames the old app to `previous.app`, moves the verified new app into place, and launches its executable. Only the expected app version/path, launched with the transaction's random token, can acknowledge startup. The React workspace sends that acknowledgement after the gateway configuration has loaded. The helper allows 90 seconds for this acknowledgement. A failed launch or missing acknowledgement terminates that specific new process and restores/relaunches the previous app. Once acknowledged, the helper deletes the old bundle and downloaded DMG.

Update logs and `pending.json` are in the Electron user-data directory's `updates/` folder (normally `~/Library/Application Support/AI Zero Token/updates/`). Each `job-*` contains `install.log`, `relaunch.log`, and a `result` file. The pending record identifies the exact installation/staging paths. If interrupted recovery leaves `previous.app`, automatic installation stops and preserves it. After all related app/update processes have exited, restore that bundle to the recorded target path, or install the official DMG manually; remove the pending record only after recovery. Power loss during the two renames can require this manual recovery. Data-format migrations are outside the bundle rollback and must remain backward-compatible.

### Verification

```bash
npm run typecheck
npm run build
bun test --preload ./tests/setup.ts ./tests/desktop-updater.test.ts ./tests/mac-update-helper.test.ts ./tests/version-service.test.ts
npm run pack:dry
npm run dist:mac
```

The helper tests operate only on disposable app fixtures. They cover waiting for the original process, successful acknowledgement, crashes, missing/incorrect acknowledgement, replacement failure, rollback/relaunch, literal special characters in paths, and preservation of unrelated paths. Release acceptance should additionally perform an installed-version-to-newer-release update on both Apple Silicon and Intel with SIP enabled, including a Gatekeeper-restricted installation and a non-writable target.

## 2.0.14 Release Notes

Version `2.0.14` fixes macOS startup on standard SIP-enabled Macs:

- Hardened Runtime is disabled throughout the ad-hoc macOS packaging pipeline so `dyld` does not reject Electron Framework for lacking a Developer ID Team ID.
- The packaging script now verifies both the main app and Electron Framework and fails if Hardened Runtime is accidentally reintroduced.
- Apple Silicon and Intel packages continue to use verified ad-hoc signatures and HFS+ DMG images.

## 2.0.13 Release Notes

Version `2.0.13` adds a bilingual management experience and a safer external-provider workflow for Codex:

- The desktop management console now supports Simplified Chinese and English with a persistent language switcher and locale-aware formatting.
- External OpenAI-compatible providers can be discovered and verified automatically through streamed Responses, function-call round trips, and reasoning-effort probes.
- Verified models are written to a managed Codex model catalog, while URL-scoped inspection history enables safe cached reconnects without sharing tokens or model results across endpoints.
- Disconnecting restores the previous Codex model, provider, and model-catalog settings while retaining an inactive compatibility definition for existing conversations unless the user explicitly purges it.
- OpenAI-compatible chat requests now preserve `minimal` and `xhigh` reasoning effort values.

## 2.0.12 Release Notes

Version `2.0.12` improves Codex diagnostics, compatibility, and desktop packaging:

- Codex request diagnostics are now saved in separate local files and can be viewed or cleared from the request logs page.
- Codex streaming responses are saved as compact summaries by default, with optional full SSE protocol capture for deep debugging.
- Settings exposes Codex serialization delay/jitter and diagnostic capture controls.
- Legacy Codex Desktop requests that still send `gpt-5.4` are rewritten to the current default model when needed, while logs keep the requested/effective model details.
- Codex provider setup now supports external OpenAI-compatible API base URLs and bearer tokens.
- macOS release packaging now creates HFS+ DMGs from ad-hoc hardened-runtime signed app bundles and includes clearer Gatekeeper quarantine guidance.

## 2.0.11 Release Notes

Version `2.0.11` improves Codex account import compatibility and native Codex traffic stability:

- Account JSON import now accepts sub2api-style records without a real `chatgpt_account_id` by creating gateway-only identities from user id, JWT subject, email, or token hash.
- Gateway-only imported accounts are blocked from local Codex application, with an account-card info icon explaining the reason on hover.
- Local Codex `auth.json` writes and `ChatGPT-Account-Id` headers now use only real Codex account ids, preventing fallback identities from being misapplied.
- Codex request serialization can be configured with a minimum delay and jitter to reduce bursty per-account upstream traffic.
- Manual OAuth fallback stays inside the account modal and waits up to three minutes for the automatic callback before asking for a pasted URL or code.

## 2.0.10 Release Notes

Version `2.0.10` improves OAuth login recovery and Codex auth freshness:

- Desktop OAuth login can continue with a pasted callback URL or authorization code when automatic callback capture times out.
- The local OAuth callback listener binds both IPv4 and IPv6 loopback addresses for browser redirect compatibility.
- Applying an account to local Codex refreshes the profile first so the written `auth.json` includes a current `id_token`.
- Saved `id_token` values are checked for expiry and account identity before use.

## 2.0.9 Release Notes

Version `2.0.9` clarifies automatic account rotation eligibility and tightens Codex auth refresh handling:

- Settings now separates manually excluded accounts from accounts that are runtime-ineligible because login is unavailable or quota is exhausted.
- Account filters and stats distinguish configured rotation participation from the actual automatic rotation candidate pool.
- Refreshed Codex tokens preserve account identity metadata when upstream token payloads omit profile claims.
- Saved profiles validate `id_token` expiry before Codex image and web flows use them, with clearer recovery messaging when a fresh `id_token` is unavailable.

## 2.0.6 Release Notes

Version `2.0.6` adds Free-account image routing controls and local usage/account statistics:

- Opt-in Free-account ChatGPT web image route for API image requests and Codex `image_generation` tool requests.
- Red Settings warning for Free-account image risk and limited quota.
- Persistent local usage statistics for today, current process, lifetime totals, daily trend, and account/model/endpoint/error/source breakdowns.
- Account-management statistics strip with clickable filters for availability, plan, active status, login/auth state, quota exhaustion, and auto-switch inclusion.
- Filtered-result bulk selection controls for batch account operations.
- Clearer usage labels that separate known upstream-returned token totals from requests that did not return usage metadata.

## 2.0.5 Release Notes

Version `2.0.5` adds Codex custom provider routing and finer account rotation controls:

- Settings-page Codex provider setup for writing or removing the AI Zero Token managed `~/.codex/config.toml` provider.
- Local and remote Codex gateway URL modes, including automatic normalization to `/codex/v1`.
- Dedicated `POST /codex/v1/responses` passthrough route for Codex CLI/Desktop Responses SSE traffic.
- Provider status reporting in the management console, including active provider, base URL, and config path.
- Auto-switch exclusion list for accounts that should not participate in automatic quota rotation.
- Safer settings persistence through normalized loads, deduplicated profile IDs, queued saves, and atomic writes.

## 2.0.4 Release Notes

Version `2.0.4` adds the macOS menu-bar account panel and OpenClaw compatibility work:

- Menu-bar quick account panel for switching gateway/Codex accounts.
- Menu actions for quota refresh, Base URL copy, console open, gateway restart, and quit.
- Desktop Codex restart hook after applying an account to local Codex.
- OpenClaw-compatible `chat.completions` streaming and tool-call fields.
- Real gateway request log entries for recent API traffic.

## 2.0.0 Release Notes

Version `2.0.0` is the first desktop-focused major release. It includes:

- Electron desktop packaging for macOS and Windows.
- The embedded React management UI under `admin-ui/`.
- Desktop launch, overview, account, tester, docs, network, logs, and settings pages.
- Release links in the app shell and README that point to GitHub Releases.

## Build Commands

```bash
npm run build
```

Builds:

- `admin-ui/dist`: React management UI
- `dist`: TypeScript gateway, CLI, and Electron main process

```bash
npm run desktop
```

Runs the desktop app locally.

```bash
npm run dist:dir
```

Creates an unpacked desktop app for the current platform in `release/`.

```bash
npm run dist:mac
npm run dist:win
```

Creates macOS and Windows distributables. macOS builds should be produced on macOS. `npm run dist:win` explicitly targets Windows x64 so Apple Silicon hosts do not accidentally create Windows ARM64 release files. Windows builds are best produced on Windows CI or a runner with a complete Windows packaging environment.

`npm run dist:mac` is the fixed macOS packaging entry point and must build both Apple Silicon and Intel packages. The npm scripts first ask `electron-builder` for unpacked `.app` directories, then `scripts/package-mac-dmg.mjs` re-signs each app ad hoc and creates an HFS+ DMG.

Hardened Runtime must remain disabled in both `build.mac.hardenedRuntime` and the ad-hoc re-signing step. Ad-hoc Hardened Runtime builds can fail at launch on SIP-enabled Macs when `dyld` applies library validation to Electron Framework without a Developer ID Team ID. Do not enable Hardened Runtime again until the release flow uses a Developer ID Application certificate, consistent Team IDs for all nested components, and Apple notarization.

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
```

## UI Engineering Standards

Before building release artifacts, the desktop React UI should follow:

- [Frontend Architecture Guide](FRONTEND_ARCHITECTURE.md)
- [Desktop Design System](DESIGN_SYSTEM.md)

At minimum, verify:

- `App.tsx` only composes the application root.
- Page modules live under `admin-ui/src/pages`.
- Shared components and helpers live under `admin-ui/src/shared`.
- Desktop routes are registered through `admin-ui/src/routes/routes.tsx`.
- The app renders cleanly at desktop sizes around `1180px x 760px` and above.

## Signing

Unsigned builds are suitable for internal testing only. Public commercial distribution should use platform signing:

- macOS: Apple Developer ID Application certificate and notarization.
- Windows: Authenticode code-signing certificate.

`electron-builder` reads the standard signing environment variables. Configure these in CI instead of committing credentials to the repository.

Before uploading a macOS release, verify Gatekeeper status locally:

```bash
spctl --assess --type open --context context:primary-signature --verbose=4 "release/AI Zero Token-X.Y.Z-mac-arm64.dmg"
spctl --assess --type execute --verbose=4 "release/mac-arm64/AI Zero Token.app"
codesign -dv --verbose=4 "release/mac-arm64/AI Zero Token.app"
hdiutil imageinfo "release/AI Zero Token-X.Y.Z-mac-arm64.dmg" | grep "partition-hint: Apple_HFS"
```

The `codesign` output for unsigned internal builds must include `Signature=adhoc` and must not include `runtime`; the expected flag is normally `flags=0x2(adhoc)`. `scripts/package-mac-dmg.mjs` checks both the main app and Electron Framework and fails packaging if Hardened Runtime is present. The DMG image info must report `partition-hint: Apple_HFS`.

Unsigned or ad-hoc signed macOS builds can still be blocked after browser download with a misleading “damaged and cannot be opened” DMG dialog. This is expected for internal testing builds but is not acceptable for normal public distribution. Until macOS Developer ID signing and notarization are configured, each macOS DMG must include `build/mac-install-guide.txt`, and the GitHub Release notes should mention the quarantine workaround:

```bash
xattr -dr com.apple.quarantine "$HOME/Downloads/AI Zero Token-X.Y.Z-mac-arm64.dmg"
```

Use the matching x64 file name for Intel builds.

## Release Artifacts

The packaged output is written to:

```text
release/
```

The folder is intentionally ignored by git.

Every desktop GitHub Release must upload exactly these user-facing artifacts:

```text
AI Zero Token-{version}-mac-arm64.dmg
AI Zero Token-{version}-mac-x64.dmg
AI Zero Token Setup {version}.exe
AI Zero Token-{version}-win.zip
```

For `2.0.6`, replace `{version}` with `2.0.6`.

Artifact purpose:

- `AI Zero Token-{version}-mac-arm64.dmg`: macOS Apple Silicon builds for M1/M2/M3/M4 devices.
- `AI Zero Token-{version}-mac-x64.dmg`: macOS Intel builds.
- `AI Zero Token Setup {version}.exe`: Windows installer and primary Windows download.
- `AI Zero Token-{version}-win.zip`: Windows portable zip.

Do not upload unpacked app directories, debug metadata, universal macOS builds, or auto-update metadata unless the release explicitly enables an auto-update channel.

macOS DMG files should include the in-package `mac-install-guide.txt` helper document. Do not upload this text file as a standalone GitHub Release asset.

### Publish Flow

1. Build the desktop package:

   ```bash
   npm run dist:mac
   npm run dist:win
   ```

2. Rename the generated files, if needed, so the GitHub Release uses the standard artifact names listed above.

3. Upload only the standard artifact files from `release/` to the matching GitHub Release tag.

4. Publish the npm package after confirming `package.json` and `package-lock.json` both point at the new version:

   ```bash
   npm publish
   ```

## App Resources

App icon files live in:

```text
build/icon.png
build/icon.icns
build/icon.ico
build/tray-icon-template.png
```

They are included in Electron packaging and npm packing.
