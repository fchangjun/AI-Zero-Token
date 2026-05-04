# Changelog

## 2.0.0 - 2026-05-04

- Added the Electron desktop app, with a local gateway boot path and the management UI embedded in the desktop shell.
- Added desktop download entry points in the app shell and README, pointing to GitHub Releases for future installers.
- Added the React desktop admin UI structure under `admin-ui/` with launch, overview, account, tester, logs, docs, network, and settings pages.
- Added desktop release packaging with `electron-builder`, including macOS and Windows targets and unpacked `release/` artifacts.
- Added desktop design and frontend architecture docs to keep the new UI consistent as it grows.

## 1.0.8 - 2026-04-29

- Removed local Free-plan blocking for image generation and editing; upstream account limits now decide availability.
- Switched image request orchestration to `gpt-5.4-mini` while keeping the requested image model on the `image_generation` tool.
- Increased the default gateway request body limit to 32 MiB and added `AZT_BODY_LIMIT_MB` for large JSON base64 image inputs.
- Updated the management-page update command to `npm install -g ai-zero-token`.
- Reworked the README into a cleaner open-source project format and added `README.zh-CN.md` for Simplified Chinese.

## 1.0.7 - 2026-04-29

- Added JSON `POST /v1/images/edits` support for image-to-image workflows with URL, base64 data URL, or raw base64 image references.
- Added management-page Edits test examples and documented the JSON image editing request format.
- Added `id_token` persistence for login, refresh, import, export, and account transfer JSON.
- Added "Apply to Codex" account action to back up and update local `~/.codex/auth.json` for new Codex sessions.
- Updated the local AI-Zero-Token skill documentation package with image editing and Codex account switching guidance.

## 1.0.6 - 2026-04-28

- Added account JSON import/export support in the management page.
- Added batch account import from a single object, an array, or a `profiles` bundle.
- Added selectable batch export for checked accounts in the management page.
- Added `azt profiles import/export` CLI commands for account transfer workflows.
- Added an account import template endpoint for quick JSON format reference.

## 1.0.5 - 2026-04-27

- Added management-page proxy configuration for upstream requests, persisted in local settings.
- Routed upstream requests through configured curl proxy settings when enabled.
- Removed the local fixed-size allowlist for image generation `size`, allowing upstream validation to decide supported values.
- Documented the proxy configuration workflow without including a specific proxy address.

## 1.0.4 - 2026-04-24

- Moved persistent account and settings state to the user home directory at `~/.ai-zero-token/.state`.
- Added automatic one-time migration from the old package-local `.state` directory when available.
- Added `AI_ZERO_TOKEN_HOME` support for overriding the persistent state location.
- Fixed repeated login prompts after npm upgrades or global package reinstalls.

## 1.0.3 - 2026-04-24

- Added dynamic Codex model discovery from the local `~/.codex/models_cache.json` cache, with static model fallback when the cache is unavailable.
- Added `azt models --refresh` and a management-page action to re-read the local Codex model list without rebuilding the package.
- Added runtime version checks against npm, including a prominent update panel in the management UI when a newer version is available.
- Added 10-minute automatic refresh for quota snapshots and version status in the management UI.
- Improved quota display so account cards show used and remaining quota percentages clearly.
- Improved quota syncing so inactive or missing login state does not break runtime refresh.
- Improved image generation error handling with transient retries and clearer failure details.
- Preserved response headers when using the curl HTTP fallback so quota metadata can still be captured.
- Added Vibe Coding / OpenAI-compatible client integration documentation.
