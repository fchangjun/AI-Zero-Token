# Changelog

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
