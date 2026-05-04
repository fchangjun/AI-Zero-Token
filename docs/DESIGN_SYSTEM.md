# Desktop Design System

This document defines the baseline desktop design rules for AI Zero Token. The goal is a commercial-grade desktop utility that feels stable, dense, and professional.

## Product Feel

AI Zero Token is a local AI gateway control console, not a marketing website and not a chat-first app.

The interface should feel:

- Desktop-first.
- Operational.
- Calm and trustworthy.
- Dense enough for repeated daily use.
- Clear about service state, accounts, models, and API behavior.

Avoid:

- Landing-page hero sections inside the app.
- Decorative gradient-heavy pages.
- Oversized cards for simple controls.
- Mobile-first layouts.
- One-screen pages that cram unrelated modules together.

## Layout Principles

Use a persistent desktop shell:

- Left sidebar for primary modules.
- Topbar for active route context and global actions.
- Main content area for the selected page.
- Global overlays for account, settings, contact, and preview modals.

Each major function should be a separate route:

- Overview
- Accounts
- API Tester
- Request Logs
- Settings

Do not pack unrelated functions into a single page. The user should navigate between modules instead of scrolling through a dashboard full of mixed controls.

## Desktop Sizing

Primary target:

- Minimum practical width: `1180px`.
- Comfortable width: `1280px` to `1600px`.
- Height target: `760px` and above.

Desktop UI should use responsive desktop constraints, but it does not need mobile layouts.

Recommended shell dimensions:

- Sidebar: `240px` to `280px`.
- Topbar: `64px` to `76px`.
- Main content max width: page-specific, usually `1200px` to `1440px`.
- Page gap: `20px` to `28px`.
- Panel padding: `18px` to `24px`.

## Visual Language

Use a restrained neutral foundation with clear accent colors for status and action.

Recommended token categories:

```css
:root {
  --color-bg: #f6f7f9;
  --color-surface: #ffffff;
  --color-surface-muted: #f1f4f8;
  --color-border: #d9e0ea;
  --color-text: #18202f;
  --color-text-muted: #667085;
  --color-primary: #2563eb;
  --color-success: #16803c;
  --color-warning: #b76e00;
  --color-danger: #c2413a;
}
```

Avoid a single-hue UI. Status colors should carry meaning, not decoration.

## Typography

Use system fonts.

Recommended sizes:

- Page title: `24px` to `30px`.
- Section title: `16px` to `18px`.
- Body: `13px` to `14px`.
- Metadata: `12px` to `13px`.
- Table text: `12px` to `13px`.

Rules:

- Do not scale font size with viewport width.
- Do not use negative letter spacing.
- Keep dense operational screens readable, not dramatic.

## Components

### Buttons

Use clear command buttons.

- Primary actions use filled primary buttons.
- Secondary actions use bordered or subtle buttons.
- Icon-only buttons need tooltips.
- Use icons for common actions such as copy, refresh, settings, close, upload, and preview.

### Panels

Panels are functional containers, not decorative cards.

- Use radius `8px` or less.
- Avoid nested cards.
- Use clear headers when the panel has multiple controls.
- Keep related controls visually grouped.

### Tables and Lists

Operational data should be scannable.

- Use stable row height.
- Keep important columns visible.
- Use badges for state, provider, model, and method.
- Provide empty states that explain what is missing and how to recover.

### Forms

Forms should support repeated configuration work.

- Labels above fields.
- Inline validation when possible.
- Preserve drafts inside the owning page or settings module.
- Use toggles for binary settings.
- Use select menus for bounded choices.

### Modals and Drawers

Use overlays for focused temporary tasks.

Good candidates:

- Add account.
- Edit settings.
- Contact information.
- Image preview.

Do not use overlays as substitutes for real page routes.

## Icons and App Imagery

The app needs a coherent icon system:

- App icon.
- Sidebar route icons.
- Action icons.
- Status icons.
- Launch/onboarding visual.

Icon rules:

- Keep stroke weight consistent.
- Use simple geometric forms.
- Do not mix filled illustration icons with outline utility icons in the same control group.
- Prefer a proven icon library for interface icons.
- Use custom artwork only for the app mark and launch visual.

Launch imagery should communicate:

- Local gateway.
- Accounts/providers.
- API routing.
- Desktop control.

Avoid generic AI sparkle imagery that does not explain the product.

## Page Expectations

### Overview

Purpose: service state and quick operational summary.

Should show:

- Gateway status.
- API Base URL.
- Active account.
- Default model.
- Request summary.
- Recent health or usage trend.

### Accounts

Purpose: manage accounts and provider identity.

Should show:

- Account list.
- Active account.
- Quota or usage snapshot when available.
- Login, refresh, switch, and remove actions.

### API Tester

Purpose: test OpenAI-compatible endpoints.

Should show:

- Endpoint selector.
- Request body editor.
- Send action.
- Response viewer.
- Image upload and preview when endpoint supports it.

### Logs

Purpose: inspect recent gateway calls.

Should show:

- Method.
- Endpoint.
- Status.
- Duration.
- Time.
- Error detail when available.

### Settings

Purpose: configure local runtime behavior.

Should show:

- Gateway URL and listener details.
- Proxy settings.
- Default model.
- Auto-switch behavior.
- Save and reset actions.

## Acceptance Checklist

Before considering a desktop screen ready:

- It works at `1180px x 760px`.
- No text overlaps.
- No button label is clipped.
- Dense data remains scannable.
- Loading, empty, success, and error states exist.
- Page-specific controls live in that page.
- Shared components are actually reused.
- The screen can be understood without reading implementation notes inside the UI.
