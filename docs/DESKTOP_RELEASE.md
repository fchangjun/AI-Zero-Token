# AI Zero Token Desktop Release

This project ships the desktop app with Electron. The desktop main process starts the existing local Fastify gateway and loads the React management UI served by that gateway.

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

`npm run dist:mac` must build both Apple Silicon and Intel macOS packages. It runs:

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

Artifact purpose:

- `AI Zero Token-{version}-mac-arm64.dmg`: macOS Apple Silicon builds for M1/M2/M3/M4 devices.
- `AI Zero Token-{version}-mac-x64.dmg`: macOS Intel builds.
- `AI Zero Token Setup {version}.exe`: Windows installer and primary Windows download.
- `AI Zero Token-{version}-win.zip`: Windows portable zip.

Do not upload unpacked app directories, debug metadata, universal macOS builds, or auto-update metadata unless the release explicitly enables an auto-update channel.

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
```

They are included in Electron packaging and npm packing.
