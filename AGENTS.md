# AI Zero Token Agent Notes

## macOS Packaging Policy

Use `npm run dist:mac` as the fixed entry point for every macOS desktop build. It builds both architectures through `dist:mac:arm64` and `dist:mac:x64`, then runs `scripts/package-mac-dmg.mjs` to apply the final ad-hoc signatures and create HFS+ DMGs.

Keep Hardened Runtime disabled for ad-hoc macOS builds in both places:

- `build.mac.hardenedRuntime` in `package.json` must remain `false`.
- `scripts/package-mac-dmg.mjs` must pass `hardenedRuntime: false` for every signed file and must fail if the final app or Electron Framework signature contains `runtime`.

Do not re-enable Hardened Runtime unless the user explicitly switches the release flow to Apple Developer ID Application signing and notarization with consistent Team IDs for all nested Electron components. Ad-hoc Hardened Runtime builds can crash at launch on SIP-enabled Macs because `dyld` rejects Electron Framework during library validation.

## Release Defaults

When the user asks to publish, release, or ship a new version, treat it as the full npm plus desktop GitHub Release flow unless they explicitly narrow the request.

Always check these files first:

- `BUILD_CLI.md` for the npm/CLI release flow.
- `docs/DESKTOP_RELEASE.md` for desktop artifact rules.
- `CHANGELOG.md` for the release notes entry.

For a normal release:

1. Confirm the intended version from `package.json`.
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`.
3. Run `npm run typecheck`.
4. Run `npm run build`.
5. Run `npm run pack:dry` and inspect the packed file list.
6. Commit with `Release vX.Y.Z`.
7. Create tag `vX.Y.Z`.
8. Before publishing, verify npm auth from the project-local publish config:

   ```bash
   set -a; [ -f ./.env.publish ] && . ./.env.publish; set +a
   npm whoami --registry=https://registry.npmjs.org/
   ```

   The command must return the maintainer account with publish permission. If it returns `E401`, do not publish; update the ignored local `.env.publish` or `.npmrc` token first. Never print or commit token values.
9. Run `npm publish`.
10. Verify with `npm view ai-zero-token version`.
11. Push `master` and the release tag.
12. Build desktop artifacts:

   ```bash
   npm run dist:mac
   npm run dist:win
   ```

   If disk space is low, clean only ignored/rebuildable `release/` old-version artifacts and unpacked intermediate directories, never source files or user data.
13. Rename or stage the generated desktop assets so the GitHub Release has the standard user-facing artifacts:

   ```text
   AI Zero Token-{version}-mac-arm64.dmg
   AI Zero Token-{version}-mac-x64.dmg
   AI Zero Token Setup {version}.exe
   AI Zero Token-{version}-win.zip
   ```

   Do not upload mac zip files, blockmaps, unpacked app directories, debug metadata, or auto-update metadata unless the release explicitly enables an auto-update channel.
14. Create or update the matching GitHub Release and upload the four desktop artifacts. If `gh` is installed, use it. If `gh` is not installed, load the ignored project-local `.env.github` token and use the GitHub Releases API. Never print or commit GitHub token values.

GitHub may normalize uploaded asset names by replacing spaces with dots. Still verify that the four expected macOS/Windows artifacts are present on the release.

Do not stage unrelated local files unless the user explicitly asks. In particular, leave `docs/images/wechat-free-account-settings.png` and `tmp/` alone when they are untracked.

## Gateway Stability Checks

For gateway, account rotation, Codex Responses, usage stats, model sync, or streaming changes, run at least:

- `npm run typecheck`
- `npm run build`
- `npm run pack:dry` before release

Check Codex-specific paths when relevant:

- `/codex/v1/responses`
- `/codex/v1/responses/compact`
- `/v1/chat/completions`
- model refresh and account rotation settings in the desktop UI

## Communication

Use Chinese for user-facing updates unless the user switches languages.

When reporting a release, include:

- version
- commit hash
- tag
- npm verification result
- whether GitHub Release artifacts were created or skipped
