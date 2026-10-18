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

   `dist:win` must explicitly build Windows x64, including when invoked on an Apple Silicon Mac. Do not upload host-inferred Windows ARM64 artifacts.

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
15. Prepare a copy-ready Chinese group announcement after verifying the release. Follow the release communication rules below; technical release reporting alone is not sufficient.

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

### Codex 对话记录清理

用户要求清理本项目的 Codex 对话时，必须同时处理对话内容、索引和桌面端侧栏目录。2026-09-30 的排查确认：只删除 `state_5.sqlite` 和 rollout 文件，即使再清理 `session_index.jsonl`，侧栏仍可能显示旧条目，点击后提示“恢复失败”；遗漏来源是 `sqlite/codex-dev.db` 的 `local_thread_catalog`。

执行流程：

1. 确定当前实际使用的 Codex 数据目录（通常为 `~/.codex`）、项目根目录及新旧项目 ID。按用户指定的时间范围筛选；未指定时间口径时，说明使用最后活动时间，并检查秒与毫秒字段。保留当前对话及仍在运行的对话。
2. 先固定待删除的会话 ID 清单，核对项目归属和日期。后续各层清理均使用这份清单，不能仅凭标题或“数据库里不存在”删除其他项目的记录。清单只需保存 ID、日期和必要路径，避免输出整段对话或凭证。
3. 优先使用可用的正式删除接口；归档不等于删除。确需直接维护本地数据时，先检查当前数据库表结构和关联约束，使用事务及参数化 SQL。数据库版本、字段和文件名可能变化，不能盲目复用旧 SQL。
4. 清理内容层：`state_5.sqlite` 中的会话及关联记录、`thread_history_1.sqlite` 中对应历史，以及实际存在的队列、目标、记忆等会话关联记录。只删除清单中会话对应的 `sessions/` 或 `archived_sessions/` rollout 文件，不删除工作区、项目文件或 worktree。
5. 清理索引层：删除 `session_index.jsonl` 中对应 ID 的条目；检查 `.codex-global-state.json` 是否存在这些 ID 的旧引用，有则定向处理。不要清空全局设置或其他项目的索引。
6. **必须检查侧栏目录层**：`sqlite/codex-dev.db` 的 `local_thread_catalog`，按 `host_id` 和 `thread_id` 删除对应目录项；检查 `thread_timeline_ledger`、`local_thread_catalog_scan_entries` 等关联表。当前结构支持时，在同一事务中递增 `local_thread_catalog_metadata.catalog_revision`。不要删除自动任务定义或整个数据库来刷新侧栏。
7. 核验同一批 ID 在内容数据库、rollout 文件、会话索引和侧栏目录中均已不存在，并报告各层实际删除数量。数据库核验不能代替界面核验；无法观察侧栏时明确说明。用户反馈仍有条目时，用具体标题定位 ID 和数据来源，不反复建议重启、不未经核实就归因于缓存。

此流程只适用于用户已授权的清理范围，不构成自动删除对话的授权。

Use Chinese for user-facing updates unless the user switches languages.

### Release announcements

Every version release must also deliver a Chinese update message that the user can paste directly into their group. Follow `docs/DESKTOP_RELEASE.md` → `Release communications`.

- Include the product name and version, 3–5 concise user-facing highlights (fewer for a small patch), necessary upgrade instructions, and the verified version-specific GitHub Release link. Include the npm update command when that channel was published.
- Explain practical benefits in plain language. Base claims on the actual release changes and verified results; do not present previous-version features or planned work as newly shipped. Do not promise complete safety or universal platform testing.
- Keep the group message compact, normally about 150–300 Chinese characters excluding links and commands. Keep commit hashes and detailed test reports in the technical handoff, not the group copy.
- GitHub Release 正文会直接显示在应用内更新弹窗，必须同样面向用户：只写功能变化、实际收益和必要升级提示。不要附加「验证范围」「测试边界」、测试数量、构建/签名检查结果或开发者机器的 SIP 等环境信息；这些放在单独的技术交接中。
- 用户确认的写作偏好（2026-10-13）：更新日志要像产品更新，不是工程变更清单。先用一句话概括本次更新，再按 3–5 个用户主题组织（小补丁可更少）；标题说明功能与收益，每项用 1–2 句话讲清「现在能做什么、解决什么问题、必要时从哪里使用」。同一功能的改动合并成一项，例如 Reviewer 的审阅与预填不要拆成重复条目。
- 文案保持简洁、客观，标题使用「具体功能或操作＋实际变化」，脱离正文也能看懂。沿用界面术语「接入／解除接入」，避免「更顺手」「也能」「继续原来的对话」等口语化或笼统描述。不要把「修复 Codex 第三方服务解除接入失败」概括成「无需登录也能接管」，以免误导为免登录使用 Codex。
- 不要逐条翻译技术 CHANGELOG，也不要把数据库写锁、内部状态值、超时秒数、标签复用机制或按钮位置等实现细节当作发布亮点。将其转成用户可感知的体验改善；技术依据留在 CHANGELOG/技术交接中。保留影响使用决策的限制和必要操作，不夸大收益、不写空泛营销口号。GitHub 正文、应用内说明和群公告均遵循这一原则，群公告再压缩篇幅。
- For a major feature/milestone release, also prepare a WeChat Official Account article draft when that communication scope is requested or clearly designated. This is a longer user-oriented story covering use cases, key changes, screenshots where useful, upgrade steps, and known limitations. Do not create a long article for every patch, and do not infer a major product milestone solely from the semantic version number.
- Preparing copy does not mean it has been sent. Do not post to a group or publish an Official Account article without a clearly identified destination and the user's authorization for that external action. Never report a draft as published.

When reporting a release, include:

- version
- commit hash
- tag
- npm verification result
- whether GitHub Release artifacts were created or skipped
