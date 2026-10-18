# Changelog

## Unreleased

## 2.0.21 - 2026-10-18

- Reduce mixed gateway connection setup with a bounded keep-alive pool when no proxy is configured, retaining proxy transport, cancellation and single-attempt POST behavior. Add isolated session affinity for the Baidu channel without changing saved routes or context windows. Show content-free mixed request timings, first text/output, upstream wait, conversion, output rate, token/cache usage and compaction markers in request logs; leave unreported usage unknown. Support Claude Messages adaptive/manual thinking, model-specific effort and JSON Schema, preserving signed/redacted thinking through encrypted tool-result replay and rejecting invalid state rather than silently dropping it.

- Prevent repeated compaction in plugin-heavy converted Codex sessions by enabling local tool discovery for Chat/Claude routes, translating client tool-search calls and loading only discovered tool definitions. Preserve manual/provider/applied context windows, direct/Responses behavior, history and permissions; keep compaction requests free of historical tool definitions. Request streaming token usage from compatible Chat services and retain incremental text delivery. Add real Codex regression coverage that reproduces repeated compaction with a large MCP catalog and verifies discovery, tool calls and multi-turn continuation at the same 128K window.

- Fix curl-backed checks waiting for a disabled redirect's response body to drain before exposing its headers, which could time out and mislabel the result as congestion in Electron. Keep redirects disabled and verify stream cancellation in both Node and Electron.
- Update compatible production and build dependencies to address known audit findings, including Fastify routing/validation and malformed ZIP handling. Preserve the macOS ad-hoc signing policy with Hardened Runtime disabled.

- Bring the Codex Intelligence Station into AZT with an AZT-styled sidebar entry and two tabs: reset updates and subscription prices. Keep the latest confirmed reset and the next announcement separate, compare recorded regional plans with CNY estimates and standard USD prices, and share reset signals plus Plus / Pro deals in one image. Add a central JSON fallback with its original timestamp and exact-source Chinese reference translations, clearly labeling machine translations. Provide an author-contact entry for subscription enquiries while keeping existing local desktop notification settings independent.

- Separate takeover compatibility from current connectivity. Show a compact runtime status beside each model on the takeover page, using the active interface independently of pending choices; keep timestamps and reasons in details and preserve the existing refresh schedule. Retain the last conclusive compatible/incompatible result through network, rate-limit, service and credential failures; show incomplete checks separately and keep first-time failures unconfirmed. Share Responses compatibility across both modes, preserve converted-interface evidence and automatic routing through transient failures, and update mode counts/filters without changing saved selections or context windows. Treat incomplete/truncated Responses probes as inconclusive, and retain conclusive results beyond the recent-history limit.
- Raise the unknown Chat/Claude conversion context fallback to 128K while retaining the existing direct/Responses default, manual overrides, provider metadata, and previously applied catalogs. Show each takeover mode's context source and distinguish active values from changes pending reactivation. Let manual capability and connectivity checks finish the entire selected model set with bounded concurrency and progress; retain the 20-model rotation only for automatic health checks.
- Group channel models and Codex selections by vendor, with vendor/name search, collapsible sections, per-group selection and a grouped default-model menu. Preserve selections across filters and availability ordering within each vendor; unknown or ambiguous model names remain in Other, without changing model IDs, routing or compatibility detection.
- Add automatic interface detection to channel-level mixed takeover. Reuse confirmed per-model protocols, probe unknown Responses/Chat/Messages interfaces only after confirmation, and preserve existing connections if detection fails. Keep manual overrides in each model row and retain legacy explicit choices; bound probe concurrency, token budgets and duration, and reject results if connection settings change.
- Unify direct and mixed capability checks into one per-model or batch action, with persisted interface detection and conversation/function-call/tool-output validation. Always show both takeover modes and their individual statuses in the model list, distinguishing available, untested, incompatible, failed and incomplete validation instead of hiding non-passing modes or using an ambiguous overall result. Keep takeover rows compact with each mode's status and context; expand detection details for timestamps, tool checks, connectivity and failure reasons. Share one Responses inspection, status and timestamp between direct and native mixed forwarding, including legacy display records and transient failures. Only Chat/Messages conversion runs extra compatibility checks; do not repeat failed Responses identification or fall back to another protocol after transient/auth failures. Preserve saved selections, manual protocols and context windows. Count and filter each available mode independently without priority recommendations, and never apply a different protocol's validation to a manual override. Complete native models immediately after saving the shared result and converted models after their extra validation, without changing active connections. Share results between model details, the channel list and takeover, including successful results from partially failed batches; credential/address changes invalidate them. Recognize explicit unsupported-conversion errors returned as HTTP 500, and accept complete SSE DONE sentinels at EOF while still rejecting truncated JSON.

- Add an authenticated local Codex model catalog for external and mixed providers, showing available/blocked/unavailable snapshots without changing model IDs or confirmed capabilities. Explicitly enable API-key model discovery, remove static-catalog precedence, and restore prior discovery settings on disconnect. Add protocol-specific bounded health checks (30-minute default, 15/60/off options), shared status display, expiry, and a manual check action; catalog reads never trigger inference. Check due models across all saved channels when AZT starts, independently of Codex takeover or discovery settings; reuse fresh snapshots across restarts and preserve saved intervals, disabled monitoring, selections and context windows. Use the applied, saved or identified interface for one lightweight request per model, keeping compatibility checks separate. Label old snapshots as awaiting refresh, with the last check time, refresh reason and previous outcome in hover details. Existing connections require reapplying once for the dynamic catalog, and subsequent display updates follow Codex's own cache.

- Replace reset-calendar system notifications with persistent, non-activating desktop cards. Share the renderer across real events, tests and settings previews; stack up to three cards within the display work area, close on dismissal/quit, and open the calendar even after the macOS main window was closed. Remove obsolete OS permission guidance and disclose Focus/screen-sharing behavior.
- Add lighter reset-alert copy with explicit signal/forecast/confirmation states and Beijing-time forecasts. Keep unknown/passed estimates pending and retain personal-quota and banked-reset caveats.
- Promote active reset announcements and signals above calendar statistics, with a prominent Beijing-time deadline, explicit pending/unknown-time states, direct bilingual sources, and a calendar shortcut. Highlight pending announcements in calendar cells and keep them visible on crowded days; preserve pending status after the expected time passes.
- Fix Codex provider switching misidentifying the global config as a project override when Windows thread paths use namespace prefixes, different casing, or filesystem aliases; retain checks for genuinely separate project overrides.
- Fix reset-calendar alerts being permanently consumed before successful delivery: retry failed or interrupted current-stage notifications, preserve successful-stage deduplication, and set the Windows notification identity to match the installer shortcut.
- Move remaining native desktop-update notifications to Electron 42's UNNotification API and prepare a valid ad-hoc development runtime signature and AZT icon without Hardened Runtime.
- Separate reset-calendar manual retries from automatic exponential backoff: allow retry after a short cooldown while honoring upstream Retry-After, preserve failure state across restarts, and show distinct automatic/manual retry deadlines. Legacy caches keep their automatic schedule without blocking a deliberate manual retry after upgrading.
- Desktop update details now summarize every stable release newer than the installed version and up to the target version, grouped newest first with individual release links. Historical summaries use feature headings and omit repeated installation instructions and validation reports.
- Fetch release history with bounded pagination and retain the validated installer when history is unavailable; show partial-history feedback with a retry action and preserve previously loaded complete history during transient failures.

## 2.0.20 - 2026-10-13

- Fixed disconnecting an external Codex service failing when the original default model was implicit or the native model cache was unavailable. Restoring the native connection no longer requires a login, network model refresh, or readable model catalog.
- Preserve exact native global and per-conversation preferences, including unset models and reasoning levels. Conversations created under a third-party service return to the native provider with unset model/effort fields so Codex resolves its configured or built-in defaults; conversation contents remain intact.
- Added versioned nullable recovery snapshots and transactional migration of existing records. Matching config markers recover original model/catalog values rather than retaining inferred cache defaults, while failed migrations roll back to the previous files and conversation settings.
- Fixed model markers being confused with model-catalog markers when configuration fields appear in a different order or services are applied repeatedly.
- Added offline recovery, legacy migration, missing/corrupt cache, explicit-null preference, marker-order and rollback regressions, plus real Codex resume/request acceptance for both existing and newly created conversations in an isolated loopback-only environment.

## 2.0.19 - 2026-10-12

- Reset calendar details now combine the matching Chinese reference translation and English announcement in one compact card, with concise source metadata and a copy-source action. Reset-type explanations expand from a single-line guide; duplicate announcement labels, full URL displays, and the external-browser action have been removed.
- Added a Codex reset calendar with Beijing-time announcement history, regular/banked reset filters, source details, current public signals, and scheduled announcements that remain pending until execution is confirmed.
- Added background public-data synchronization, persistent local history and notification preferences, one notification per signal/confirmation stage, desktop notification testing, and click-through to the calendar. Initial synchronization imports history silently; network failures retain cached records and retry with backoff.
- Added per-model context-window settings for external providers, showing whether values come from the upstream API, a manual override, or the default. Manual values survive model refresh; applying the service again updates the Codex catalog. Model selection now sorts by availability while keeping all models selectable and places primary actions at the top.
- Added explicit close-and-confirm dialogs before changing Codex connections. Opening or cancelling a dialog does not change configuration; confirmed preparation has a shared 15-second deadline, preserves active-reply and database-lock checks, and supports retry without forcing clients to quit.
- Improved the experimental Response Reviewer integration to open saved reviews in Codex's built-in browser side panel, reuse a tab within the same conversation, and offer an explicit embedded fallback. Improved capture of code, tables, lists and file references, prevented duplicate actions, and surfaced recoverable errors.
- Added verified current-conversation composer prefill for Reviewer: it only writes into an empty draft in the matching conversation, refuses ambiguous or stale targets, and never sends automatically. Older backends require a restart before this capability becomes available.
- Updated the Chinese user guide and added reset-calendar documentation and isolated UI acceptance coverage.

Public reset announcements do not guarantee that an individual account's quota has recovered. Reviewer integration remains experimental and depends on the installed Codex version. Users on 2.0.16/2.0.17 whose in-app downloads fail should manually install this version once.

## 2.0.18 - 2026-09-30

- Fixed macOS update downloads failing on GitHub redirects in Electron. Follow only validated official redirects, retry initial download connection failures through the matching GitHub asset API, and retain byte-count and SHA-256 verification. Network, file-write, and disk-space failures now have distinct messages.
- Removed duplicate npm/CLI notices and version metadata from all native desktop platforms, including Windows; browser and CLI update channels remain available.
- Improved Codex provider switching by distinguishing active Codex backends from unrelated plugins and database viewers. Ignore historical unfinished turns while preserving protection for active or uncertain replies, and allow normal WAL readers without bypassing real SQLite write locks.
- Stop SQL transactions on the first failed statement, roll back partial changes, and provide actionable lock-conflict diagnostics. Provider errors remain visible until dismissed or retried.
- Preserved inherited environment variables in the development launcher and used absolute macOS process-inspection tools so switching also works with a minimal PATH.
- Added real Electron download/redirect/cancellation tests, full-shell update-notice regression coverage, and Codex runtime/database concurrency tests.

Users on 2.0.16 or 2.0.17 whose in-app download fails must manually install 2.0.18 once to receive the downloader fix. Account and settings directories are unchanged.

## 2.0.17 - 2026-09-30

- Improved macOS desktop updates with a persistent update notice and a release-notes dialog showing versions, publication date, and download size. System notifications and tray checks open the dialog, including after the main window was closed. Downloads show progress, support background preparation, and prompt for restart when ready.
- Recheck for updates when returning to the desktop after five minutes, without repeating availability notifications or hiding installation errors. Release notes render headings, lists, and safe links instead of raw Markdown.
- Keep the normal update entry in the sidebar, let users defer a version without repeated prompts, and show one desktop update flow without npm/CLI notices. Refined the dialog layout, bilingual copy, keyboard focus, and narrow-window presentation.
- Added an optional Response Reviewer tool with a local review workspace, annotations, history, and read-only import of legacy review data. The service and experimental Codex review-button integration are disabled by default; file access requires an explicitly selected workspace, and revision requests are not sent automatically.
- Made external Codex provider switching consistent for existing and archived local threads, using one shared third-party provider and restoring native model preferences when disconnected. Added configuration/database backups, durable recovery records, concurrent-writer guards, and model/reasoning compatibility checks without rewriting conversation JSONL or replacing native login credentials.
- Preserved the `none` and `max` reasoning levels throughout compatible requests and Codex catalogs, retried transient reasoning-probe failures once, and retained previously confirmed capabilities when inspection is temporarily unavailable.
- Added a Chinese getting-started guide and isolated desktop, reviewer, and Codex provider-switch acceptance checks.

## 2.0.16 - 2026-09-28

- Added macOS in-app updates with background release checks, native notifications, download progress/cancellation, and install-and-restart. Official DMGs are verified against GitHub SHA-256 metadata, architecture, version, and the existing ad-hoc signing policy. A detached installer retains the previous app until the new gateway and UI confirm startup, and restores it if replacement or startup fails.
- Split Models & Services into Connect External API and Serve API. Moved account management, model settings, service port, and rotation policies into the account-pool service; old account links redirect to the new page.
- Added optional API access keys with Bearer validation, rotation, private storage, and local-only key management. Local Codex gateway credentials update with key changes; external provider selection and API serving remain independent.
- Restricted management endpoints to loopback even when model API authentication is disabled, including percent-encoded route variants, preventing remote account export and configuration changes. Serialized local Codex connection setup with key rotation across processes so concurrent updates cannot restore an expired key or take over an unrelated local provider.
- Fixed a curl streaming race where fast responses could lose their response headers and incorrectly return HTTP 502 in the desktop runtime.
- Adapted the legacy Codex compact endpoint to the current Responses compaction trigger, preserving opaque encrypted output and returning JSON with token usage. Incomplete or invalid upstream compactions now fail explicitly, and retained user history is bounded to avoid immediate re-compaction.
- Updated fresh-install fallback models and model-discovery client version; model caches now respect `CODEX_HOME`. Existing model selections remain governed by the live catalog.
- Fixed desktop shutdown leaving a windowless process after closing the gateway. Quit waits for shutdown, resumes on the next event-loop turn, and blocks window reopening while quitting.
- Kept pending usage writes until gateway shutdown completes.
- Added a dedicated Models & Services page for managing multiple external API services, with automatic model discovery or manual model IDs, capability tags, inspection history, and background inspection progress.
- Separated model discovery, capability checks, and Codex selection. Every discovered model remains selectable regardless of inspection status; Codex uses one service and its exact selected model list at a time. Capability inspection is capped at 20 explicitly selected models per batch so a single action cannot fan out into unbounded billable requests.
- Preserved successful capabilities during transient failures and imported legacy external-provider settings and inspection history once. Edited credentials take effect in Codex after applying the service again.
- Made Codex provider and catalog changes transactional, restoring the previous configuration on write failure, and added isolated integration tests and a local acceptance preview.

## 2.0.15 - 2026-09-22

- Fixed Codex image uploads for compatible external text models by probing a real image input and writing image capability only after that probe succeeds.
- Added separate generation probes for `gpt-image-2`, `gpt-image-2.5-flare`, and `gpt-image-2.5-sunburst`, with a dedicated UI section that explains their general-purpose, speed, and quality tradeoffs.
- Split version checking into independent desktop and npm/CLI channels: desktop builds now compare with matching GitHub Release artifacts, npm/CLI compares with npm registry, and newer local desktop builds are labeled as development/unreleased.

## 2.0.14 - 2026-09-18

- Disabled Hardened Runtime throughout the ad-hoc macOS packaging pipeline and added signature guards so builds fail if it is reintroduced, preventing Electron Framework launch failures on SIP-enabled Macs.

## 2.0.13 - 2026-09-17

- Added Simplified Chinese and English localization across the desktop management console, including a persistent language switcher and locale-aware number and time formatting.
- Added one-click inspection for external OpenAI-compatible providers, with model discovery, streamed Responses validation, function-call and function-output verification, reasoning-effort probing, and non-text model filtering.
- Added managed Codex model-catalog generation plus local inspection history and cached reconnects, with strict Base URL scoping so tokens and model results are never reused across a different origin, port, or path.
- Improved Codex provider takeover and removal so the previous root model, provider, and model catalog are restored while inactive compatibility definitions can keep existing conversations loadable, with an explicit purge path when required.
- Hardened external-provider inspection with loopback-only access, same-origin redirect enforcement, bounded responses, redacted errors, and private local history storage, while preserving `minimal` and `xhigh` reasoning effort values for OpenAI-compatible chat requests.

## 2.0.12 - 2026-06-25

- Added Codex request diagnostics that store captured request details in separate local diagnostic files, with request-log viewing and cleanup controls.
- Captured Codex stream responses as compact diagnostic summaries by default, with an opt-in full SSE protocol capture mode for deep debugging.
- Added Settings controls for Codex request serialization delay/jitter and diagnostic capture options.
- Added compatibility handling for legacy Codex Desktop requests that still send `gpt-5.4`, rewriting them to the current default model when needed and recording the requested/effective model in logs.
- Added external OpenAI-compatible API takeover support for Codex provider configuration with bearer-token storage.
- Improved macOS desktop packaging by creating HFS+ DMGs from ad-hoc hardened-runtime signed app bundles and expanding the macOS install guide for Gatekeeper quarantine prompts.

## 2.0.11 - 2026-06-10

- Accepted sub2api-style Codex account JSON imports that do not include a real `chatgpt_account_id`, using user id, JWT subject, email, or token hash as gateway-only identities.
- Marked gateway-only imported accounts as not applicable to local Codex, disabled the account card Codex action, and added a hover reason so users can see why the account is API-only.
- Stopped sending fallback identities as `ChatGPT-Account-Id` headers and guarded local Codex `auth.json` writes so only real Codex account ids are applied.
- Added configurable per-account Codex request serialization with minimum delay and jitter to smooth bursty native Codex traffic.
- Improved the manual OAuth fallback flow by keeping the pasted callback URL/code form inside the account modal and extending the automatic callback wait window to three minutes.

## 2.0.10 - 2026-05-26

- Added a manual OAuth fallback in the desktop UI so login can continue by pasting the callback URL or authorization code when the local callback is not received.
- Started the OAuth callback listener on both IPv4 and IPv6 loopback addresses for better compatibility with browser redirects.
- Refreshed accounts before applying them to local Codex so `auth.json` receives a current `id_token`.
- Tightened `id_token` validation by checking expiry and matching embedded account identity when available.

## 2.0.9 - 2026-05-26

- Clarified auto-switch settings so manually excluded accounts are separated from accounts that are runtime-ineligible because login is unavailable or quota is exhausted.
- Updated account filters and stats labels to distinguish configured rotation participation from the actual automatic rotation candidate pool.
- Preserved account identity metadata when refreshed Codex tokens omit profile claims.
- Validated `id_token` expiry before using saved profiles for Codex image and web flows, with clearer recovery guidance when a fresh `id_token` is unavailable.

## 2.0.8 - 2026-05-21

- Added Codex prompt-cache key handling for gatewayed Codex requests so upstream cache-hit behavior is more stable.
- Improved token usage capture for Codex SSE streams by reading terminal response events, tracking missing-terminal and terminal-without-usage cases, and draining upstream streams briefly after client disconnects.
- Added cache-read, uncached-input, cache-creation, token-capture-status, and estimated-cost fields to local usage statistics.
- Added OpenAI-compatible usage payloads for non-stream chat responses and optional `stream_options.include_usage` chat completion streams.
- Added a Usage page breakdown for token-capture status and a backup-and-reset action for clearing local usage records safely.
- Backfilled usage cost and diagnostic aggregates from local event logs when older statistics are missing the new fields.
- Improved Codex history migration by patching legacy rollout session metadata alongside the local history database.

## 2.0.7 - 2026-05-11

- Added persistent local usage statistics with today, current-process, lifetime, daily trend, account, model, endpoint, error, image-route, and source breakdowns.
- Added safe usage event storage under the local state directory without persisting prompts, messages, access tokens, or base64 payloads.
- Added an account-management statistics strip with clickable filters for total, available, unavailable, login-invalid, auth-error, exhausted, plan type, active status, and auto-switch inclusion.
- Restored filtered-result bulk selection controls so filtered accounts can be selected or cleared for batch operations.
- Clarified usage UI labels so token totals are shown as known upstream-returned usage, while requests without upstream usage are counted separately.
- Improved the Settings Free-account image warning and removed duplicated Settings page heading copy.
- Fixed Codex curl streaming status handling so interim `HTTP 100 Continue` responses are ignored before the final upstream status.
- Changed model refresh to fetch the Codex model catalog from the network and write it back to the local Codex model cache.
- Improved automatic account switching so unsynced accounts can be used as fallback candidates and invalid active accounts can rotate away.
- Added request-level account rotation retries for OpenAI-compatible text requests, while binding Codex response ids to their source account and falling back to a new session if a sticky `previous_response_id` continuation cannot be used.
- Improved Codex curl stream failure handling by tagging pre-header disconnects with gateway request metadata and retrying transient new-session stream failures once.
- Increased the default request body limit to 128 MiB and allowed `/codex/v1/responses/compact` requests up to at least 256 MiB to avoid local compaction 413 failures.
- Treated curl TLS, DNS, connect, and timeout failures as transient gateway errors so request-level rotation can retry without relying on quota probing, and labeled accounts without quota snapshots as pending request validation.
- Captured token usage from Codex SSE `response.completed` events so native `/codex/v1/responses` traffic is no longer counted as unknown whenever upstream returns usage data.

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
