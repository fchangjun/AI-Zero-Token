# Changelog

## 2.0.6 - 2026-05-11

- Added persistent local usage statistics with today, current-process, lifetime, daily trend, account, model, endpoint, error, image-route, and source breakdowns.
- Added safe usage event storage under the local state directory without persisting prompts, messages, access tokens, or base64 payloads.
- Added an account-management statistics strip with clickable filters for total, available, unavailable, login-invalid, auth-error, exhausted, plan type, active status, and auto-switch inclusion.
- Restored filtered-result bulk selection controls so filtered accounts can be selected or cleared for batch operations.
- Clarified usage UI labels so token totals are shown as known upstream-returned usage, while requests without upstream usage are counted separately.
- Improved the Settings Free-account image warning and removed duplicated Settings page heading copy.

## 2.0.5 - 2026-05-09

- Added a Codex takeover history-mode selector in Settings so the default path keeps `openai` history while optionally writing a separate `AI Zero Token` provider.
- Added Codex custom provider setup from the Settings page, including local/remote gateway URL selection and managed writes to `~/.codex/config.toml`.
- Added `POST /codex/v1/responses` as a dedicated Codex CLI/Desktop Responses SSE passthrough route.
- Added `POST /codex/v1/responses/compact` passthrough for Codex remote context compaction.
- Added an opt-in Free-plan image route that uses ChatGPT web image generation for `/v1/images/*` and Codex `image_generation` tool requests, while paid plans continue to use the Codex Responses image tool.
- Added a Settings toggle and warning for Free-account image generation risk and limited quota.
- Added admin APIs to configure or remove the AI Zero Token managed Codex provider and report provider status in the management console.
- Changed Codex request takeover to preserve the native `openai` provider id via `openai_base_url`, keeping existing Codex history visible when routing through a third-party gateway.
- Added a best-effort local Codex history migration that rewrites legacy `ai-zero-token` thread records back to `openai` with a SQLite backup.
- Added `/codex/v1/models` and compressed JSON request parsing for Codex's native provider gateway mode.
- Added an auto-switch exclusion list so selected accounts can be kept out of automatic quota rotation while remaining available for manual use.
- Improved quota-limit handling by capturing upstream `usage_limit_reached` details and retrying Codex passthrough requests after automatic account switching.
- Hardened settings persistence with normalized settings loading, deduplicated profile ID lists, queued saves, and atomic file replacement.
- Updated README and API docs with Codex custom provider setup and the dedicated passthrough route.

## 2.0.4 - 2026-05-08

- Added the macOS menu-bar account panel for quick gateway/Codex account switching, quota refresh, Base URL copy, and gateway restart.
- Added OpenClaw-oriented `chat.completions` compatibility for `tools`, `tool_choice`, assistant `tool_calls`, tool-role follow-up messages, `reasoning_effort`, `parallel_tool_calls`, and `stream=true` SSE responses.
- Added gateway request logs backed by real API traffic, including safe request/response summaries and OpenClaw source detection.
- Added desktop support for restarting Codex after applying a saved account.
- Added the tray template icon to npm and Electron desktop package resources.
- Updated API docs and in-app usage docs with OpenClaw setup and streaming/tool-call compatibility notes.

## 2.0.3 - 2026-05-08

- Added ZIP batch account import with preflight validation for bundled account JSON files.
- Added account export audit metadata, including export count, latest export time, and export type.
- Added account-card export status badges so exported accounts are visible in the account list.
- Added selected-account batch deletion from the account management page.
- Improved global quota refresh performance with configurable concurrency.
- Added a runtime setting for quota refresh concurrency, configurable from 1 to 32.
- Restored the prominent global update banner with separate desktop and npm update paths.
- Fixed account export UI state so export status updates immediately after exporting.

## 2.0.2 - 2026-05-07

- Added a GitHub image-bed workflow to the React desktop UI, including upload history, configuration storage, and gateway service support.
- Reworked the network diagnostics page around overseas app reachability for reverse-proxy scenarios, with clearer access verdicts, exit/proxy signals, DNS/WebRTC context, and a more productized matrix layout.
- Removed the legacy server-rendered embedded admin page; production now serves the React admin UI build only.
- Improved desktop and tester UI polish, routing, shared workspace state, icons, and request helpers.
- Hardened network detection with more resilient IPv4/IPv6 probing, DNS collection, and partial-result handling.
- Updated macOS desktop packaging so `dist:mac` builds a universal app, with explicit `dist:mac:arm64` and `dist:mac:x64` scripts for Apple Silicon and Intel-only installers.

## 2.0.1 - 2026-05-04

- Improved desktop sidebar navigation responsiveness by switching routes immediately and de-duplicating hash-change updates.
- Removed the generated skill documentation zip from Git tracking and ignored it for future commits.

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
