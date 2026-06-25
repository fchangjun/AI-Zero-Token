# AI Zero Token Desktop Release

This project ships the desktop app with Electron. The desktop main process starts the existing local Fastify gateway and loads the React management UI served by that gateway.

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

Creates macOS and Windows distributables. macOS builds should be produced on macOS. Windows builds are best produced on Windows CI or a runner with a complete Windows packaging environment.

`npm run dist:mac` must build both Apple Silicon and Intel macOS packages. The macOS scripts first ask `electron-builder` for unpacked `.app` directories, then `scripts/package-mac-dmg.mjs` re-signs each app with ad-hoc hardened runtime and creates an HFS+ DMG. This avoids APFS DMGs and ad-hoc signatures that omit hardened runtime.

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

The `codesign` output for unsigned internal builds must include `Signature=adhoc` and `runtime`, for example `flags=0x10002(adhoc,runtime)`. The DMG image info must report `partition-hint: Apple_HFS`.

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
