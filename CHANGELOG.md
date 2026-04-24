# Changelog

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

