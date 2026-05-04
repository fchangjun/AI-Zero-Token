# Frontend Architecture Guide

This document defines the React desktop UI structure for AI Zero Token. New desktop modules should follow this guide from the first commit, so the app does not need large cleanup passes after features are added.

## Goals

- Keep each product module independently maintainable.
- Keep `App.tsx`, shell layouts, and global hooks small.
- Make it obvious where page-only code belongs.
- Allow new pages to be added without touching unrelated modules.
- Keep shared code truly shared.

## Source Layout

```text
admin-ui/src/
  app/
    App.tsx

  routes/
    routes.tsx

  layouts/
    AppShell.tsx
    AppSidebar.tsx
    AppTopbar.tsx
    RouteRenderer.tsx
    AppOverlays.tsx

  pages/
    accounts/
      index.tsx
      components/
      lib/
      accounts.css
    tester/
      index.tsx
      components/
      lib/
      tester.css
    logs/
      index.tsx
      components/
      lib/
      logs.css

  shared/
    components/
    lib/
    styles/
    api.ts
    types.ts

  hooks/
    useAdminWorkspace.ts
    useAdminWorkspaceState.ts
    useAdminWorkspaceDerived.ts
    useAdminWorkspaceActions.ts

  assets/
  styles.css
  main.tsx
```

## Directory Rules

### `app/`

Application composition only.

Allowed:

- Mount the root shell.
- Attach global providers.
- Import global styles.

Not allowed:

- Page routing logic.
- Business state.
- API calls.
- Modal implementation details.

### `routes/`

Route metadata only.

Allowed:

- Route ids.
- Labels.
- Icons.
- Navigation groups.
- Default route selection.

Not allowed:

- Page business logic.
- Data fetching.
- UI state.

### `layouts/`

Desktop application frame only.

Allowed:

- Sidebar.
- Topbar.
- Route renderer.
- Global overlays.
- App-level loading and account state surfaces.

Not allowed:

- Page-specific forms.
- Page-specific filters.
- Feature-only modals.

### `pages/`

One product module maps to one page folder.

Each page owns:

- Its screen component in `index.tsx`.
- Page-only components in `components/`.
- Page-only helpers in `lib/`.
- Page-only styles in `page-name.css`.
- Page-only state, filters, drafts, and handlers.

Page-level logic may live directly in `index.tsx` while it is small. Extract to `components/` or `lib/` only when it improves readability or reuse inside the same page.

### `shared/`

Only code used by multiple pages belongs here.

Allowed:

- Reusable UI primitives.
- Cross-page formatting helpers.
- Shared API client.
- Shared domain types.
- Shared styles and layout utilities.

Not allowed:

- Code used by only one page.
- Page-specific data transforms.
- Page-specific copy.
- Feature-specific forms or tables.

### `hooks/`

Global hooks should represent app-wide state and cross-page orchestration.

Allowed:

- Current route.
- Current config snapshot.
- Global loading state.
- Global modal flags.
- Shared request logs.
- Actions used by multiple pages.

Not allowed:

- Page-only filters.
- Page-only selected ids.
- Page-only form drafts.
- Page-only submit handlers.

If state is used by one page, keep it inside that page. Promote it only when another page needs the same state or action.

## Import Rules

Use the `@/*` alias for cross-folder imports.

Good:

```ts
import { routes } from "@/routes/routes";
import { Modal } from "@/shared/components/Modal";
```

Avoid cross-module relative imports:

```ts
import { Modal } from "../../shared/components/Modal";
```

Relative imports are acceptable only inside the same folder or page module.

## Page Module Template

```text
pages/new-module/
  index.tsx
  components/
    NewModulePanel.tsx
    NewModuleForm.tsx
  lib/
    new-module-utils.ts
  new-module.css
```

Start with only `index.tsx` and `new-module.css`. Add `components/` and `lib/` when the page grows.

## State Ownership

Use this decision rule:

```text
Used by one page only?
  Keep it in that page.

Used by several components inside one page?
  Keep it in the page and pass props, or extract a page-local helper.

Used by multiple pages?
  Move it to shared state or a global hook.

Represents server data?
  Keep API access in shared api/client code, but keep page-specific orchestration in the page.
```

## CSS Ownership

Global CSS should only define:

- Design tokens.
- Base element styles.
- App shell layout.
- Shared components.
- Shared responsive rules.

Page CSS should define:

- Page grid.
- Page-specific panels.
- Page-specific empty states.
- Page-specific form/table density.

Do not let `styles.css` become a large implementation file. It should import smaller files.

## New Module Checklist

Before merging a new desktop module:

- Add the route in `routes/routes.tsx`.
- Add a folder under `pages/`.
- Keep page state inside the page unless another page uses it.
- Put private components under the page folder.
- Put reusable components under `shared/components/` only after real reuse exists.
- Add page CSS instead of expanding global CSS.
- Run `npm run typecheck:ui`.
- Run `npm run build:ui`.

## Size Guidelines

These are guidelines, not hard limits:

- `App.tsx`: under 30 lines.
- `AppShell.tsx`: under 120 lines.
- `RouteRenderer.tsx`: under 150 lines.
- Global workspace hook: under 200 lines.
- Page `index.tsx`: under 300 lines before considering extraction.
- Shared components: small and focused.

When a file exceeds these ranges, split by responsibility instead of line count alone.
