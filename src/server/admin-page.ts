export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAI 本地网关</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --panel: #ffffff;
      --panel-soft: #f8fafc;
      --line: #e2e8f0;
      --line-strong: #cbd5e1;
      --text: #0f172a;
      --text-soft: #334155;
      --text-muted: #64748b;
      --brand: #635bff;
      --brand-soft: rgba(99, 91, 255, 0.1);
      --blue: #3b82f6;
      --blue-soft: rgba(59, 130, 246, 0.12);
      --green: #22c55e;
      --green-soft: rgba(34, 197, 94, 0.12);
      --orange: #f59e0b;
      --orange-soft: rgba(245, 158, 11, 0.12);
      --red: #ef4444;
      --red-soft: rgba(239, 68, 68, 0.12);
      --plan-color: #94a3b8;
      --plan-soft: rgba(148, 163, 184, 0.12);
      --plan-border: var(--line);
      --shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
      --radius: 16px;
      --radius-sm: 12px;
      --radius-xs: 10px;
    }

    * {
      box-sizing: border-box;
    }

    html {
      background: var(--bg);
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(99, 91, 255, 0.08), transparent 28%),
        radial-gradient(circle at right top, rgba(59, 130, 246, 0.06), transparent 32%),
        var(--bg);
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      border: 0;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
    }

    button:hover {
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.6;
      cursor: progress;
      transform: none;
    }

    .app-shell {
      width: calc(100vw - 24px);
      max-width: none;
      margin: 12px auto 24px;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .sidebar,
    .card,
    .summary-card,
    .account-card,
    .log-table-wrap,
    .tester-tabs,
    .trend-card,
    .service-card {
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }

    .sidebar {
      position: sticky;
      top: 20px;
      border-radius: 24px;
      padding: 22px 18px;
      display: grid;
      gap: 24px;
    }

    .brand {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .brand-mark {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: var(--brand);
      background: linear-gradient(180deg, rgba(99, 91, 255, 0.12), rgba(99, 91, 255, 0.04));
      border: 1px solid rgba(99, 91, 255, 0.18);
      flex: 0 0 auto;
    }

    .brand-title {
      display: grid;
      gap: 4px;
    }

    .brand-title strong {
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }

    .brand-title span {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .nav {
      display: grid;
      gap: 6px;
    }

    .nav-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 12px;
      border-radius: 12px;
      background: transparent;
      color: var(--text-soft);
      border: 1px solid transparent;
      text-align: left;
    }

    .nav-item svg {
      width: 16px;
      height: 16px;
      color: currentColor;
      flex: 0 0 auto;
    }

    .nav-item.is-active {
      color: var(--brand);
      background: rgba(99, 91, 255, 0.08);
      border-color: rgba(99, 91, 255, 0.08);
      font-weight: 600;
    }

    .service-card {
      border-radius: 16px;
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    .service-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
      flex: 0 0 auto;
    }

    .status-dot.offline {
      background: var(--orange);
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14);
    }

    .service-list {
      display: grid;
      gap: 10px;
    }

    .service-list.compact {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }

    .service-row {
      display: grid;
      gap: 4px;
    }

    .service-row.compact {
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
      min-width: 0;
    }

    .service-row label {
      color: var(--text-muted);
      font-size: 12px;
    }

    .service-row strong,
    .service-row code {
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .main {
      display: grid;
      gap: 20px;
      min-width: 0;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 16px;
    }

    .page-title {
      display: grid;
      gap: 6px;
    }

    .page-title h1 {
      margin: 0;
      font-size: clamp(28px, 3vw, 32px);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }

    .page-title p {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.6;
    }

    .top-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }

    .update-panel {
      display: none;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 18px;
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(245, 158, 11, 0.32);
      background:
        linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 251, 235, 0.92)),
        var(--panel);
      box-shadow: 0 18px 42px rgba(180, 83, 9, 0.12);
    }

    .update-panel.is-visible {
      display: grid;
    }

    .update-copy {
      display: grid;
      gap: 7px;
      min-width: 0;
    }

    .update-copy strong {
      color: #9a3412;
      font-size: 16px;
      line-height: 1.35;
    }

    .update-copy span {
      color: #7c2d12;
      font-size: 13px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    .update-command {
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(180, 83, 9, 0.22);
      background: rgba(255, 255, 255, 0.78);
      color: #7c2d12;
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
    }

    .summary-card {
      border-radius: 16px;
      padding: 18px;
      display: grid;
      gap: 8px;
      min-height: 112px;
    }

    .summary-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .summary-icon {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      color: var(--brand);
      background: var(--brand-soft);
    }

    .summary-icon svg {
      width: 14px;
      height: 14px;
      display: block;
    }

    .summary-icon.blue {
      color: var(--blue);
      background: var(--blue-soft);
    }

    .summary-icon.green {
      color: #15803d;
      background: var(--green-soft);
    }

    .summary-icon.orange {
      color: #b45309;
      background: var(--orange-soft);
    }

    .summary-card label {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.4;
    }

    .summary-card strong {
      font-size: 28px;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .summary-card .summary-value-sm {
      font-size: clamp(17px, 1.15vw, 20px);
      line-height: 1.25;
      letter-spacing: -0.02em;
      word-break: normal;
      overflow-wrap: anywhere;
    }

    .summary-card span {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .summary-card.account-status-summary {
      gap: 12px;
      min-height: 112px;
    }

    .account-status-list {
      display: grid;
      gap: 8px;
    }

    .account-status-line {
      display: grid;
      grid-template-columns: 20px auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--text-soft);
      font-size: 13px;
      line-height: 1.45;
    }

    .account-status-line svg {
      width: 18px;
      height: 18px;
      padding: 3px;
      border-radius: 999px;
      flex: 0 0 auto;
    }

    .account-status-line.gateway svg {
      color: var(--blue);
      background: var(--blue-soft);
    }

    .account-status-line.codex svg {
      color: #15803d;
      background: var(--green-soft);
    }

    .account-status-line span {
      color: var(--text-muted);
      font-weight: 700;
      white-space: nowrap;
    }

    .account-status-line strong {
      min-width: 0;
      color: var(--text);
      font-size: clamp(16px, 1.05vw, 18px);
      line-height: 1.25;
      letter-spacing: -0.02em;
      overflow-wrap: anywhere;
    }

    .main-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(460px, 560px);
      gap: 20px;
      align-items: start;
    }

    .content-stack,
    .aside-stack {
      display: grid;
      gap: 20px;
      min-width: 0;
    }

    .card {
      border-radius: 20px;
      padding: 20px;
      min-width: 0;
    }

    .section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .section-head h2,
    .section-head h3 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }

    .section-head p {
      margin: 6px 0 0;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.6;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .btn-primary,
    .btn-secondary,
    .btn-danger,
    .btn-ghost,
    .btn-link {
      min-height: 40px;
      padding: 0 14px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }

    .btn-primary {
      background: var(--brand);
      color: #fff;
    }

    .btn-secondary {
      background: #fff;
      color: var(--text-soft);
      border: 1px solid var(--line);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--red);
      border: 1px solid rgba(239, 68, 68, 0.12);
    }

    .btn-ghost {
      background: transparent;
      color: var(--text-soft);
      border: 1px dashed var(--line-strong);
    }

    .btn-link {
      background: #fff;
      color: var(--text-soft);
      border: 1px solid var(--line);
      text-decoration: none;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.48);
      backdrop-filter: blur(6px);
      z-index: 50;
    }

    .modal-backdrop.is-open {
      display: flex;
    }

    .drawer-backdrop {
      position: fixed;
      inset: 0;
      display: none;
      justify-content: flex-end;
      background: rgba(15, 23, 42, 0.38);
      backdrop-filter: blur(4px);
      z-index: 60;
    }

    .drawer-backdrop.is-open {
      display: flex;
    }

    .settings-drawer {
      width: min(460px, 100vw);
      height: 100vh;
      background: var(--panel);
      border-left: 1px solid var(--line);
      box-shadow: -18px 0 48px rgba(15, 23, 42, 0.16);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    .settings-drawer-head,
    .settings-drawer-footer {
      padding: 18px 20px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 1px solid var(--line);
    }

    .settings-drawer-footer {
      align-items: center;
      border-top: 1px solid var(--line);
      border-bottom: 0;
      background: #fbfdff;
    }

    .settings-drawer-head h3 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: -0.03em;
    }

    .settings-drawer-head p {
      margin: 6px 0 0;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.6;
    }

    .settings-drawer-body {
      padding: 18px 20px;
      overflow: auto;
      display: grid;
      align-content: start;
      gap: 16px;
    }

    .settings-section {
      display: grid;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }

    .settings-section:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .settings-section h4 {
      margin: 0;
      color: var(--text);
      font-size: 14px;
      line-height: 1.4;
    }

    .modal-card {
      width: min(760px, calc(100vw - 32px));
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
      border-radius: 24px;
      overflow: hidden;
    }

    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 20px 0;
    }

    .modal-head h3 {
      margin: 0;
      font-size: 24px;
      line-height: 1.15;
      letter-spacing: -0.03em;
    }

    .modal-head p {
      margin: 8px 0 0;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.6;
    }

    .modal-body {
      padding: 18px 20px 20px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
      gap: 20px;
      align-items: start;
    }

    .contact-notes {
      display: grid;
      gap: 14px;
    }

    .contact-note {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
      background: var(--panel-soft);
      display: grid;
      gap: 6px;
    }

    .contact-note strong {
      font-size: 14px;
      line-height: 1.4;
    }

    .contact-note span,
    .contact-note a,
    .contact-note code {
      color: var(--text-soft);
      font-size: 13px;
      line-height: 1.6;
      word-break: break-word;
    }

    .contact-note a {
      text-decoration: none;
    }

    .contact-qr {
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 14px;
      background: #fff;
      display: grid;
      gap: 10px;
    }

    .contact-qr img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
    }

    .contact-qr span,
    .contact-qr code {
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.6;
      text-align: center;
    }

    .control,
    .input,
    .textarea,
    .pre {
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
    }

    .control,
    .input {
      min-height: 40px;
      padding: 0 12px;
      outline: none;
    }

    .control:focus,
    .input:focus,
    .textarea:focus {
      border-color: rgba(99, 91, 255, 0.45);
      box-shadow: 0 0 0 4px rgba(99, 91, 255, 0.08);
    }

    .textarea {
      width: 100%;
      min-height: 168px;
      padding: 12px 14px;
      outline: none;
      resize: vertical;
      line-height: 1.6;
      font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
    }

    .hint {
      margin: 0;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.65;
    }

    .hint.warn {
      color: #b45309;
    }

    .account-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 18px;
    }

    .account-toolbar .input {
      flex: 1 1 220px;
      min-width: 0;
    }

    .account-toolbar .control {
      flex: 0 0 156px;
      min-width: 156px;
    }

    .account-selected-count {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
    }

    .account-modal-body .textarea {
      min-height: 280px;
    }

    .account-grid {
      display: grid;
      gap: 16px;
      align-items: start;
      justify-content: stretch;
      width: 100%;
    }

    .account-grid.profile-count-1 {
      grid-template-columns: minmax(340px, 520px);
    }

    .account-grid.profile-count-2 {
      grid-template-columns: repeat(2, minmax(340px, 1fr));
    }

    .account-grid.profile-count-3 {
      grid-template-columns: repeat(3, minmax(320px, 1fr));
    }

    .account-grid.profile-count-many {
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    }

    .account-card {
      --plan-color: #94a3b8;
      --plan-soft: rgba(148, 163, 184, 0.12);
      --plan-border: var(--line);
      --usage-color: #16a34a;
      --usage-soft: rgba(22, 163, 74, 0.12);
      position: relative;
      border-radius: 16px;
      padding: 14px;
      display: grid;
      grid-template-rows: auto auto auto 1fr auto;
      gap: 12px;
      min-width: 0;
      border-color: var(--plan-border);
      overflow: hidden;
    }

    .account-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 3px;
      background: var(--plan-color);
    }

    .account-card.plan-free {
      --plan-color: #94a3b8;
      --plan-soft: rgba(148, 163, 184, 0.12);
      --plan-border: var(--line);
    }

    .account-card.plan-plus {
      --plan-color: #635bff;
      --plan-soft: rgba(99, 91, 255, 0.11);
      --plan-border: rgba(99, 91, 255, 0.2);
    }

    .account-card.plan-pro {
      --plan-color: #4f46e5;
      --plan-soft: rgba(79, 70, 229, 0.11);
      --plan-border: rgba(79, 70, 229, 0.22);
    }

    .account-card.plan-team {
      --plan-color: #0f766e;
      --plan-soft: rgba(15, 118, 110, 0.11);
      --plan-border: rgba(15, 118, 110, 0.22);
    }

    .account-card.plan-premium {
      --plan-color: #d97706;
      --plan-soft: rgba(217, 119, 6, 0.12);
      --plan-border: rgba(217, 119, 6, 0.34);
      box-shadow: 0 10px 26px rgba(180, 83, 9, 0.1), var(--shadow);
    }

    .account-card.plan-enterprise {
      --plan-color: #a16207;
      --plan-soft: rgba(161, 98, 7, 0.14);
      --plan-border: rgba(71, 85, 105, 0.28);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1), var(--shadow);
    }

    .account-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding-top: 8px;
    }

    .account-title {
      display: grid;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }

    .account-select {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 0 8px;
      margin-top: 28px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .account-select input {
      width: 14px;
      height: 14px;
      margin: 0;
    }

    .account-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .avatar {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: var(--panel-soft);
      border: 1px solid var(--plan-color);
      box-shadow: 0 0 0 3px var(--plan-soft);
      display: grid;
      place-items: center;
      font-size: 11px;
      color: var(--plan-color);
      font-weight: 700;
      flex: 0 0 auto;
    }

    .account-name strong {
      font-size: 13px;
      line-height: 1.35;
      min-width: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .badge.brand {
      color: var(--plan-color);
      background: var(--plan-soft);
    }

    .usage-corner {
      position: absolute;
      top: 10px;
      right: 12px;
      min-height: 24px;
      padding: 0 10px 0 8px;
      border-radius: 999px;
      color: #047857;
      background: linear-gradient(135deg, #ecfdf5, #d1fae5);
      border: 1px solid rgba(16, 185, 129, 0.28);
      box-shadow: 0 8px 18px rgba(16, 185, 129, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.82);
      font-size: 10px;
      font-weight: 800;
      line-height: 22px;
      letter-spacing: 0;
      pointer-events: none;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .usage-corner::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
      flex: 0 0 auto;
    }

    .usage-corner span {
      line-height: 1;
    }

    .usage-corner.codex-only {
      color: #1d4ed8;
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border-color: rgba(37, 99, 235, 0.24);
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.82);
    }

    .usage-corner.codex-only::before {
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .usage-corner.dual {
      color: #4f46e5;
      background: linear-gradient(135deg, #f5f3ff, #ede9fe);
      border-color: rgba(99, 91, 255, 0.25);
      box-shadow: 0 8px 18px rgba(99, 91, 255, 0.13), inset 0 1px 0 rgba(255, 255, 255, 0.82);
    }

    .usage-corner.dual::before {
      box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.12);
    }

    .badge.blue {
      color: var(--blue);
      background: var(--blue-soft);
    }

    .badge.green {
      color: #15803d;
      background: var(--green-soft);
    }

    .badge.orange {
      color: #b45309;
      background: var(--orange-soft);
    }

    .badge.red {
      color: #dc2626;
      background: var(--red-soft);
    }

    .account-metrics {
      display: grid;
      gap: 10px;
    }

    .usage-status-row {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--panel-soft);
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.4;
    }

    .usage-status {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      white-space: nowrap;
      font-weight: 700;
    }

    .usage-status svg {
      width: 12px;
      height: 12px;
      color: var(--text-muted);
      flex: 0 0 auto;
    }

    .usage-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #cbd5e1;
      flex: 0 0 auto;
    }

    .usage-dot.active {
      background: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
    }

    .usage-state-text {
      color: var(--text-muted);
      font-weight: 700;
    }

    .usage-status.is-active .usage-state-text {
      color: #15803d;
    }

    .compact-meta-row {
      display: grid;
      gap: 8px;
      min-width: 0;
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.45;
    }

    .compact-reset-list {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .compact-meta-item {
      display: flex;
      align-items: baseline;
      gap: 5px;
      min-width: 0;
      flex: 1 1 0;
    }

    .compact-meta-item label {
      color: var(--text-muted);
      font-size: 10px;
      line-height: 1.4;
      white-space: nowrap;
    }

    .compact-meta-item strong {
      color: var(--text-soft);
      font-size: 11px;
      line-height: 1.4;
      text-align: left;
      overflow-wrap: anywhere;
    }

    .compact-meta-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 2px;
    }

    .compact-meta-actions::before,
    .compact-meta-actions::after {
      content: "";
      height: 1px;
      background: var(--line);
      flex: 1 1 auto;
      min-width: 18px;
    }

    .details-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-height: 24px;
      padding: 0 6px;
      border: 0;
      background: transparent;
      color: var(--brand);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }

    .details-toggle:hover {
      color: #4338ca;
    }

    .details-toggle svg {
      width: 12px;
      height: 12px;
      transition: transform 0.16s ease;
    }

    .details-toggle.is-expanded svg {
      transform: rotate(180deg);
    }

    .quota-row {
      display: grid;
      gap: 6px;
    }

    .quota-line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--text-soft);
      font-size: 11px;
      line-height: 1.45;
    }

    .quota-line span {
      min-width: 0;
    }

    .quota-line strong {
      flex-shrink: 0;
      color: var(--text);
      font-size: 12px;
    }

    .progress-track {
      height: 5px;
      width: 100%;
      border-radius: 999px;
      background: #eef2f7;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      border-radius: inherit;
      background: var(--brand);
    }

    .progress-bar.blue {
      background: var(--blue);
    }

    .progress-bar.green {
      background: #10b981;
    }

    .progress-bar.orange {
      background: var(--orange);
    }

    .progress-bar.red {
      background: #f43f5e;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
    }

    .meta-item {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .meta-item label {
      color: var(--text-muted);
      font-size: 10px;
      line-height: 1.4;
    }

    .meta-item strong,
    .meta-item span,
    .meta-item code {
      font-size: 11px;
      line-height: 1.45;
      color: var(--text-soft);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .account-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
    }

    .account-actions .btn-secondary,
    .account-actions .btn-danger {
      flex: 1 1 120px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 10px;
      font-size: 12px;
    }

    .account-actions .btn-secondary.is-current {
      position: relative;
      opacity: 1;
      color: #047857;
      background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      border-color: rgba(16, 185, 129, 0.36);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 6px 14px rgba(16, 185, 129, 0.08);
      cursor: default;
    }

    .account-actions .btn-secondary.is-current::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
      flex: 0 0 auto;
    }

    .account-actions .btn-secondary.is-current.codex {
      color: #1d4ed8;
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      border-color: rgba(37, 99, 235, 0.32);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 6px 14px rgba(37, 99, 235, 0.08);
    }

    .account-actions .btn-secondary.is-current.codex::before {
      background: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
    }

    .account-status {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 10px;
      background: var(--panel-soft);
      border: 1px solid var(--line);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
    }

    .empty-state {
      border: 1px dashed var(--line-strong);
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.7;
    }

    .trend-card {
      border-radius: 18px;
      padding: 18px;
      display: grid;
      gap: 14px;
    }

    .chart-wrap {
      width: 100%;
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(248, 250, 252, 0.6), #fff);
      padding: 14px;
    }

    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--text-muted);
      font-size: 12px;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .legend-swatch {
      width: 10px;
      height: 10px;
      border-radius: 999px;
    }

    .trend-svg {
      width: 100%;
      height: 210px;
      display: block;
    }

    .trend-labels {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.4;
      margin-top: 10px;
    }

    .tester-card {
      display: grid;
      gap: 16px;
    }

    .tester-tabs {
      border-radius: 14px;
      padding: 6px;
      display: flex;
      gap: 6px;
      width: fit-content;
      max-width: 100%;
    }

    .tab-btn {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 10px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
    }

    .tab-btn.is-active {
      background: #fff;
      color: var(--brand);
      box-shadow: var(--shadow);
    }

    .field {
      display: grid;
      gap: 8px;
    }

    .field label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-soft);
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-soft);
      font-size: 13px;
      font-weight: 600;
    }

    .checkbox-row input {
      width: 16px;
      height: 16px;
      accent-color: var(--brand);
    }

    .pre {
      margin: 0;
      padding: 14px;
      min-height: 280px;
      max-height: 460px;
      overflow: auto;
      background: #0f172a;
      border-color: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
      font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .status-inline {
      min-height: 20px;
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .tester-result {
      display: grid;
      gap: 12px;
    }

    .tester-result-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tester-result-tabs .tab-btn {
      border: 1px solid var(--line);
      background: #fff;
    }

    .tester-panel {
      display: none;
      gap: 12px;
    }

    .tester-panel.is-active {
      display: grid;
    }

    .preview-empty {
      border: 1px dashed var(--line-strong);
      border-radius: 14px;
      padding: 18px;
      background: var(--panel-soft);
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.7;
    }

    .preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .preview-card {
      margin: 0;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #fff;
      display: grid;
      gap: 10px;
    }

    .preview-card img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
      cursor: zoom-in;
    }

    .preview-card figcaption {
      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.6;
      word-break: break-word;
    }

    .preview-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .preview-actions a {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      color: var(--text-soft);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }

    .preview-modal-card {
      width: min(1120px, calc(100vw - 32px));
    }

    .preview-modal-body {
      padding: 18px 20px 20px;
      display: grid;
      gap: 16px;
    }

    .preview-modal-stage {
      display: grid;
      place-items: center;
      min-height: 420px;
      max-height: calc(100vh - 240px);
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 20px;
      background:
        linear-gradient(135deg, rgba(99, 91, 255, 0.06), transparent 42%),
        var(--panel-soft);
      padding: 16px;
    }

    .preview-modal-stage img {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 280px);
      width: auto;
      height: auto;
      border-radius: 14px;
      background: #fff;
      box-shadow: var(--shadow);
    }

    .preview-modal-meta {
      color: var(--text-soft);
      font-size: 13px;
      line-height: 1.7;
      word-break: break-word;
    }

    .log-table-wrap {
      border-radius: 20px;
      overflow: hidden;
    }

    .log-table {
      width: 100%;
      border-collapse: collapse;
    }

    .log-table th,
    .log-table td {
      text-align: left;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.5;
      vertical-align: top;
    }

    .log-table th {
      color: var(--text-muted);
      font-weight: 600;
      background: #fbfdff;
    }

    .log-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .log-table code {
      font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
      color: var(--text-soft);
      font-size: 12px;
    }

    .table-footer {
      padding: 14px 16px;
      border-top: 1px solid var(--line);
      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.6;
      background: #fbfdff;
    }

    .mono {
      font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    }

    @media (max-width: 1080px) {
      .app-shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
      }

      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .app-shell {
        width: calc(100vw - 16px);
        margin: 10px auto 20px;
        gap: 14px;
      }

      .sidebar,
      .card,
      .summary-card,
      .log-table-wrap {
        border-radius: 18px;
      }

      .topbar,
      .section-head {
        flex-direction: column;
        align-items: stretch;
      }

      .top-actions {
        justify-content: stretch;
      }

      .top-actions .btn-primary,
      .top-actions .btn-secondary,
      .top-actions .btn-danger,
      .top-actions .btn-link {
        flex: 1 1 0;
      }

      .modal-body {
        grid-template-columns: 1fr;
      }

      .summary-grid,
      .account-grid,
      .account-grid.profile-count-1,
      .account-grid.profile-count-2,
      .account-grid.profile-count-3,
      .account-grid.profile-count-many,
      .preview-grid,
      .meta-grid,
      .trend-labels {
        grid-template-columns: 1fr;
      }

      .account-toolbar .control {
        flex: 1 1 100%;
        min-width: 0;
      }

      .log-table-wrap {
        overflow-x: auto;
      }

      .log-table {
        min-width: 760px;
      }
    }

    @media (max-width: 640px) {
      .modal-backdrop {
        padding: 12px;
      }

      .settings-drawer {
        width: 100vw;
      }

      .modal-head,
      .modal-body {
        padding-left: 16px;
        padding-right: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3.4 18.8 7.2v7.6L12 20.6 5.2 16.8V7.2L12 3.4Z"></path>
            <path d="M12 7.5 15.8 9.7v4.6L12 16.5l-3.8-2.2V9.7L12 7.5Z"></path>
          </svg>
        </div>
        <div class="brand-title">
          <strong>OpenAI 本地网关</strong>
          <span>本地优先的 OpenAI 风格 API 网关与账号管理台</span>
        </div>
      </div>

      <nav class="nav" aria-label="主导航">
        <button class="nav-item is-active" type="button" data-nav-target="overview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11 12 4l8 7"></path><path d="M6 10.8V20h12v-9.2"></path></svg>
          概览
        </button>
        <button class="nav-item" type="button" data-nav-target="accounts">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          账号管理
        </button>
        <button class="nav-item" type="button" data-nav-target="tester">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m10 13 2 2 4-4"></path><path d="M12 3 4 7v6c0 5 3.4 7.7 8 8 4.6-.3 8-3 8-8V7l-8-4Z"></path></svg>
          接口测试
        </button>
        <button class="nav-item" type="button" data-nav-target="logs">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>
          请求日志
        </button>
        <button class="nav-item" type="button" data-open-settings>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .33 1.76l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.6 1.6 0 0 0-1.76-.33 1.6 1.6 0 0 0-.97 1.46V21a2 2 0 0 1-4 0v-.09a1.6 1.6 0 0 0-.97-1.46 1.6 1.6 0 0 0-1.76.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.76 1.6 1.6 0 0 0-1.46-.97H3a2 2 0 0 1 0-4h.09a1.6 1.6 0 0 0 1.46-.97 1.6 1.6 0 0 0-.33-1.76l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.6 1.6 0 0 0 1.76.33H9a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.76V9c0 .64.38 1.22.97 1.46H21a2 2 0 0 1 0 4h-.09c-.64 0-1.22.38-1.46.97Z"></path></svg>
          系统设置
        </button>
      </nav>

      <section class="service-card" id="sidebarServiceCard">
        <div class="service-head">
          <strong>服务状态</strong>
          <span class="badge green"><span class="status-dot" id="serviceDot"></span><span id="serviceLabel">读取中</span></span>
        </div>
        <div class="service-list" id="serviceInfo"></div>
      </section>
    </aside>

    <main class="main">
      <header class="topbar" id="overview">
        <div class="page-title">
          <h1>概览</h1>
          <p id="heroDescription">用于管理本地 OpenAI 风格网关的账号、默认模型与接口调试。</p>
        </div>
        <div class="top-actions">
          <a class="btn-link" href="https://github.com/fchangjun/AI-Zero-Token" target="_blank" rel="noreferrer">GitHub 仓库</a>
          <button class="btn-secondary" id="openSettingsBtn" type="button">设置</button>
          <button class="btn-secondary" id="contactBtn" type="button">交流反馈</button>
          <button class="btn-secondary" id="toggleEmailBtn" type="button">脱敏模式</button>
          <button class="btn-primary" id="loginBtn" type="button">+ 新增账号</button>
          <button class="btn-secondary" id="refreshBtn" type="button">刷新状态</button>
          <button class="btn-danger" id="logoutBtn" type="button">清空账号</button>
        </div>
      </header>

      <section class="update-panel" id="updatePanel" aria-live="polite">
        <div class="update-copy">
          <strong id="updatePanelTitle">发现新版本</strong>
          <span id="updatePanelDetail"></span>
        </div>
        <code class="update-command" id="updatePanelCommand">npm install -g ai-zero-token</code>
      </section>

      <section class="summary-grid" id="summaryGrid"></section>

      <section class="main-grid">
        <div class="content-stack">
          <section class="card" id="accounts">
            <div class="section-head">
              <div>
                <h2>账号额度预览</h2>
                <p>账号信息采用卡片式布局展示，支持搜索、状态筛选和额度排序。</p>
              </div>
              <div class="actions">
                <button class="btn-secondary" type="button" id="activateCurrentBtn">定位当前账号</button>
                <button class="btn-secondary" type="button" id="exportSelectedProfilesBtn">导出所选</button>
              </div>
            </div>

            <div class="account-toolbar">
              <input class="input" id="profileSearch" type="search" placeholder="搜索邮箱、账号 ID 或 Profile ID" />
              <select class="control" id="profileStatusFilter">
                <option value="all">全部状态</option>
                <option value="healthy">健康</option>
                <option value="warning">即将耗尽</option>
                <option value="invalid">登录失效</option>
                <option value="expired">已过期</option>
                <option value="active">使用中</option>
              </select>
              <select class="control" id="profileSort">
                <option value="quota-desc">按主额度排序</option>
                <option value="latency-asc">按额度更新时间</option>
                <option value="expiry-asc">按过期时间</option>
                <option value="name-asc">按邮箱排序</option>
              </select>
              <span class="account-selected-count" id="selectedProfileCount">已选择 0 个</span>
            </div>
            <div class="account-grid" id="profileList"></div>
          </section>

          <section class="trend-card">
            <div class="section-head" style="margin-bottom: 0;">
              <div>
                <h3>请求耗时趋势</h3>
                <p>基于当前账号池和最近测试请求生成的本地趋势预览。</p>
              </div>
              <div class="actions">
                <select class="control" id="trendWindow">
                  <option value="60">最近 1 小时</option>
                  <option value="180">最近 3 小时</option>
                  <option value="720">最近 12 小时</option>
                </select>
              </div>
            </div>
            <div class="chart-wrap">
              <div class="chart-legend">
                <span class="legend-item"><span class="legend-swatch" style="background:#635bff;"></span>本地网关 → 上游</span>
                <span class="legend-item"><span class="legend-swatch" style="background:#3b82f6;"></span>管理页 → 本地网关</span>
              </div>
              <svg class="trend-svg" id="trendSvg" viewBox="0 0 720 210" preserveAspectRatio="none"></svg>
              <div class="trend-labels" id="trendLabels"></div>
            </div>
          </section>

          <section class="log-table-wrap" id="logs">
            <table class="log-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>方法</th>
                  <th>接口</th>
                  <th>账号</th>
                  <th>模型</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody id="requestLogBody"></tbody>
            </table>
            <div class="table-footer" id="requestLogFooter">最近请求会在你使用调试面板后持续追加到这里。</div>
          </section>
        </div>

        <aside class="aside-stack">
          <section class="card tester-card" id="tester">
            <div class="section-head" style="margin-bottom: 0;">
              <div>
                <h2>快速测试</h2>
                <p>页面直接调用当前网关暴露的 OpenAI 风格接口。</p>
              </div>
              <span class="badge brand" id="testerMeta">准备就绪</span>
            </div>

            <div class="tester-tabs" id="testerTabs">
              <button class="tab-btn is-active" type="button" data-endpoint="/v1/chat/completions">Chat</button>
              <button class="tab-btn" type="button" data-endpoint="/v1/images/generations">Images</button>
              <button class="tab-btn" type="button" data-endpoint="/v1/images/edits">Edits</button>
              <button class="tab-btn" type="button" data-endpoint="/v1/responses">Responses</button>
              <button class="tab-btn" type="button" data-endpoint="/v1/models">Models</button>
            </div>

            <div class="field">
              <label for="endpointSelect">接口</label>
              <select class="control" id="endpointSelect"></select>
            </div>

            <div class="field">
              <label for="requestBody">请求体 JSON</label>
              <textarea class="textarea" id="requestBody" spellcheck="false"></textarea>
              <p class="hint"><code>GET /v1/models</code> 无需请求体；图片接口会自动渲染预览，并折叠 <code>b64_json</code> 文本。</p>
              <p class="hint" id="imageCapabilityHint"></p>
            </div>

            <div class="actions">
              <button class="btn-secondary" type="button" data-example="/v1/models">示例 Models</button>
              <button class="btn-secondary" type="button" data-example="/v1/responses">示例 Responses</button>
              <button class="btn-secondary" type="button" data-example="/v1/chat/completions">示例 Chat</button>
              <button class="btn-secondary" type="button" data-example="/v1/images/generations">示例 Images</button>
              <button class="btn-secondary" type="button" data-example="/v1/images/edits">示例 Edits</button>
              <button class="btn-primary" id="runTestBtn" type="button">发送请求</button>
            </div>

            <p class="status-inline" id="authStatus"></p>

            <div class="tester-result">
              <div class="tester-result-tabs">
                <button class="tab-btn is-active" type="button" data-result-tab="response">响应 JSON</button>
                <button class="tab-btn" type="button" data-result-tab="timing">耗时日志</button>
                <button class="tab-btn" type="button" data-result-tab="preview">图片预览</button>
              </div>

              <div class="tester-panel is-active" data-result-panel="response">
                <div class="field">
                  <label for="responseBody">响应结果</label>
                  <pre class="pre" id="responseBody">等待请求…</pre>
                </div>
              </div>

              <div class="tester-panel" data-result-panel="timing">
                <div class="field">
                  <label for="timingBody">耗时日志</label>
                  <pre class="pre" id="timingBody">等待请求…</pre>
                </div>
              </div>

              <div class="tester-panel" data-result-panel="preview">
                <div class="field">
                  <label>图片预览</label>
                  <div class="preview-empty" id="responsePreviewEmpty">图片结果会显示在这里。点击缩略图可查看大图。</div>
                  <div class="preview-grid" id="responsePreview"></div>
                </div>
              </div>
            </div>
          </section>

          <section class="card service-card">
            <div class="section-head" style="margin-bottom: 12px;">
              <div>
                <h2>连接信息</h2>
                <p>管理页和 API Base 可直接复制到 SDK 或测试工具。</p>
              </div>
            </div>
            <div class="service-list compact" id="endpointInfo"></div>
          </section>
        </aside>
      </section>
    </main>
  </div>

  <div class="drawer-backdrop" id="settingsDrawerBackdrop" aria-hidden="true">
    <aside class="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settingsDrawerTitle">
      <div class="settings-drawer-head">
        <div>
          <h3 id="settingsDrawerTitle">系统设置</h3>
          <p>集中管理默认模型、上游代理和额度耗尽后的自动切换策略。</p>
        </div>
        <button class="btn-secondary" id="closeSettingsDrawerBtn" type="button">关闭</button>
      </div>
      <div class="settings-drawer-body">
        <section class="settings-section">
          <h4>默认模型</h4>
          <div class="field">
            <label for="defaultModel">默认模型</label>
            <select class="control" id="defaultModel"></select>
            <p class="hint">影响未显式传 <code>model</code> 的请求。</p>
            <p class="hint" id="modelCatalogHint"></p>
            <div class="actions">
              <button class="btn-secondary" id="refreshModelsBtn" type="button">同步 Codex 模型</button>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4>上游代理</h4>
          <div class="field">
            <label class="checkbox-row" for="proxyEnabled">
              <input id="proxyEnabled" type="checkbox" />
              启用上游代理
            </label>
            <label for="proxyUrl">代理地址</label>
            <input class="input" id="proxyUrl" type="text" placeholder="填写你的代理地址" />
            <label for="proxyNoProxy">直连地址</label>
            <input class="input" id="proxyNoProxy" type="text" placeholder="localhost,127.0.0.1,::1" />
            <p class="hint">启用后，OAuth 换取 token、模型刷新和接口转发会通过此代理访问海外上游。</p>
            <div class="actions">
              <button class="btn-secondary" id="testProxyBtn" type="button">测试代理</button>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4>账号切换</h4>
          <div class="field">
            <label class="checkbox-row" for="autoSwitchEnabled">
              <input id="autoSwitchEnabled" type="checkbox" />
              额度耗尽自动切换
            </label>
            <p class="hint">开启后，当前 API 账号额度快照已耗尽时，网关会按账号池顺序切到仍有额度的账号，并尽量避开 Codex 正在使用的账号。</p>
          </div>
        </section>
      </div>
      <div class="settings-drawer-footer">
        <p class="status-inline" id="settingsStatus"></p>
        <button class="btn-primary" id="saveSettingsBtn" type="button">保存设置</button>
      </div>
    </aside>
  </div>

  <div class="modal-backdrop" id="imagePreviewModal" aria-hidden="true">
    <section class="modal-card preview-modal-card" role="dialog" aria-modal="true" aria-labelledby="imagePreviewTitle">
      <div class="modal-head">
        <div>
          <h3 id="imagePreviewTitle">图片预览</h3>
          <p>查看生图结果的更大版本，避免在侧栏内滚动查看。</p>
        </div>
        <div class="actions">
          <a class="btn-secondary" id="downloadPreviewBtn" href="#" download="generated-image.png">下载图片</a>
          <button class="btn-secondary" id="closeImagePreviewBtn" type="button">关闭</button>
        </div>
      </div>
      <div class="preview-modal-body">
        <div class="preview-modal-stage">
          <img id="previewModalImage" src="" alt="生成图片预览" />
        </div>
        <div class="preview-modal-meta" id="previewModalMeta">等待图片结果…</div>
      </div>
    </section>
  </div>

  <div class="modal-backdrop" id="accountModal" aria-hidden="true">
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
      <div class="modal-head">
        <div>
          <h3 id="accountModalTitle">新增账号</h3>
          <p>选择 OAuth 登录，或粘贴单个/批量账号 JSON 导入。</p>
        </div>
        <div class="actions">
          <button class="btn-secondary" id="closeAccountModalBtn" type="button">关闭</button>
        </div>
      </div>
      <div class="modal-body account-modal-body">
        <div class="contact-notes">
          <div class="contact-note">
            <strong>登录新增</strong>
            <span>打开 OpenAI OAuth 授权流程，登录成功后自动保存并切换为当前账号。</span>
            <button class="btn-primary" id="oauthLoginBtn" type="button">登录</button>
          </div>
          <div class="contact-note">
            <strong>批量导入</strong>
            <span>支持单个对象、对象数组，或包含 profiles 数组的对象。导入后最后一个账号会成为当前账号。</span>
            <div class="actions">
              <button class="btn-secondary" id="loadImportTemplateBtn" type="button">填入参考格式</button>
              <button class="btn-primary" id="importProfileBtn" type="button">导入</button>
            </div>
          </div>
        </div>
        <div>
          <textarea class="textarea" id="profileImportJson" spellcheck="false" placeholder='粘贴账号 JSON，支持 { "profiles": [...] } 批量导入'></textarea>
          <p class="hint">导入和导出的 JSON 都包含完整 access token 和 refresh token，请只在可信环境中处理。</p>
        </div>
      </div>
    </section>
  </div>

  <div class="modal-backdrop" id="contactModal" aria-hidden="true">
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="contactModalTitle">
      <div class="modal-head">
        <div>
          <h3 id="contactModalTitle">交流反馈</h3>
          <p>欢迎反馈问题、交流使用场景或讨论后续迭代。先加我微信，备注 “AI Zero Token”，再拉你进群。</p>
        </div>
        <button class="btn-secondary" id="closeContactBtn" type="button">关闭</button>
      </div>
      <div class="modal-body">
        <div class="contact-notes">
          <div class="contact-note">
            <strong>加群方式</strong>
            <span>先扫码添加微信，备注 <code>AI Zero Token</code>，我会再拉你进入交流群。</span>
          </div>
          <div class="contact-note">
            <strong>适合反馈的内容</strong>
            <span>安装问题、账号切换、生图异常、接口兼容需求、想支持的模型、以及你自己的接入场景。</span>
          </div>
          <div class="contact-note">
            <strong>公开问题反馈</strong>
            <a href="https://github.com/fchangjun/AI-Zero-Token/issues" target="_blank" rel="noreferrer">GitHub Issues</a>
          </div>
        </div>
        <div class="contact-qr">
          <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgFBgcGBQgHBgcJCAgJDBMMDAsLDBgREg4THBgdHRsYGxofIywlHyEqIRobJjQnKi4vMTIxHiU2OjYwOiwwMTD/2wBDAQgJCQwKDBcMDBcwIBsgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDD/wAARCAXTBFYDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKM0AFFGaM0AFFGaM0AFFGaM0AFFGaM0AFFGaM0AFFGaM0AFFGaM0AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRQelAFC6uGLGOM4x1NVWJ9TQTli3rRQA0Z70uaKKADNBPFMmlWKMySMqIq5JJwABXnfiX4kBXe20KPcw4NxIOPwFS5JFxi5Ho+T6mjJrxuy8feILWcS3UouIiRlZEA49iK9X0XUodX02G9t/uSrnGeh7iiMkwlBxLozQSe1BNAFUQApc0VS1DU7HTlDXtzHAD03OBn8KTdhpN7F3JPT86TPp+dZlj4j0jUX8uzv4ZH/ALucE/ga06E09gaa3AZ7mjJPSj60uRjn8qYgGR0Yj8atWly24JJyD0aqlKPvrigZs0UDpRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKK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mi6jJfef5qoPKfaNmf61BfWN/wCbLcLqZgi5OOcKKj8J/wDL9/12/wAaTxXLcNHFbxRu0MnLlBuJ56UAZ2mWN/qLm+F20ZU7UlfOTxg49q0l0zVG+7rDN9Mn+tQprXk2hgi024CqpUbvp34qroWrNZWDRizlm+cnK9OQOKANSHTNTSeN5NTaRFcMVOeR6da26ybDWDd3AiaylhyCdz9OK1qACuavdOVbp/K0Xz1znzPPYZ7njPrXQ3EQngeJiQHUqcdcGuU1KytLO9S2Avpndd2FlGcc9BjnpQBV1e2MVurNpf2TLY3ecWzweMVdGnnA/wCKfLf9vB/xqA2tsRzYasfwH+FI8MCJu+x6oqqM8nAGPXigDd0O0W3R5PsP2OQnbjzC2R1rRu/+PSb/AK5t/KsfQbC1dYNQhacH5sK7g+q9gK2Lv/j0m/65t/KgDjrW0gbSGu7uW42mTaRFyO3JzWtZaHaTW6va31wYj0IYf4VT0PV7Sy0/7PcBydxJAAIwfxoe90UWzwRfaYkZ9+VHIPTjnpQBa8NReVql+iszLGdmfU5PX34rol6VzOnavpOmxMluLhy5yxZQST+ddKh3KD680AOooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoPSig9KAMVvvH61k+LNUXSNBuLknDbSqe7HpWs33j9a8n+J11fXWoeQctbxOcRjp04P8AOpk9CoK7OfgsXudPuJnGZZOQfxzXT6TrZu/hxd2rP/pFqAnvtJ4rl49Wu0jCC2AC8Dg/41DpdwEv3juWMFvc8S47CudnQkbn2uew0K1ljIGJpIxu2kbSRnAJz+mK6HUoTP4IgRZSuJQeNrA9fQkfrVYx+FIEg+z606tEhjclFfdk5zhgQD9KtJeeEodBbTY9TbaW3eaUyQ3rjGP0poGcJbxKLu63LtROuBkr9Oa6nxNcm903QLazZ/s0kJb95tUll9yeual02PwNaK5u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ooAMUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABzRzRzRzQAc0c0c0c0AHNHNHNHNABzRzRzRzQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUCCiiigAooooGFFFFABRRRQAUUUUCCiiigAooooAKKKKBhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUmRRkUroBaKTIoyKLoBc0ZpNwo3Ci6DUXNGaTcKNwoug1FzRmk3CjcKLoNRc0ZpNwo3Ci6DUWik3CjcKLoLC0Um4UbhRdALRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooozQAUUmRRkUBqLRSZFGRQAUUZFGRQAUUUZoAWim5FGRQFmOopuRRkUBZjqKTIoyKAsxaKTIoyKA1FooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoooNAHJeNPFg0lTa2RDXjDr1EY9T7+1ea319dX8xlvJ2mc5wWOcZOcD0HsKXUruXUL+4upjl5GJI3E7c9h7dhVavmMTiXVk0tj63C4SFGCbWvVgBjr1paKK5NTusgoNFBqte4WQAjHWlyPWkGMUcUahZC9fpSE0E0lGoWQobim7qcCcdKbz6UahZBRSig9KrULIUHjrSE+9HGKQ4o1D3RetCnP+yaSildhZHUeGvGN7p90sd7M9xatw285ZfcE8/h0r1S3mSeJZImDo4yrDuK8Er074a30l1o0lvJyLZ9qnOTg816+BxEnLkkeDmeFjFe1grdzsaKaPxpa9g8IWiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKxfEXiO10KBWuAXkc/LEpG4j1+lbVeZ/Fb/kJWX/XNv51hiKjp03JHVhKUa1VQlsaP/CyrTP8Ax43H/fS1teG/FNrrrSJEjRSx8+W5BJHqMV49zXWfC3/kY5P+vd//AEJK87D4qpKoos9fFYCjTpOcd0erUUCivYPngooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKD0oAp6hexafaS3Vy22KIZY/59+K48fEyy7WM5/4EK2fiD/yKV99E/8ARi146elcOIrSpysj2cvwdOvByn3sen2PxEsLq7igkglt1c48xyMD61veI9etdAtFmuSWLHCIOrn2rxOP76fUV3/xdOYtM/3pf/ZaVOvJ05Se6NK+BpQrwgtne5Z/4WZZ/wDPjcf99LWp4d8Z2WuXjWiRvby43IHYfP6gYryAYrf+H/8AyOFj/wBtP/RbVlTxM5SSZviMuoxpylFWaVz2gdKKKK9Q+bCiiigArM8Q6zb6LYNd3JO0cKg6uewFadeV/FHUJJtWjsjxHAoYcnkt3I9u1ZVZ8kbnVhaPtqqi9jC1vxHqerSSG5uWWEn/AFSnCAZyBx1x6nmsnvkUUteRKo5O7Pr4UoQXLFWQn86KOKOKnmNeWIlBozQelHMTyoUHjrS596QYxRxRzByoTr9KQmnGkquYOVCg8daQn3peMUnGaOYrlQUjGlpD0o5g5UAPHWlz70gxijijmDliHWtTRfEGo6PIpsrhxGDkxE5Q9M/KeM8detZdFOMmtURKlCouWauj2/w1r9tr1h50DASJgSJ3U/4GtgDivIvhnfS2/iWO2T/V3SMrDJwMKWBx68Y+hNevDrXq0Zucbs+RxuHVCs4LboLRRRWxxBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUGig0AeBcKMDrSUUV8Y9z7pfCFall4c1e+gE1rZO8bdCWVc/gSDR4VtI73xBaQTgtEWJIHfCkj9RXs0UaRxhEAVRwAK9HCYRVouUnoeXjcbKg1GK1PIf+EO1//oH/APkRP/iqP+EO17/oHn/v6n/xVew0V3/2ZT7s87+1q3ZHj/8Awh2vf9A8/wDf1P8A4qj/AIQ7Xv8AoHn/AL+p/wDFV7BRT/s2l3Yf2tW7I8f/AOEO17/oHH/v6n/xVH/CHa9/0Dj/AN/U/wDiq9gop/2bS7sP7WrdkeP/APCHa9/0Dz/39T/4qj/hDte/6Bx/7+p/8VXsFFH9m0u7D+1q3ZHj/wDwh2v/APQOP/f1P8aQ+Dtfx/yDz/39T/4qvYaKP7Npd2H9rVuyPHf+EO17/oHn/v6n+NJ/wh+vf9A4/wDf1P8AGvY6KP7Opd2H9q1uyPBbq2nsrhoLmFo5EOCh9v5/WmV6N8UbKE6dDehAJ1kCbh/dIPX8q84rya9H2M3E9zCYj6xT57WFr0T4T/8AHhe/9dV/lXnRr0X4Uf8AHhe/9dV/9BrfA/xUYZn/ALuzuhRSUor6A+VCiiigAooooAKKKKACiig0AFFJXnPiDx1e2+pz29hDGsMDGMtKMksDgng8D0/yKyqVY0leRtQoTrvlgej0V5R/wsHWP7lr/wB+z/8AFV3/AIY1pdc0xboRmMhijKf7w649uazp4mFV2ia1sJVoR5po2KKBQa6TjCisXxVrf9haYboxmViwjRRwNxBPPtxXB/8ACwNZ/wCedr/37P8A8VXNUxNOm7SOyjhKlZc0EerVxfxB8O3WrGC5scSPCNpi4BIPcEn9KzPD3jq9udVhttQhiaKdhGDEMFWJwDyTkZ6/5FbfjbxPJoUUUNpGrXE3zBnGVCg88dSaznVp1ad3saU6NehXUUtThv8AhDvEH/QOP/f1P/iq6nwB4ZvtMv5bzUEWElDEsYIYnkEtkHgcY/w74n/Cw9a/u2v/AH6P/wAVXSeCfFk2t3MtnexKkyqZFZBgbRgEEHvk/wCe/NRVDnXLe56GKeLdJ86VvI7OiiivWPACiig0AJS0lZ2u6muk6XPeyKXWID5R3JIA/nSk1FXHFOTSW7NGivKW+IWsn7qWo/7Zn/GptP8AiHqK3KfbIYZIc4cRIQ2PXk4rlWMpt2PQeW10r2PUaKBRXWecFFFFABRRQaAEorzjX/Ht7Bqs1vp8UaxwMYz5oyzMCQTweB6f5FZ//Cwta/uWv/fs/wCNcssXCLsejDLq8oqStqesZpKwtK8RR3vh9tVkhdUijZpEXBPyjLbfX8cVw83xD1ZpXMUVskZJ2qyEkDsCcjP5VUsRCCTfUxpYOrVk4xWx6tRXlVv8Q9UE6NPFbvGD8yqhUkexyf5V6ZZTrd2kNygIWVFcA9cEZH86qnWjU2Jr4apQtz9SzRQKDWxzBRXIeOPFL6G0cFrEHuJF3hm6AZx06k8Vy3/CwdZ/552v/fo/41zTxMIOzO6lga1WKnFaM9Yori/BXi2fWbmS0vIgJlQyK6DClRgEEE9cn/8AV3qeLfGt3p2qvY6fDGPJ4kaUZySARgAjjFU68VDn6ELB1XU9lbU7+ivJv+Fh6z/ctf8Av2f/AIqu58G6+de0zzpYxHNG3lyY6FsA5HtzRCvCbsh1sFVoR5po6Cg9KBRW5xmR4m059W0W5so3CPIBtYjIyGB/pXmJ8F+IBnOn/wDkVP8A4qvU9e1JNH0ue+kQyLEB8o7kkAfzrzk/EXWuy2v/AH6P/wAVXBiFT5vfbPXwEsSov2SVr9SvYeB9bnvI0uLb7PH/ABSM6tgfQHJPpXZePfD13rVlbtZFTLbliI2ON+cdD0B471zmnfEXURexi+ihkt2OG8tCrY9RyR+FdX428RnQLOIwxCSefcELH5VxjJPr16U4ey5HZu3UvESxTrQ5kr9LHnx8GeIAf+Qd/wCRU/8Aiq3vBPhLU7LXI76/jFukAOEJDGQlSvGCcAZzn9PTPPxF1onlbb/v0f8AGtvwd41utU1ZbHUIUBmB8tohjBAJOQSeCB1/yMqao8y5bnRiJYz2clJK1tbHe0VxPjbxhPpF4LKxiUzAB2eQZXB9K5z/AIWHrX920/79n/4quqWJhB2Z5lPL69WCnFaM9aorlvA/iSTX4J1uIwk9uQGK/dYHOMDt0rqe1bxkpq6OOrTlSk4S3QhryL4l/wDI0P8A9ck/lXrvevIviX/yND/9ck/lXPi/gPQyv+P8jlqKBRXkn1Rd0vSb/VWZdPtmmKjLEEAD8SetaP8AwhfiD/nwb/v4n+NeneEbGKx0OzSFNoeNZGPckjJz+dbWB6V6UMLHl1PnaubVIzaglY8X/wCEL8Qf9A9v+/if40n/AAhfiH/oHt/38j/xr2nFFX9UgZ/2vX7I8W/4QvxD/wBA9v8Av6n+NH/CF+If+gef+/qf417TRR9UiH9r1uyPFv8AhC/EP/QPb/v7H/jR/wAIX4h/6B7f9/Y/8a9poo+qRF/a9bsjxb/hCvEP/QPP/f1P8aP+EK8Qf9A8/wDf1P8AGvaaKPqkR/2xW7I8W/4QrxD/ANA8/wDf1P8AGj/hCvEP/QPP/f1P8a9poo+qRD+2K3ZHi3/CFeIf+gef+/sf+NZ+qaJqOlMv2+1eIMOGyGH5gmveTiqOtafb6jYSW90oZGUg+o9xSeFjbQunm9RzXOlbyPBaKKK4T6U6H4df8jhYf9tP/Rb17N3FeM/Dr/kcLD/tr/6LevZu4r0ML8HzPl82/jr0/wAx1FAorqPICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigBKWkpaAPAqKKDXxj3Pu1sbngX/kabL/AIH/AOgNXsFeP+Bv+Rpsf+B/+gNXsFfQ5b/B+Z81m38ZegUUVU1K/t9NtHuLpwkaDr6n0r0m0ldnkpNuyLdFcOfiRabyFsLkgd+Bmj/hY1r/AM+Nx/30K5frlH+Y6/qNf+U7iiuG/wCFkWn/AD4XH/fQo/4WRaf8+Fx/30KPrlH+YPqOI/lO5orhv+FkWv8Az4z/APfQo/4WRa/8+M//AH0KPrlHuH1HEfync0Vw3/CyLT/nxuP++hWt4e8XWWtXH2dVeCYgsqvj5gPT3qo4mlN2UiZ4StTXNKJ0lBooNbnMcf8AFD/kAL/12X+RrzCvT/if/wAi+v8A13X+RrzCvCx7vV+R9RlX8EDXovwo/wCPC9/67L/6DXnRr0X4Uf8AHhe/9dl/9BqMD/FRWZ/7uzuhRQKK+hPlQooooAKKKKACiiigAoNFFADTXh2u/wDIc1D/AK+JP/QzXuVcLr3gI3upSXVlcrCkxLMrqT8xOTj2rhxtKVWKUT0strwo1G5vc85r1H4Yf8i+3/Xw/wDIVij4cXn/AD/Q/wDfBrt9B0mDRbBbW3yQDuYsckk9TXNg6E4TvJHXmGLpVafLB31NOg0DpQa9c8I474qf8i9F/wBfK/8AoLV5fXtniHR4tb09rSckDO5WHVWGcH9a4o/Da87X8P8A3wa8jF4edSd4I93L8XSo0+Wb6nLeHv8AkO6d/wBfMf8A6GK6f4rf8hGy/wCuTVo6B4BNhqcV1e3KTLCwdFQEfODkE/zrW8X+GRr0MbRyiG5i4VzkjaeoIpww81RcWtWFTGU3io1FskeRV1nwu/5GOT/r2f8A9CSrX/Cub3/n+h/74NdD4O8JLoM0tzNKsty42BkBCheCRj6iow+HqRmnJaHRjMbRnRcYu7Z1dFGaK9k+aCiiigBK534gf8ipe/RP/Q1rojVHV7CHVLCWzuM+XKMHBwRg5BH5ZrOouaLiuqNKUlGcZPozwyj+NfrXbP8ADe7BOL6Ijt8h/wAasWHw5dLqN726SWBTlkQEE+2c14scLVvsfUSzCg47nogooFFe8fJhRRRQAUGig0AeE67/AMhu/wD+viX/ANDNUq9G17wAb3U5bqyuUhSY73Vxn585JHt3rP8A+Fa3v/P/AAf9+68WeGqOTsj6mjj6EaaTZf8ADf8AyTe+/wCuU/8AI151XtmnaHa2Wi/2YiloXUpJljlsjDHPbPtXG3Hw3uDK3kX0Yiydu5Ocds1vWoTcYpLZHJhMZShObk7Xd0cJXuPh3/kB6f8A9e8f/oIribb4bzC5Q3N6jQg/MEUhiPavQra3S3t44IhhIlCKPQDpVYSlKDfMY5niadblUHcnFBoFFeieOeXfFb/kN23/AF7/APsxrjM1674u8KpryrIsnlXKDarHlSuc4Irmv+Fa3v8Az/Qf98mvJr0Jzm2j6TB42jToxhJ2aKnwtOPEMn/Xu/8A6EtZvjj/AJGy/wD95f8A0EV33g7wmvh+WW4mmE1w42ArkKE47euR/nmqvivwP/a+om9tJxA8g/eBskMR0I9K0dGbocvW5jHGU1i3Ub0ta55hxivS/hN/yCLr/r4/9lFZn/CtLz/n/g/74Ndl4W0OLQdPFtG+92O+RvVsY4HYUYejOE7yQ8wxlKrS5YO5tCg0CivSPAOb+IX/ACKd79E/9GLXj2K921jT4dV0+ayuM+XKMHBwRg5B/MCuBPw1vB0v4f8Avg/415+JpTnJOJ7mW4ulRg41HbU4mH/XL9RXffFtcRab9Zf/AGSjTvhw8d5HJe3aSwqcsiKQWrpvFvhyPxBaohcxTQktE/oTjII9OBU06M405J7suvjKUsRCaeiueMmt/wAAf8jdYfWT/wBFtWz/AMK0vc/8f8P/AHwa2vCfgn+xtS+2Xc4nkjBEW3IC5BBJ9eOKzpUJxmro6MTjqEqUoxerRyvxO/5Gh/8Arkn8q5WvWfF/g5dcuEubeYQXHCszZKsB049RWB/wrW+/6CEP/fJ/xp1cPNzbFhMfQhSjGUrNIm+EX+u1H/tn/wCzV6Oa53wf4ZTw9byZfzbiYjzHHQgZxgfjXRGu+hFwgkzw8ZVjVrSnHYQ15F8S/wDkaH/65J/KvXTXkXxL/wCRof8A65J/KscV8HzOrK/4/wAjlxRQKK80+pZ7voP/ACBrH/rgn/oIq/VDQf8AkC2P/XBP/QRV/tXtx2R8JP4mFJSHGK43UPiLp1tcvDbwy3KocF0ICk+2eo96JTjDcqnRnVdoK52dFcH/AMLMtP8Anwn/AO+1o/4WZaf8+E//AH2tZ/WIdzf6hiP5TvKK4P8A4Wbaf8+E/wD32tL/AMLNtP8Anwn/AO+1qvbw7h9QxH8p3dFcJ/ws20/58J/++1o/4Wbaf8+E/wD32tHt4dw+oYj+U7uiuKsviPp09wsc9vNbqxwHYggH3x0HvXZRussauhyrAEH1Bq4zjPYxqUKlJ2qKw/vTJf8AVt9DTx1pkv8Aq2+hqjNbnz0aKD1orxD76J0Pw6/5HCw/7a/+i3r2buK8Z+HX/I4WH/bX/wBFvXs3cV6GF+D5ny+bfx16f5jhRQKK6zyAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooASlpKWgDwKg0UGvjOp92tjc8Df8AI02P/A//AEBq9grx/wADf8jTY/V//RbV7BX0OWfwfmfNZt/GXoFcR8VWb+z7NVbAabkevFdvXD/FT/jxs/8Arqf5V04v+CzkwX8eJ52PpSUp60lfKn2AUUUUAFFFFUAVe0Asuu6eUYqftEY4PYsAf0qjV3Qv+Q7Yf9fMf/oYrSl8asY11enL0PcR0oNAoNfWHxRx/wAT/wDkX1/67r/I15hXp/xP/wCRfX/ruv8AI15hXg4/+KfT5V/BA16L8KP+PC9/67L/AOg151Xovwn/AOPC9/66j+VTgP4y+ZeZ/wC7s7oUUCg19CfKmP4sv5dN0G6urcgSxqNhIzgkgZx+NeTHWdUbOdRu+f8Apu3+Neo+Pv8AkVL7/dX/ANDWvIK8XH1JRmkn0PfyulCVOTa1ualh4i1W1vIpvt08m1vuyyM6MO4IJ/z2r2lTkZrwNeo+te9p0FbZfOUou7MM1pxhKPKh9FFFeoeOFFFFACV4/wCJfEGqza5dql7NBHFIYlWFygCqSO3U9zn+WK9fNeHa9/yHL/8A6+ZP/QzXnY6coxVj1srhCdR86voL/bWq/wDQTvf+/wC3+Nen+BtUudW0NZ7wq0qOY9wGNwAHJ9+a8jr1H4Yf8i4//Xdv5CuXBTnKpZvodeZUqcaScVrc64dKKB0or2z54KMUUUAJgVwvxI1m9sjb2lpKYElUuzoSH4PTI6Cu7rzX4sf8hGy/65N/MVy4ttUm0duAjGVeKkrnLf2zqf8A0Eb3/v8Av/jXW/DfWr+61Gayurl7iMxGYGQlmBBA4J7HPT8u+eEHSus+GGf+Ekkx/wA+zfzSvLwtSftVqe9jqNNUW1FB4313URr81rFcyW8NvhUELlM5AJLEHk/59awf7a1T/oJXn/f9/wDGrnjf/kbL76r/AOgisQVnWqSVR69TTDUKbox91bHqfw81i81HTJheyeabdxGHP3iMdz3PvXAX/iHVru6e4a/niLnOyKRkRR2AAP8A9f15rsvhWCdNvcf89V/9Brzrua6a9SSpQdzlw1GDr1FZaWLya5qisGXUrvIOeZ2I/ImvXfDN/Jqeh2t3cbfMkUltowM5I/pXidex+BOPC1h/uH/0I1eCnKU3d9DLNaUI042WtzeApTRSHpXrHz5x3xJ1a606xgitJPKM7MGccEAY6H8a88/tnVf+gld/9/3/APiq7b4t/wCo0/8A33/kteeV4uKqS9pa59Nl1GEqCbR1/gLXtROvx2s91JPDcBtwlYuQQpIKknjpj0/THqQ5FeN+Av8AkbLD6v8A+gNXsgrtwcnKGvc8zM4xjWtFW0FooortPMDAoopCaAKWtXDWWlXVzEAzwxPIoPQkAmvGZte1eaVnOpXQZiSQsrKPwAOB9BXsHij/AJF3Uf8Ar1l/9BNeH15mNnJNWPcyqnGaldGlba/q1vMsqajdMynOGlZlb6gkg17NpNy11pttcSABpokkIHQEgHivCK9x8Of8gPT/APr2j/8AQRTwUpO92Ga04Q5XFWNKg0Zor0jwzz74la5f2VxBZWc7W6SJ5jMhIcnOMbuw4ri/7a1X/oJ3n/f966X4r5/tm2/64f8AsxrihXjYmpL2j1Pqsvo05UE3FHffDXWr+51GWyu7l7iIxGUGQlmVgQOCecHPT8u+fRuleU/Cv/kZJP8Ar2f/ANCSvVq9DCycoaniZhCMK7UUGKXFFFdJ54UUUZoAMUUUUAFcX8SdZvdNtbeCylMP2lmDyKcMAMcA9s5rtD0rzz4u/d036yf+yVjXbUG0dmBjGVeKkro4r+29W/6Cd7/4EP8A410ngHX9RbxBDaXF1JPDcBgRK5cghSQQT06Y9P0rjq3/AACceLrH6v8A+i2ryqM5Ootep9NiqFNUZNRWx7LS0UV7Z8cFBooNIBDXkXxL/wCRof8A65J/KvXTXkXxL/5Gh/8Arkn8q5MV/D+Z6mV/x/kcuKKBRXmn1LPd9B/5Atj/ANcE/wDQRV/tVDQf+QLY/wDXBP8A0EVePSvbjsj4SfxMzfErMnh/UHRirLbSEEHkHaa8NPJyepr3DxR/yLep/wDXrJ/6Ca8OrgxfxI97J1dSEoooriPdCiiigoSiiigAPSvb/B7FvDOnszFiYRyeteIHpXtvgv8A5FnTv+uI/rXbhH7zPEzj+HF+ZtDrTJf9W30NPHWmS/6tvoa9I+cW5890UUV4Z99HY6H4d/8AI4WH/bX/ANFtXsvpXjXw7/5HCw/7a/8Aot69l9K9HC/B8z5fNv469P8AMcKKBRXWeQFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFBooNACUdqKO1DA8Dooor4x7n3a2NzwN/yNNh9X/8AQGr2CvH/AAN/yNNh9X/9AavYK9/K/wCC/U+azb+MvQK4f4qf8eFn/wBdT/Ku4rh/ip/x4Wf/AF1P8q6cb/BZyYL+PE87PWig9aK+XPsApKWkoAKKKKACruhf8h2w/wCvmP8A9DFUqu6D/wAh3T/+viL/ANDFbUf4iMq38KXoe4iigUV9YfEnI/FD/kXk/wCvhf5GvL69Q+KH/IvJ/wBfC/yNeX14GP8A4p9PlX8F+olei/Cf/jwvf+uo/lXnVei/Cf8A48L3/rqP5VOX/wAb7y80/wB3Z3QoPSgUHpX0R8qQ3ESTwvFMgeNxtZT0Irhn8O+EjnOqKPb7UgxXReN5Hi8M3zROUbaBkdcFgD/OvHT0wK8zGVYxklKKZ62Aw86sXKMmtT0nRvD/AIYi1CKS0vEuJ0O5I/PV8kDrgdcda6+SSO3iaSVgqKMszHAHuTXhUMskM8csLskiHKupwQR3rv8A4ozSpZWUayMscjvvUHhsAYzU0MTFU5TStYrE4STrRg5Xv3Or/t7Sv+glZf8Af9f8ans9QtL3d9juYZ9uN3luGxnpnFeGY/Kt7wFJInim0RG2rJvRwD1G0nB/EA0Use5yUbF1Mq5ISnzbK56veXlvZRh7qaOFScAyOFBP41WGv6Qf+YlZ/wDf9f8AGvPvidLK2vRRs5ZI4Vwg6AknJ/QVyVOrjnCTio7Cw+V+2pqfNue8QXMNzGJbeZJoz0ZGyPzFc14k0Lw/dX5uNSuY7Sd1BIMypuA43YP5Z9qyfhVM5a+hDt5ahGCk9Ccgn9BXJeIpZJ9dvmeQsRO65PoGIA/IU6uJi6Sm43uRRwko13TjK1up1/8AwjnhH/oLIf8At6Su4s7aK0t44LeMRxIMBRXhFeq/DeZ5fDv71y2yVkXJzhQBxSwlWMpWSSHj8NOnBSlNvU6uigUGvUPHI3YICWPyjkk9AKpf29pP/QSs/wDv+v8AjWF8TZpI/D6pGxAeYK+DjIwTj8wK8srz8Ri/ZS5bHp4TAfWIc7dj3O31Syu2K2l3BcOvJWOQMQPXAqr4k0/TtQ0/bqjrFCjBhIXCbT9T+VeUeGZ5INesXiYoTPGpIOOGYAj8QcV0/wAU55PtVpCZG8oozFM8bs4zQsSqlJykti3gJU68acZb63LX/CNeEP8AoLJ/4FJW/wCF9K0jTopW0iVJw7YaVXVzwPu5H1z+NePc+tdd8L5ZV1yaIO2x4CzKehIZcfzNYUK8HNe7Y6cXhKkKTbqN2Or8T6Pod9PFNq06W0mCobzVjL/n1xn9axv+EY8I5x/aq/8AgVHXN+PJZJfE90JHLCPaqgn7o2g8fiawqiriIc791F4fB1HTTVRrQ9w0e0s7HT4oNP2+QFBVl53/AO1nvn1rmtY8PeGJNSlkur1badzueIXCpgkZzg8jNM+F1xI+l3SSSFkjlAQE8Lxnj8686kmeeRpJXLyOSzMW5PqTW9atFU4vlvc5sPhZutOPO0117nfReG/CJlUDVFds5Cm6Q5/Cu7ijSKNUjUKijAA6AV4F1+lekT3c/wDwrLzvObzDGFL7ucebgjP04ow9eHvWjayuGMws1y8027ux1B13SlODqNp/3+X/ABqSDV9PuX8u3vbeZz/DHKrH9K8M69TTreaSCZJYWMbpja4bGCKzWPd9jWWUaXUj3DV9MttWsntrtNyN0I4Kn1Brnv8AhXmj/wB+6/7+D/CutA44p9ek6UJO8keNCtUpq0W0YOg+FtP0SeSa0V2kcbS8h3ED2reooq4xUVZETnKbvJ3Ciig1RJQutUsrSQJdXcELEbgskgU49ee1R/2/pP8A0E7L/v8Ar/jXkHiOWSbXL95GZm8+RMls8BiAPwAxWdk+przJY5p25T3KWVc8FLmPf/lkTnBUj8DXD3vhnwn9qk336QybjmMXKrtPpjqMU/w7eT/8K8uZvPfzYopvLfPK4B24Pt2rzYs27JJye5qq9eHKrxvcjC4WblJKTVnbQ9IsPDXhQX0Riv0uZAcrG1yrbj9Bya7QlIo2LEIq8kngAV4ErsjhkYqw5B6Yr0Xxnd3H/CCae/mtvm8oStnlsoSc/jToVouLajawsXhJqcIyk3fTU6s69pI/5idn/wB/1/xqe01OxvWKWl5bzsBkiOQMR+VeEVpeGJnh8QWBidkJnRTtOMgsAR+INTHGtyS5S6mVKEHLm2PWPEmnaZqFlt1Z1ijQ5EpcJtP1PSuX/wCEb8H/APQXT/wLSqXxUnl/tC1g8xhH5W7ZnjdkjNcVU1q0Yz1imXhMJUnSUozav0PZPC2laTp0EraPKk4dsPKJA5yB93I9M5x71vV5X8LbiRdenh3nymgLFc8Ehlwfwya9Uruw8lKCaVjy8ZSlSquMnfzCiiitjlM+fWdOtpjFdX9tDIOSkkqqR+BNNj13S5JFRNRtHZjhVWdSSfYZrxKaZ5pnkldpHc7mY8knuajzmvN+utO3Ke9/ZCtdyPoLqKdWF4Lnln8N2Uk7l3KHJPU4YgVu16EZcyueHUjyScewVma/p9jqGmyRantWDqXYgbPfJ6Vp1wHxanljtrCJWYRuZCyg4DEbcZ+mTUVpcsG2jXDQdSrGMXbzGf8ACM+D8/8AIVjx/wBfaVt+FtG0Kxnmm0e4S5lICs4lWQoOeOOmf6V5Dz6n866H4fTSQ+KrVY5GCyK6sAeGGwnH5gGuClWi5fCj28Rg6ipuTqN2R61eXtvZRB7ueKBScAyuFBP1NVhr+kd9Usv/AAIX/GvN/iZNK/iLyXkYxJEpVM8DPWuVrSpi+WXKkc9DK/a01Pm3Pfra4huolmtpkmibo6MGB+hFTV578JZXI1CIv+6Uxsq+hO7P8hXoVdVKftIqR5mIo+xqOm+gGvIviX/yND/9ck/lXrpryL4l/wDI0P8A9ck/lWOK/h/M7cr/AI/yOXFFAoryz6hnu+g/8gWx/wCuCf8AoIq/2qhoP/IFsf8Argn/AKCKv9q92OyPhp/EzK8U/wDIuap/16yf+gmvDq9x8Vf8i5qn/XrJ/wCgmvDq4MZ8SPeyb4ZeolFFFcR7oUUUUAFFFFAxD0r23wV/yLOnf9cR/WvEz0r2zwV/yLOnf9cR/WuzCfEzxM5/hR9Ta70yX/Vn6Gn96bL/AKs/Q16T2PnFufPVFFFeIfex+FHQ/Dv/AJHCw/7af+imr2X0rxr4d/8AI4WH/bT/ANFtXsvpXpYX4H6nzGbfx16f5jhRQKK6jyAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoNFBoASjtRR2oYHgdFFFfGPc+7WxueBv+RpsPq/8A6A1ewV4/4G/5Gmw+r/8AoDV7BXv5X/BfqfNZt/GXoFcP8VP+PCz/AOup/lXcVw/xU/48LP8A66n+VdON/gs5MF/HiednrRQetFfLn2AUlLSUAFFFFABV3Qf+Q7p//XzF/wChiqVXdB/5Dun/APXxF/6GK2o/GjKt/Dl6HuIooFFfWHxJyPxQ/wCReT/r4X+Rry+vUPih/wAi8n/Xwv8AI15fXgY/+IfT5V/BfqJXovwo/wCPC9/67L/6DXnVei/Cn/jwvf8ArqP5VGB/jIvNP93Z3QooHSivoz5UwvG0ck3he+WJC77Ado9mBP6CvHf5V7vdTxW0Ek87hIkG5mPQCuI/4STwl/0DI/r9lTmvLxdJTkm2ketl+InShKMYtnBwxSTzRxxKzyOQAg5JY13/AMUYJGsLJ0jYxxu+9h0XIGM1Y0nxF4Xe/ijtrNbadzhJDbqgB6dR09K66SNZo2jkRXRhgqwyCPcUqGGj7OUYu9ysTi5e1jNxtbueDVv+AY5ZPFVoyJuEe92IHQbSMn8SBXp39h6X/wBA20/78r/hU9pYWtmW+yWsMG773loF3fXApUsA4TUrlVc054OHLurHnHxPikXXI5ihCPCoDdiQTkfhkfnXI17vdWVveIEuoIplByBIoYA/jVb+wtJ/6Bln/wB+F/wqquBc5OSluLDZmqNNQ5djjfhTDJnUJShEZ2KHPQkZyP1Fcl4kheDXr9JFKEzu20jsWJB/EGvabe3ht4xFbxLFGvRUG0D8K5jxDr3h+3vmg1K1W6njABPkq+3vtyadXDxjSUHK1iaGLk67qRje/Q8ur1T4awyR+Hh5sbIHlZ13DqDjmsn/AISTwl/0CU/8BErtrG9tbmyS4tZUeAjIYHgD+lThaMISummVj8ROpBRcGtS3RXKTfEHRopXTE77TjcqcH8yKIPiBo00iofPj3ELudRgfka7vb0v5kec8NWt8LGfE2KSTQVZELBJgzY7DBGfzIry2vfCsc8fOHRh9QRVL+wdJ/wCgZZ/9+V/wrkxGEdaXMmduEzBYaHI43PIfDULza9YrGpYieNiAOwYEn8hXUfFWCT7TaTBCYwrKW7bs8DNd3baZZWrlrWzggYjBaOMKSPwqn4j1LTdNss6oqyxOQBGVDlj/ALpprDKFJwk9xvHOrXjUjHboeMV13wvidtcnk2ERrAVLHoCSMfyNaX/CSeEv+gSn/gIldB4X1bSNQikTSYkt9hy8QjCHkdcD8s1jQw8FNPmTOrF4upOk4um15nnnjuGSLxPcl0KrIVKse42gcfiKwa9Y8Uazodncxw6rCtzIASB5Qk2fn0z/AErJ/wCEm8IZ/wCQUmP+vVKirhoObfMisPjKkaaSpt6EnwwglXSrqRkKxyTAoT/FgYNed3EbwzNFKpSRDtZGGCpHUGvbdDvrK/sI5dPK+RtACqMbPbHanXGkadczmS4sLaZz1d4lYn8a6p4VzppJ7HHSx7o1ZTlHc8Nr0i5tLgfC/wAgwOJBGGKY5AEm4/pzXULoekqwKaZZqR0IhUf0q1dXEVpBJNcOEijUszHsBTp4X2ald7oMRmLruNo7O54NToYnnmSKJWeR2wqqM5Nd9/wkvhHf/wAgxPr9lTmrmj+I/DMmoRpbWaW0xO1JfIVME8Y3DpnpXDHDxb1kj0JY2ryv92ztAKWgUV7p8yFFFY2veI7DRQgvCzO54SMZOPX6VMpKKuyowlN2irs2abXJf8LC0f8AuXX/AHwP8a29E1my1u1M9i+4KcMrcMp9xURrQk7Jmk6FSmrzi0eQeIY3i12+SRSrGeRsEdixIP4g1n16l4h17w7DqJh1C2S7njUBm8kSbe+3J/l71Q/4SXwfn/kEp/4CJXm1KMXN+8j3qWMqRgkqb2J/Dtpc/wDCu7qHyX86WKby0xy2R8uPr2rzdxn8K90s7u3ubJLm3kDQOu4N0AFchd+JPCTXMhl09Zn3HMv2ZTvPrk8mtK9GLjHW1jlwuJnCcrQbuzzgAuQFXJPYCvRvGNpKPAlghibfEYt64+7hCDn8eKdY+JPCa3UYisFt5CfllNsq7D65HSu1CpNDtIDow5B5BFVRorlajK9xYrFzcoSlFqz6ngVaXhiJ5vEFgsaMxE6McDOAGBJ/IV6//YWlf9A2z/78L/hUttpljaMXtbSCBmGC0cYUkfhUxwTUk+YupminFx5dzz74qwSHUbWcowj8rZuxxuyTiuKr3q5tobqIxXEayxt1V1DA/gaq/wBg6T/0DbP/AL8L/hV1cJzy5kRh8z9jTUOXY88+F8Mp1yeUKSi25UtjgEsuBn3wa9Vqva2dvaR7LWCOFM5KxqFGfoKs11Uabpx5Tz8TX9vPntYQ0UGitjmPn2WOSCZopVKSISrqeqkdqSvTdX8SeFlv5Rc2UdzOp2tKIFfJHGM9TjpVaHxL4T86PZpiRtuGH+yqNpz1yPSvHeHhf4j6eONq8q/ds6PwTE8HhqxSZCkgQkg9R8xrcqG1ljnhWSFw8bDKsvQipe9erBWSPmqknKbk+rHVwHxZhke3sJFQ+WjOGYdFJ24/ka74VFPDHPG0cyK6MMFWGQfqKVWHPHlNKFT2NRTtex4BXRfD2KSXxZaMiF0jV2ZgPujYRn8yBXqH9gaT/wBAyy/78L/hViz060sixtLaGAt18tAufriuKGE5ZJ3PWq5r7SnKHLujzD4mwuniITMhEbxKFbsSOvPtXKGvY/FOraNYJHHq8a3BY7lj2ByMfxYPSuf/AOEn8H/9AlP/AAFSoq0k5t8yNcLi6kaSjGDdhnwkicHUJSpEbeWoY9yN2R+GRXolY/hrU9O1KwDaUixQoxHlhAmw9eg6Z61rBeK7qMFCKSZ5GLqOpUcpKz7DjXkXxL/5Gh/+uSfyr12vIviX/wAjQ/8A1yT+VY4r4PmdWV/x/kcuKKBRXln1DPdtA/5Atl/1wT/0EVfPSqGgf8gWy/64J/6CKvnpXux2R8LP4mZfin/kXNT/AOvWT/0E14dXuPin/kXNT/69ZP8A0E14dXBjPiR7+TfDL1EoooriPdCiiigAooooGB6V7Z4K/wCRZ07/AK4j+teJnpXtngr/AJFnTv8AriP612YT4meJnP8ACj6m13psv+rP0NO702X/AFZ+hr0XsfOLc+e6KKDXin3sfhR0Hw8/5HCw/wC2n/otq9m7ivGfh5/yOFh/20/9FtXs38Qr0sL8B8xm38den+YoooFFdR5AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUGig0ABpO1KaTtSYHglFFFfGPc+6Wxt+Bv8AkabD6v8A+gNXsFeP+Bv+Rpsfq/8A6A1ewV9Blf8ABfqfN5t/GXoFcP8AFT/jws/+up/lXcVzfjnRZtZ0xVtcGaJt6qxwG9q68XFypNI4cJNQrRbPJz1oq+2iaqjFG027yDjKwsw/MCmnRtUH/MNvP+/D/wCFfNexn2Z9Z9Yp/wAyKWKSrv8AY+qf9A68/wC/D/4Uf2Pqn/QMvf8Avw/+FT7KfZj9vS/mRSoq7/Y+qf8AQMvP+/D/AOFL/Y+qf9Ay7/78P/hR7OfZh7el/MijV3Qf+Q7p/wD18xf+hil/sbU/+gZe/wDfh/8ACt3wh4YvptVgubq3kt4IHEhMq7WLDkAA89fwxW9ClN1FoZV8RTVOXvLY9TFFAor6g+POR+KH/IvJ/wBfC/yNeX16h8UP+ReT/r4X+Rry+vn8w/iH0+VfwX6iV6L8Kf8Ajwvf+uw/lXnVejfCr/jwvP8ArqP5VGB/iovM/wCAzuR0oNA6UGvpD5UwPHn/ACKt/wD7q/8AoS149XtPiuxm1LQru1tsGV1G0McAkMDjP4V5I2jaorEHTbw4/wCmLV42YQlKaaXQ9/K6kI05KT1uU05PrXvaD5RXjFj4e1W7uo4RYzxkn70sbIqj1JIr2gdBWmXwlFO5jmtSMnHldxwooFFeoeMFGKKKAGtXh+vc67f+9zL/AOhmvcOK8i8SaBqkWt3ZWzmmWaRpY3iRnXDEnqBwR6H+VebmEJSirI9bK5whUbm7aHP16B4S/wCSf6l/uzf+gVxf9i6r/wBA28/78N/hXovh7Qru18IXGnz7EuLhZMc5C7lwMkf0zXLg6U1J3XQ7swqwlCKT6nlporRm0DVYZGjbTrpipPKRMw/MDB+opINB1eeVI0026Bc4BeJlUfUkcCuX2U+x6PtqXLfmR6/4f/5Aen/9e0f/AKCK0ap6XA1rpttbuQWhiWMkdCQMVcr6WHwo+Ll8QV5r8V/+QhZf9cmr0quE+JejXt8be7s4WmWJSjogJfnuB3rDFJypNI68DKMKycjzjNdb8L+fEEuP+fZv/QlrB/sTVP8AoGX3/gO3+FdZ8N9GvrbUZb24t3giEZiAlBViSQeAe3HX34715OGpyjUR72Nq05UXaS2MDxzx4rvx7r/6CtYddb440LUW16a7itpLiG4wymFC5GAAQwA4P+fWsH+xtT/6Bt7/AN+H/wAKitCTqOy6muFq01RjeS2O5+FPGn3h/wCmw/8AQa7iuT+HelXem6bK15H5RuGEiofvAY7jsfautr2sOmqaTPmcY1KvJx2Ern/iB/yKl79E/wDQ1roKyfFlhLqWgXNpbbfNkA2BjgEhgcfpV1U3B2MqDSqxb7ni3elXhwRxzV3+xdVHXTrwfSF/8KnsfDmrXd0kSWE8ZJ/1ksbIq+5JH/168BUpt2sfYSrUuX4ke19BS0gNBOBya+kPiwryX4k/8jO//XFf5V61Xm3xG0PUJdUW+trd7iORQhESlmUgdwO1cmLTdPQ9HLpRjWvJ2OGBrvfhL/r9Q+kf/s1ch/Yuq/8AQLvP+/D/AOFd38NdHu7GK5uLuHyBOVVUZSGG3PJB6deP8K83CxkqmqPWx9anKi0mcJr/APyHNQ/6+ZP/AEM1RrofE3h3VItcuitlLOk0rSo8UbOu1mJ6gcH1B/lg1m/2Jqv/AEDLz/vw/wDhUThLmeh10q9L2cfeWx3HhzP/AAre+/65T/yNecV6vomiXlv4Om02UIlxPFIACeFLAgZIHavOJtB1aKRo2027YqTysTMPwOCD9a6MRCVo+hw4KrBVKnvLcz69y8Of8gLT/wDr3j/9BFePW2gatcTpEunXSF+jPEyqPqSMCvZdHga1022t3ILQxLGSOmQMVtgoON7mGa1Iz5bMuUUUV6R4QUUUUAFFFFABSGlpDQNHz4B+dOrTvvDmsWd08BsJ5NjY3xRs6sPUED/Pfmo00PVnkCDTbsFiAC0LAc+pIwK8BwmnZI+1hXpcvxI9V8B/8irY/wC6f/QjW6ayvC1jLpuh2tpcFTJEuG2njqT/AFrVr26d+VX7HxtZp1G13FFLikFLVmYYooooA8i+JnPiZ89oUH6Vy1d38RdC1GfVRfW1u9xFIipiJSzKQO4A6e9cn/Ymq/8AQLvf+/L/APxNeNXhJ1GfW4OvTjRinJbHYfCH/W6l9Iv5NXo1cP8ADLSL2wguri8hMAuCuxHBDfLuySD0HPH+GK7gV6WHTUFc+ex0lKvJxA15F8S/+Rof/rkn8q9d715F8S/+Rof/AK5J/Ks8V8HzOjK/4/yOYFFAoryz6hnuugf8gWy/64J/6CKv9qoaB/yBbL/rgn/oIq+ele7HZHws/iZl+Kv+Rc1L/r2l/wDQTXh1e+ajaJfWU9q5IWZDGSOoBGK8a1Lwxq9hdGJrGabByHhUupHrn/HBrixUZNppHuZTVhDmjJ2MeitD+xNV/wCgbef9+Wo/sPVf+gZef9+G/wAK4+SXY9v21L+Yz6K0P7E1X/oF3n/fhqP7E1X/AKBd5/34aj2c+we2pfzIz6K0P7E1X/oF3n/fhqP7E1X/AKBd5/34aj2c+w/b0v5kZ56V7Z4K/wCRY07/AK4j+teVWHhrV764EKWE8RJ5eaIoAPUkgf417Fo1kNP0y2tc7vJQLmuvCwkm20eHmtWE4KMXd3Lvemy/6s/Q07vTZf8AVn6Gu/oeEtz56ooorwz72Pwo6H4ef8jfYf8AbT/0W1ezehrxn4d/8jhYf9tP/RbV7MO1ephfhPmM2/jr0/zFFFAorqPICiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACg0UGgANJ2pTSdqTA8Eooor4x7n3S2NrwL/yNNl9X/8AQGr2GvH/AAN/yNNj9X/9AavYK+gyv+C/U+bzb+MvQWkxS0V6h5AmB6UbR6ClopDEwPSjA9KWigBMClxRRQAUUUUAFBooNAHIfE//AJF9P+vhf5GvMK9P+J//ACL6f9fC/wAjXmFfP5h/FPp8q/gv1Er0b4Vf8eF5/wBdR/KvOa9G+FX/AB4Xv/XYfyqMD/FRWZ/wGdyOlBoHSg19IfKrYo6vfxaXYTXk+7y4V3HaMk+1cIfiPdc4sI/rvNdT49/5Fa9+i/8Aoa15COteRja84TSie1l2Gp1YOU1fU7uw+Ijtdxpe2qxxMcFkOSPwr0FTkCvAx9/8a98XoK2wNWVRNyMsyoQoyjyK1xwooFBr0DyzlvFnitdDmjtoYxLcMNxDcAL259Sa5/8A4WRef8+MP/fZql8Tv+RkX/r3X+bVywNeHiMVVjUcYvRH0mFwVGdGMpK7Z674S8Rp4ghk3R+VcRH5kGcYPQg10FeefCj/AI+b/wD3U/8AZq9Er08NN1KalI8XF0o0qzjETFRXcyW9tJNKcRxqXY+gAyamrN8R/wDIB1D/AK9pP/QTW7skc8VeSRxc3xGn81xDYoUDHaXbBx70tv8AEaYzILixjEefmKMcgd64U0V8/wDWql7XPqf7Pocux7zbypPBHLE25JFDKfUGphWd4f8A+QHp/wD17x/+gitGvoYfCj5WSsxaKKKoQYpMDHSlopAcV4p8af2RqBsrWBbh4x+9LZABPQD196yf+FkXmc/YIf8Avo1ieOP+Rqvvqv8A6CKxK8CriZxm0j6bD4GjKlGUldtHs3hjXoNcsPtEa7JUwsqf3W9vUVy+ofEVkupUsrVHhU4RnJBb3/HtU/wsONMvv+uq/wDoNedGumtiZxpRkt2c+GwlKVecJK6Wx26fEm6D/PYxbc84bnFdk2uWX9hNq2X+y7N3Q5POMY+vFeL969An/wCSUD/cH/o4UYbEVJcyk9lcMZg6UHDkVruxVb4j3TZxYxf991Pp/wARGe6jS9tEjgY4Z0OdtcCDSr95frXKsXVctzteX0XHY9/FB680CivoT5QWjFFFABRRQaAOC13x79i1KS0srdJVhOHeRiPmzyB/KqP/AAsi6/58of8Avs1ymu/8hu//AOviT/0M1Sz714c8TU5tz6ijgKEoK6PbNO1y0vtFOpqWWBFLSbgcpjkj8K42f4kXHmOILCMxgnbuk+bHuBVvw3/yTi+/65T/APoJrzyt69ecYpp9DlwmDpTnNSV7M7m1+I832hPtNkqxH75ViSK9AtZkuYY54W3RyKGUjuDyK8Gr2/w5/wAgPT/+veP/ANBFaYOrKo3dmOZ4anR5XBWNGilFJXoHjhRRRTAKKKKACiig0Aed6h8RnW5kWztUkgU4V3YgsPXHv2qBPiRc7182wj8vjdh+cd8Vw59T/wDqpK8J4mpzbn1kcvocux7a+u2SaGdX3MbUJv4U5POMY9c8VxZ+Jd4MYsIef9urc3/JJx/uL/6OFeeV1YjETjy8vVXOHBYOlU5+dbOx6Bp3xGeS7jS9tEjhY4LxsWI/Cul8VeII9AtFkZTLLKSI09cdST6DIrxyL/Wp/vCu/wDi2cw6Z9Zf/ZKdOvN05N7oK+EpRr04RVk73K//AAsu8zn+z4v++zWx4V8bDWNQ+x3UCwSOMxbSSGwCSD6cDNeXVu/D/wD5G6x+sn/otqypV5ymrs6MTgaEaUpRWqR3Pi/xiuhXCWtvCJ7g4Zg3CqD05rA/4WTeZz/Z8X/fZrP+Jn/Izv8A9cUrmBVVcROMrBhMDRlSjKS3R7F4P8Rp4gtpSYxFPCR5iDOADnBH5Guhrzn4R/63Uv8Atl/7PXo1d9CTlBNnhYunGlWcY7BXkXxL/wCRof8A65J/KvXe9eRfEv8A5Gh/+uSfyrLF/AdeV/x/kcwKKBRXkH1LPdtB/wCQLY/9cE/9BFXqoaD/AMgWy/64J/6CKv19BD4UfCT+JhRRRVEhRRRQAUUUUAFFFFABRRRQAd6bL/qz9DTu9Ml+430NS9hrc+fKDRQa8M+9j8KOg+Hn/I4WH/bT/wBFtXsw7V4z8PP+RwsP+2v/AKLavZh2r0sJ8J8xm38den+YoooFFdh5AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUGig0AJQelFB6UmB4JRRRXxj3Z91HYltLmayuI7m2YpJGcgg4/znvXoGn/EC0+zKL2GZZhwdgBB9+vFedUVth8ROj8Jy4jCU8RrI9O/4WBpP9y5/wC+B/jR/wALA0n+5c/98D/GvMKK6v7SreRy/wBlUT0//hYGk/3Ln/vgf40f8LA0n+5c/wDfA/xrzCin/aVUP7Konp//AAsDSf7lz/3wP8aP+FgaT/cuf++B/jXmFFH9pVQ/sqien/8ACwNJ/uXP/fA/xo/4WBpP9y5/74H+NeYUUf2lVD+yqJ6f/wALA0n+5c/98D/Gj/hYGk/3Ln/vgf415hRR/aVUP7Konp//AAsDSf7lz/3wP8aP+FgaT/cuf++B/jXmFFH9pVQ/sqib3izxJJrkojiDR20ZJVc8sf7x9/btWBQBS1xTqSqycpM9GlTjRgoREr0X4Vf8eF7/ANdh/KvOq9F+FX/Hhe/9dh/KuzAfxUcWZ/wGdyOlFIOlLX0h8otjP1zTk1XTJ7N3KCUAbh1BBBH8q87b4f6wD8rWxHr5h/wr0DxJqDaVpFxeIodogMKemSQB/OvMn8Z68f8Al+wPaNP/AImvMxnsVJe0Tv5Hr4COIcX7K1vM07H4faibuP7ZLCsOSXMT5bHtkd69MAwuK8nsfG2tQ3SPNcefGPvRsiqGH1A4r1denvV4F0mn7MzzBV017ZrysPFFAoNd55pxnjTwpcazdR3dnIomAEbpIcLtGcEEDrzXOf8ACvtY9bb/AL+n/Ctrx74lvtNv47LT5Ft8IJGk2hic5AGCDgcVzH/CYa//ANBE/wDfpP8ACvGryoe0fPe57+Fji/ZLkat5ndeB/Db6FDM9zIHuJ8BwvKgDOMHqetdQK4/wB4gu9XjnhviJJIMESdCwOeCAPbrXY16WH5HBcmx5OKU1VftNxKr39ol7aTW8hIWaNoyR1wRg1ZqpqlyLOwnuiu/yY2k25xnAzjNbNaHPG99Dza4+H2qrM4imtnjB+UsxBI9SMHH506H4faoZVWaa3WMkbirEkDvgYFUZfGeuSOzC8CbiSFSNcD2GRn9aIPGWuxyo73olCnJRolwfyANeJfDX6n0nLjbbo9Xs7dLW1it0ztiQICeuAMCrAqrpt19tsILnZs86NZNuc4yM4q1XuR2Pm5Xu7i0UVxnj/wAQ3ekGC3sNqSSjcZOCQB2wfX1qKtRU480jSjSlWmoR3OzpM147/wAJjr//AD/n/v3H/hXT+AvEt9qd5LZX7rOQhlWTAUjBAK4AAI5//X25aeNp1JcqOutl9WlDndhvirwXdajqr31hLGfO5kSU4wQABggdCKx/+Fe6xj71p/38P+Feq4oqpYOnJ8zJp4+tCKinsc/4Q8P/ANh6c8TuHlmIeTHQHGMCuPvfh9qK3Ugs5IZIM/uzIxDY98cZH6+1enP0NeS3vjfW7i5kkgufs8bH5YwisFHbkjn3/pWWJjRpQSmvQ3wUsRVqSlTtrvcsJ8PdYLANJbBT1O8nH6V2r+HoT4XOi+bIECbQ/Gc7t2ceme3pXnkfjTxAjbjfB8HoYkwfyFen+HtSOq6Rb3rRiNpVJKg528kf0qcJ7KTaiuheO+s01GVRqyfQ8+b4f6wvIe0I95D/AIVLY/D2/a8jN5PClvnLGJiWx6DIxz616fRWywdO9zB5lXatcSlrlfH+u3OiWcC2agSTlgHPOzGOg7nmuGPjPXz1vz/36T/4mqqYqFJ8srk4fAVa8eeNrHslFeb+C/FepXespZX8guI5wQDtClCFLZGAM5xjH+T6RW1KrGqrxOevQlQnyTCg0UVqYHm/iDwLe3GqTz2MsbRTMZGEpwQxOSOByPT/ACaof8K/1n+9af8AfZ/wpfEHjLVv7WuIrOYW0MMjRBQitnaTliSD1/z6nP8A+Ex17/oIt/37j/8Aia8abw/M7pn0lGOM5Fy2PR9K0COx8ONpTSO6yoyysODlhg49P1ri5vh5qyyN5M1u8YJClmKkj1xg4/Ou58J6s+s6NHcyoEkyVbHQkd/atjFd7o0qkVbY8iOJrUJySerep5bB8PtUaZVuJbdI88urFiB7DA/nXpVnbJaWsVvHnbGgjBPXAGBVoVz3jbWJtF0fz7ZN00jiJSf4Sed2PbFVGnCiroVSvVxclCR0NBrxr/hM9f8A+f8A/wDIaf4Vo+G/GWrPrNtDdzC5hncRFdqjG4gBgQB0/wA+tZrGQbsbyy2rGLldaHqdFFFdh5gUUV5t4z8Xanba1JZ2DrbxW+MsAGLkgHnI4xngD/8AVlVqqmrs3oUJ15csD0mk/GvHP+E08Qf8/wCf+/Uf/wATXoHgPWrnWdJaS9UeZC/llxxv4ByR2PNZUsVCo7I3r4GrQjzytY5K++HepLdOLKWFrf8AgMrkN+IAI4/Wok+Hmr71EktsqkjJVySB9MV6rxQQPWk8LTbuUsyrpWuYL+HopPCx0XzpAuzaJMZIIbOceme3p371w7fDvW/79r/38P8AhXoXifUm0nRLm8jQSPGBtDHjJYD+teYP411//n/2j08pD/Ss8R7OLSmjowP1mcZSptWb6mpYfD3UHvIzfSxRwqcsYnJbA7DIA59a6vxp4dfX7SIQyhJrckoG+62cZB/KuH03xvrcV4klzcfaYhw0ZRVBH1A6162gwBTw6pVItRRONniKNSM5tXW1jysfDzWv71p/38P/AMTWz4O8GXelaqt9qEkWYgRGsTZySCCScDgA/wCe/e0VqsNCLujCpmFarFxkcV418HTaxerfWUyiYgKyyHC4HTFc7/wrzWv71r/38P8AhWv468U6hp2oiwsCIdoDtJgOWyOmCMCuZ/4TLxB/0ED/AN+k/wAK5Kzoc7unc9LCxxjpLkat5ne+BvDcugwzPdSK885G4L91QM4x+ddV2rjvh74gu9ZhuYr/AGvJblT5gGCwbPUDjjH+e/Y130eXkXLsePilNVX7TcQ9a8i+Jf8AyND/APXJP5V66eteR/EsY8TM3YxJ/KsMV8HzOvK/4/yOXFFFFeSfUna+EvG4020FnqiySxoP3cqctjspB7ehzx0rf/4WLpH9y6/79j/GvK6K644qcVY82pltGpNyPVf+Fi6P/cuv+/Y/xo/4WLo39y6/79j/ABryqin9bmT/AGVQ8z1X/hYujf3Lr/v2P8aP+Fi6N/cuv+/Y/wAa8qoo+tzD+yqHmeq/8LF0b+5df9+x/jR/wsXRv7l1/wB+x/jXlVFH1uYf2VQ8z1X/AIWLo39y6/79j/Gj/hYujf3Lr/v2P8a8qoo+tzD+yqHmeq/8LF0b+5df9+x/jR/wsXR/7l1/37H+NeVUUfW5h/ZVDzPVf+Fi6P8A3Lr/AL9j/GsTxN4/F1aNb6QsieYMNM3ysM+g/rmuFppoliZyVioZbQhK+4pJySTlj1NIaKK5j0joPh5/yOFh/wBtP/RbV7MO1eNfD3nxfY+3mf8Aotq9lHavTwnwHzGbfx16f5iiigUV2HkhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABQaKDQAlFFFAHlPjnQZ9O1Ga8jTdaTuWDL/Cx5IP9K5odK91uII54minRZI3GGVhwRXLah4C0y6mL28ktqDnKpyM59+n0rw8Tl7cuan16Hu4bMlGKhUW3U8zor0P/AIVxa/8AP/P/AN8rR/wri1/5/p/++RXJ/Z9bsdn9pUO555RXof8Awri1/wCf6f8A75FH/CuLX/n+n/75FL+z63YP7SodzzyivQ/+FcWv/P8AT/8AfIo/4Vxa/wDP9P8A98ij6hW7B/aVDueeUleif8K4tf8An+n/AO+RR/wri1/5/p/++RT+oVuwf2lQ7nndFeif8K4tf+f6f/vkUf8ACuLX/n+n/wC+RR9Qrdg/tKh3PO6K9E/4Vxaf8/8AP/3yKP8AhXFp/wA/8/8A3yKr+z63YP7SodzzuivRP+FcWn/P/P8A98ij/hXFp/z/AM//AHyKP7Prdg/tKh3PO6K9E/4Vxaf8/wBP/wB8ij/hXFp/z+z/APfIo/s+t2D+0qHc8/tbaa8uEt7ZDJNIcKg7/wD1vU9q9k8NaV/ZGkQWrEF1GXI6bu+KTSNB07SQTaW4V8YMh5bHpk9q1a9XB4P2Ostzx8bjXiLRjshR0ooor0Dzjn/H3/Iq3v0X/wBDWvIK911C1hvrSS2uEEkUgwynvXHn4d2W4lb6cL/dwK8rG4edWacex7GX4ynQg4z7nnkf3l+te9r90Vxlj4C063u4p5p3uFjOfLcDBrtBwK0wNCVFPm6mWY4iFeScOgUCiivRPMPK/id/yMa/9e6fzauVr1/xL4YtNcaOSQtFMnHmIMkj0rE/4Vxaf8/1x/3yK8LEYOrOpKUVufRYXMKNOjGEnqir8Kf+PnUP92P/ANmr0UVjeG/D9roNu0Vvud3OXlcfM3p+Va+eK9TDwdKmos8fF1VWqucdhxrM8S/8gDUf+vaX/wBBNaBYUyaKOeFopVDo4Ksp6EHqK2bujmjpJM8H6UV6PN8ObFpXaK6mjVjkJgEL7c0sHw6so545HuppFRslCAA3txXhrBVbn039pULbnR+HP+QFY/8AXvH/AOgitIdKjhiSKJY41CooCqB0AFSV7sdErnzUndti15p8V/8AkJWn/XFv516VWP4k8PWuuxKtxlJEPyyKPmA7isMTTdSm4x3OjCVY0aqnLY8XHQV1nwu/5GGT/r3f/wBCWtv/AIVxa/8AP9P/AN8itnw14ZtdCMjw5klfjewwQvp/WvNw+EqU5qUj1sVjqNSk4RerOgooozXtHz42T7prwIdB9K9+OCK4y/8Ah9Y3F1JNDcSwI5yI1AIX6ZrhxmHlWUeXoepl+Jhh3JT6nmfevYvAv/Ir2P8AuH/0JqxI/hxZhgWvJmA/2QM12Vlaw2dslvboI44xhVHQCs8Jh50pNyLx+Lp1oqMCcdKWm0V6R5BwXxb/ANVp/wDvSfyWvPhXtfiHRrbW7H7PdDBB3JIOqH1Fcv8A8K4s/wDn/n/Ja8rFYaVWpeJ7uBxtKlS5JnM+A/8AkbLH/tp/6LavYRXM+HPB9jot6bpZWuJcbUaQD5M9cY9a6euvC03Shyy7nDj8RHEVeaPYWg0UV1nAeFa3/wAhzUP+viX/ANCNUQK9U1nwLZalfSXSSyW7P95UUYLf3uapf8K1tP8An/uP++VrxJ4Wo5M+mpZlRjBJmh8M/wDkWl/66P8Azrq6p6Zp9vptoltaoEjQfn6k1aB4r1qUeSCiz5+vNVKjmurH1x3xU/5AEX/Xwv8A6C1ddkY68VS1nTLbWLB7W6TKNyD3U9iKKsHKDSChP2dRTfRnhlaHh3/kP6d/19R/+hCu3Hw5ss/8f83/AHytXtG8DWGm6gl2ZnuXj5QOAAp9eO9eXDCVFNNn0FbMKM6bit2jraKKBXsnzIV4z45GPFN8P9pP/QRXsx61y/iPwdZ6xfC6Mj28mMOYwPn9Cc965cVSdSFkehgK8aFRuWzR5Ia9M+FH/IGu/wDr4/8AZRUX/CubP/n/AJ/yWup0LSLbRrIW1ouB1Zj1Y9ya5MNhpQldnXjsZTrUuSBpClpuR60ua9O54ljnviF/yKV99E/9DWvHq95v7OC/tpLa6jEkUgwynoa4/wD4VtZ9r2cf8BFcWJoyqtOJ7GAxdOhBxn3POE++v1Fe/r0Fcfp/w9sbW7jnmnkuFQ58twNp+uK7FRgVeFoypJ36mWY4mGIa5Og6g0maM11nmHknxL/5GiT/AK4p/KuXHQV7F4l8K2evOkkpaGZDzIg5I9KxP+FaWn/P/cY/3RXl1cNOU20fSYXMaNOlGE9GkVvhF/rdS+kX/s9ejDpWP4b0C10C1MVsWdnOXkYfM3pWxXfRg4QUWeJiqqrVXOOwlcb8RtBn1WzjubNN81vncg6sh64Hc8dPy5rsxQaucFOLizOjVlSmpx6Hz1RXsOseC9K1NnlMXkTvyZI+MnOSSOhNY/8AwrOz/wCf+4/74WvLlhZp2R9FDNaMleV0ebUV6T/wrS0/5/rj/vlaP+FaWn/P9cf98rU/VanY1/tPD9zzaivSf+FaWn/P9cf98rSf8K0tP+f6f/vlaPqtTsH9p4fueb0V6R/wrS0/5/p/++Vo/wCFaWv/AD/T/wDfK0fVanYP7Tw/c83or0n/AIVpa/8AP/P/AN8rR/wrS1/5/wCf/vlaPqtTsH9p4fuebUV6T/wrS1/5/wCf/vlaP+FZWv8Az/3H/fK0/q1TsH9p4fuebUV6T/wrK1/5/wC4/wC+VpP+FZ2n/P8A3H/fK01hqnYP7Tw/c83pK9J/4Vnaf8/9x/3ytH/Cs7T/AJ/5/wDvlaf1WoL+08P3PNaK9K/4Vlaf8/8AP/3ytaui+CdL01g7p9plU5Dy9umMDpnjrVLCzb1JnmlCKvHUyfhp4fnsmk1G8Ty3lQLEp6hSckkds4H613ooVQoAAwBS16MIKCsj5yvWlWm5yCiiirMQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoNFBoASiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigBaKKKACiiigDF8Z3M1n4bvJ7dykiqu1h1GWA/rXjhLMxJJZj1J716948BPha9wCflU8f7615DXhZk3zpLsfQ5TFOnK/clsbmWxuorm1kKSxnOR/noe4r3ZegrwSFWaZVVWZmIAA5Jr3tegrbLG+V3MM2SUo2HUUUV654oUUUUAJXivii8nvNeu2uZC5ileNPRFDEAD07fzr2o14fr6smu36sMH7Q5H0LEivLzGTUEkevlSXtXfsURwK9Y+Hl7cX2hb7qQyMkhjBPXaACMnv1ryc816l8MlK+Hm3LjMzYPqMCuXL3L2j1O3NIpUlbudbRRRXunzYUUUUAFFFFMAoNFBoA8h8f3k1x4jnhllLRwYWNR0XIBP5+tc6a2/HQZPFd7uXAJUg+o2isQ8ivmcQ37SVz7LCxSoxt2PTPhjeXFxpU0U0pkWGQRpuH3Vx0rs64b4Vqw067JXAMy4PrxXc17uFbdJXPmMakq8rBWJ40u5rHw1eXFs+yQBQG9MsBx781t1z3xAUt4TvQoJICnj2dTWtVtQbRjQSdWN+6PIHZmYkkszHPPUmp9PuZrK7juLWQpMhyMd/8AEeoqDHOcU5EZpFVNzbiAAvJNfNXkpXPspKLjY9G+KV7cQ2FtBDIUjnZhIB/EBjj9a84r0L4qqxtbAhSVDuGPpwK88rsxkmqmhwZcl7FHSfD68nt/E0EELkQ3CsJAejYUkfiCOv8AjVr4l3lxLra2hkPkRorKn+0R19zVDwErN4rsyoyF8wn2+RhVj4kqw8RsccNEmD68VSk/qz9SHGP13bocyx28D/8AVXoHwpvLh1u7WSQtDFtZFP8ACTnP8ulee13nwnVvOv2+bbhBntn5qnByftUb5hGP1d6HotFFFe6fJmf4gmkttEvZ4DiWKB3Q4zggEivEZHeWVpp2LyuSSxbOc9STXtniYM2gagqgljbyAAf7prxHGDzXk5hJpxSPfyiKak2Ptp5beVZoJGjkU5V1OCK9H8W6ncp4KtJklZZbpY1lYcEhkJP059K81r0DxnGw8Caau1vkMORjphD1rHD3UZ27HRjYx9rT06nn/atTwpdz2niCzaCRk82ZInHZlZgCD/n3rKrQ8OKW8Q6cFGT9oQ/gGGaxpSlzo7q8Y+yl6HuNAoor6I+KA9a8g+IF5PceJ7mGaUtFBtWNOygqCePf1r1/vXjXjlSPFl8SCM7cZ/3RXDjpNU1buetlUU6+vYwic16j8NbyefQ5Fmct5MmyP2XaDj6eleW16Z8LVb+xLrOf9ece/wAorjwkm5npZko+w26nnV5dT3lzJc3UjSTOclz/AJ6DsO1RRyOrKyuyspBDDggjoRSOmxyvzfewyt1BFLXLKUlI9GCio2SPaPCF3LfeHbO4uW3yupLN6/MR/StmsDwMrJ4VsVZSpCHgj/aNb9fQQd4p+R8XWSVSVu4VwvxUvLiCztbeCQpHMX8wLxuA24B9ua7qvP8A4tKTHp7Y+UNIGPpwtZ121TdjfBJOvG554q5ySa6b4c3c8HiWG3jcrDcBhIuOGwhI/HPf/GuZH3TW/wDD5WPi2yIGQu8k+nyMK8mjJuaPpcXFOjL0PZaKBRXvHxwYooooEFFFFACUUUUhhRRRQAUUUUAFFFFABRRRQAUUUUALRRRTEFFFFAwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoNFBoASiiigCtfXkFjA091Ksca8kscVk/8JloX/P8P+/b/wDxNZHxT/48LT/rof5V52K8jFY6dGpyRR7GEwEK9Pnkz2fTNe0/VHZLG4EroAWABBx+IGa0h1ryPwHx4qs/ff8A+gNXrldWDrSrwc5dzkxuHWHqckXpYU0UUV2nEZOoeJdJ06cwXd2iSgZK4YkD3wDVf/hM9B/5/wBf+/b/AOFeYa/u/tzUO/8ApMn/AKEaoYPpXgVMyqRlZJHvUsspzgm5O57vDPHPEssMivG4yrLyCKyJvF+iQyvE98m5Dg4VmGfqBWB4Wdj4A1E5O4LNj2+SvP66a+OnTjGSW6uc+GwEKs5Rb2dj16Lxfoc0qxpfpuY4G5WX9SK1ri4itoGmnlCRIMszHAFeF16B4rZv+EC075vvLDn3+Sihjp1Iyk0tFcK+AjSnGKe7sbv/AAmWhf8AQQX/AL4f/CrGn+I9K1GfyLO8WSXBITaykgemQM14zV/QeNd08/8ATzH/AOhCsKeZTlLlsdFXK6cIOSbPYNQ1K0023M97OsMfTLetZv8Awmehf8/4/wC/b/8AxNct8Uj/AKdZrjK+W3864oVpiMfOnUcIrYyw2XQq01OTep7dpes2OqqzWFyswQ4bCkEfgQKj1PXtO0tlW+uliZhkDBJI+gFef/DNseIm5wPIb+Yqn47P/FVXnPA2f+gLWn12XsPaW1vYmOXweIdK7ta56D/wmehf8/4/79v/APE1r2V5Be26T2kqyROMqw6GvC69E+FhzYXY9JR/KjC42dafJJIMXl8KFPni2dxRRRXqnkEcqJLGySKGVhgg96xP+EP0H/oHr/38f/Gt6kx7VnKnCfxK5UakofC2jGsvC2j2Vwtxb2apKhyrFmOD+JrbpKWnGEYaRVhSnKbvJ3CiiirEFFFFACVyfiL/AIRT+0D/AGuY/tW0ZwXzjtnbxnHrzjHbFdWehrxHX2zrt9zkCeTH/fRrhxtb2UE7J+p6GAoe2m9WrdjsceA/VPzmrtbH7P8AZo/sezyNo2bMbcdsV4XXqPwz58PN6+e38hXNg8T7STjZL0OrMML7KClzN69TraDRRXrHikFzcxW0LzXDrHEgyzMcAVjHxnoHfUV/79v/AIVnfE840KMetwv/AKC1eYkV52KxcqM+WJ62DwEK8OaTfyPZ9O8S6TqVx9nsrxJJcZCYKkjvjIGas6hqdrpsPnXs4ijzjJBOT7AV494fbGu6een+kx5/76FdN8Uz/p1mP9hv50oYuU6Tn1QVMBCNdUruzOr/AOEy0H/oID/v2/8AhV/S9ZsdVR2sLhZtnDYBBH4EV4jXV/DFtviCTnCm2b/0JaijjZTnyyRricshSpOcZO6Ot8Unw39oiGu+X5207Rh92Pfb/X3x3rH/AOKBz0XH/bauY8ctnxRe85Csv/oIrF681jWxXvtcq+Z0YbBc1NPnktOjPbtHFh/Z8J0oobUqNmzpj/H681TvPFejWtw0E98iyJwwCMcH0yBWB8L2zpt56LKBj/gNeeOzFiWJJPJJ7101MXKnTjKKWpxUcDGpVnGbeh68njPQXKquoLluBmNx/MVtHy7mH+GSJx9QRXgw5Ga9i8Dnf4YsT1O1s/8AfRq8LinWk4yJxmCjhoKUW9xjeC9Bbk2Az/10f/4qpbHwto9jOk9tZIsqfdYszY/M1tYHpRgV2eygndJHA61Rq3Myvf2NvqFu0F3EJY26qayP+EL0D/oHr/32/wDjXQYpabpwlq0iY1JwVotoy9L0HTtJZ30+3ELyABmDEkgfUmqnihtC8qH+3tmN37vO7dnHONvOMde1b1eTfEhv+KmYZ4EKn9KwryVKnokdWEhKvWtKTv3NvHgH/pn/AORq6nw1/ZX9nL/Ymz7NuP3c/e75zzn69sdsV4pXefCUn7RqAzxiP/2auPDYnmqKPKl6Ho4zBuFJz527dz0SiiivWPBE7c/jXCXg8Dfa5PO8rfuO7b5u3OeenGPpxXU+JTs8Pagc8/Z5f/QTXiROTk9a4MXW5GlZP1PVy/De25nzNeh6Rpx8EfbY/s3lebn5d/mYz77uPzrsbm2hvLd4Z0EkUi7WU9CK8Gr3Dw//AMgOx/694/8A0EUYWp7S6aS9B5hh/Ycr5m/Uzv8AhC9A/wCgen/fb/41a07w3pWmT+fZWaRS4278liB7ZJxWtijBrr9nBapHmutNqzbKep6pZ6XAJb6dYkJwMgnJ9gBWX/wmugf8/wCP+/b/APxNcl8Vn/4nFog7Q7v1NcYc1wVsXKnLlSR6+Fy2nVpKcm9T3HS9YsNWjd9PuVmCHDYyCPwNRaroOm6s6PqFqsrICAdxBAPbgivP/hc3/FQTDsbYn/x5a9VrrozVeneSPPxNN4arywZzv/CF6B/0Dx/38f8A+KrZsbOGytkgtkEcSDCqKs0VsoRjsjnlVnJWk7mJeeFNFvbh7iexRpXOWYMwyfoDUaeDdDjdXSwTcpyNzMRn6E1vUtJ04dhqtUSspMhYpBEWZgiIMkngAVi/8JpoH/QQB/7Zv/hTfHzFfCd6fZf/AENa8frjxGIdJqMUehgsFHERcpPqe0WfirRby5WCC+QyvwoZWXP5ip9ebTBp0n9seV9m7+Z0/Dvn6V4lESJ0IfByK774tZEOmqDwWk/9lqYYpzg21saVcDGlWhCMnqSf8W//ANj/AMjVs+Fj4YFxN/YPl+dtG/7+7bntu5xnrj2z2ryIZrf+HrbfFtkR38wH/v21ZU8TeSXKjrxGCtSlLnk7K+p7IKKB0or1j5wKKKKBBTTwKdWX4m/5F/Uf+vaT/wBBNJuyuVFXaRTk8Y6FFMyPqCZBIOEcjj0IGD+FLF4x0KeVYo79NzHA3Kyj8yBXjdFeZ9cn2Pov7JpJX5me9Xd3Da273FxKI4YxlmPQVj/8JroH/QQX/vh//iawPHJYeB9M56tFn3/dtXneDW1bEuDskceEy+FeLlJvc9t07xJpepz+RZ3aSS4zswykj2yBmrGo6pZ6VAJr+4WFCcAkEkn0AGSa8a8N8eItN9rmP+Yro/iv/wAhi1Xt5HT8TTjiXKHNbVBUy6EcRGkm7NXOv/4TbQP+f9f+/b/4Vo6VrFjq8bPYXCzBThsAgj8CBXhldd8LDjxDNzgG1b/0JKilipTlZo1xOWU6VJzTd0eg6rr+maVIsV/drFI4yFwWOPwBxVL/AITbQM/8f6/98N/hXnPjw7vFd8c8Arj/AL5FYWOampi5RlaxdDK6c6anJu7R73aXkF7bx3FrIJYpBlWHQ1l33izRbO5e3nv1WSM4YBGbB9OAawvhaf8AiR3fPSc4/wC+RXmrZYkkkk881pUxDjFSXU5qGXxqVZQbdkeyR+M9BkdUXUUDMcDcjgfmRit2ORZFDKcg9DXz90r2rwYd3hjTj/0xFXQryqtponG4GGHSlBvXubdFFFdZ5YUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUGig0AJSmkpaAON+JdpcXGmQywoXWByz47DHWvN/m/u17L4g1m30Wy8+4yxJwiDqx9K5f/AIWHD/0DX/7+j/CvExlCjOpzSnZnt4KvWhTtCF0YngC1uJvEUM8cWYoNzSMOi5VgPxJ7V6t3rmfDfi621i9a2MJt5NuUy+d/qBwOldNXZgoQhTtB3VzhxtSc6l6kbOwpooNArvOI8Y8UWlxaa9dieMp5kryKezKScGszY2f4q95PvRt9q8aeWKUm7nr080lCKjynH+GdNu4vBt3bSQlJp0k8tGwCcrgZ9OfWvOJoZYJWimQpIhwVIwQa9znkSCNpZWCIgLMxOABXF3HxDtVuHEVlJJGrEB/MAyPXGOKrFYelyRUpWtoPCYiq5ylCF7nAQwyTyLHDG0kjkKFUcmvRvE+m3cngqztliLTWyxGRF5xtXDY9aht/iJatMiyWUkaE4Z/MB2j1xjmun1DVrWw0w38sgMOAVIP389MVOHo0ownyyvpr5DxVes6kXKFrPQ8WwT2xWn4Ysri716yEERYxSrI3oEVhk5/z6V1n/CxoQcjT3/GYf4Vb0TxvbalqCWr25tjJwrM4ILdh071zUsPRU179/kdVbEYiUH+7tp3KHxPsbh5Le7jjLQxqVZh2JPFcHsb+61e8kZFG0eld1bL1Vm5p2OChmLowULXPNfhnZTnV3ujEfISNoy+eNxIOPyql8QbOeHxHPPIhEU+1o27MAoB/I16vtHYYo2g9eat4JOiqV+t7kLMJKt7a3S1jwba39016V8MbKe20ueWeMos0gaPPUrjGa6/aPT9acoxSoYFUZ817jxOYSxEOS1hRRRRXpHmhRVbULuGxtXuLhwkcYySa4tviRErFf7OkPv5o/wAKxqV4U3absbU6FSr8Cud7TVx2rjNP+INtc3kcM9o1ujnHmNICF+vFdB4g1m20Sy+0XByTwiA4Ln0FEa9OUXJPRBLDVIyUWtXsatFcF/wseP8A6B8n/f0f4Vq+G/GNvrV21q8X2eXbuRS+7f644HSojiqUnZM0ng68IuUo6I6ig1z3ifxRb6F5aFPPmfnYr4IHqeDWH/wseP8A6B7/APf0f4UTxNKL5WxU8JWqR5ox0O7PQ14t4nsriz127WeMoJJWkQ9iCxIIr1Lw1r9vr1o0sK+W6HDxMckeh/GsfXfG9rp+oPaRW7XJjO12V9oU9x0rmxSp1qabdkdOClWoVXGMbvqjzPY39016v8PrK4sNB2XcZjeSQyAHrggYyPwrG/4WJF/0DH/7/f8A1q63T9WtL/T/ALdBKPIxlmP8OOufTFZ4OjShNuErs2x9evUgoyhZXNKg1wk3xHt1lZY7J3QHCt5gGR64xxTrf4jW8k6JLZPGjHBfzAdo9cYrs+tUr2ucf1Kva/KaHxDsri90ILbRmRo5RIwHXABB/nXlRVhwQeK9q1TWLTT9LN9LIDCRlMfxk8gD61yh+I0PbTX/AO/w/wAK4sXSpyneUrM7sDXr04OMIXVzlPDFpcXmv2awRFvLlSWTHRVVgcn/AD7V03xQsrhntrtImaGNSrsO2TxWpofjm11K/S0ltzamThGZ8hj2HTvWp4l8Q2uh2ytMPMkkPyxA4JHc04U6XsWlLTuTUr1vrMZOGvY8d2t/daux+GFpMdVnujE3krEYi56biVOPyFXx8R4B/wAwyT/v8P8ACtvwz4ntteaWNU8iaPnymbJK+o/Gow9GlGouWV2dGLr13SalTsn5nCeP7Oa38RXEsiERz4aNuzAAA/lXO7G/2q9V8S+MbbRbwWyxG5lAy6q2NnoDwetZR+JUJOf7Lf8A7/D/AArOtQpOo7zKw+JrxpK1O6t3Lfw00+4t9JnknQotw4aPPdcYzXnV3aXFlcva3cRjmjOGB/z09DXs2haxba1YLc2/HZ4yeUPoa0VVccCuyWFhVpxSexwQx06NWUpLV9DwREZ32qrdcAAdTXsng+1mstAtYLlNkqKdy+h3E1sbR6UtaYbCKjJyuRisc8TFRatYWigUV2nniUVleI9ct9DsvtFx8zE4SMHlz7Vy3/Cyo/8AoGv/AN/h/wDE1jOvCm7SZ008NVqq8FdHfV5b8S7G5j1kXXlt9ndVRX6jdg5HtXU+G/GNtrl41oYDbS7dyBnzv9QOO3+eldQF9RWdSMcTC0WaUpzwVW8lr2PAdj/3Wrv/AIV2dxGl3cyRMkUwQIzfxYznA/Gu/wBo9KAuKxpYJU5c1zoxGZSr03C1haK4/X/Hdrpt+9pFbNcmPhmWTAB9OlUf+FmR/wDQNf8A7/D/AOJroeJpxdmzkjg60lzKJ1+vQSXWi3kEK7pJYXRRnGSQQK8SlhkhlaKaMxyJkMpGCCOxr2yx1W2vdNW/ikAg2lmYn7vrn0xXJ3PxFtlnZY7CSRAxCuJANw9cY4rnxcIVLOUrHbgatai5RhG55/bwyXMyQwI0krnCooyTXt+iRPBpVpDKMSRwojD0IGDXI23xEtWuEjnspIUY8v5gOB69K6nU9ZtdO0w38rhoiBswfvk9APrRho06fM07ix1StWcYzjbsaRFFcD/wsuP/AKBsn/f4f4Ve0Px1b6nqKWktu1r5nCM0gILdh079q6ViKcnZM5JYOvGLk46GR8UrC5e7gvUiLQJFsdx0Bznn864X5vevfyN30pdo9K56uDVSXNc6sPmMqEFC1zzL4W2dwdVmvPJK26xNH5h6biVOB68D8K9OpMAdK5jxL40tdFvFtEgNzLjLhX27PQHg9a3go4eFmzlqynjKt4rU6mivP/8AhZcX/QMf/v8AD/Cus8P6zb63YLdW2R2dD1Ru4NVCvCo7RZFTC1aSvONjUoNcPf8AxGtLe7kht7UzohwJRKArepHBqGH4kQPIqtYSqrEZPmA4HrjFJ4imna5osFXavynQ+M7Wa98OXkFtH5kpClVHfDA/0rxorg4III6g17xZXUN7ax3Fu4kjkGQRU4XHAHFZ1cOqzUkzTC454WLhy31PB7CznvbuKC0jMkjMMD/Pau/+KNjcz2lnPFEXjgL+aw/gB28n24ruioPasjxFr1todn51wC7McJGDgsf8KiOGjTjJN7mrx061aM4x1XQ8V2Nn7prpfh5ZXEniSC4WP91b7jI3YZQqPxya3f8AhZEOc/2a/wD3+H+Fa/hnxjba3etbGI20uNyBnzv9ccdq56VOkppqVztxOIxHs2nTsrdzqh0orm/FPiy20F0h8s3E7cmNWxtX1Jwaw/8AhZcX/QOb/v8AD/Cu+VeEXZs8eGErVI80Y6HoFFYnhrxBb+ILR5IV8uWM4eInJX0rbrWMlJXRzThKEuWS1Cs/XoJLnR72CEbpJYHjQZxkkECtCobmRIYXllYJGgLMx6ADqaJbBFtNNHgk8csMjxyxFJEJVlIwQR1FOt4JbmZIYY2eVzhUUZJr0Gb4kWySusenSyICQr+YBuHY4xxS2vxHtHuESexeFGOC/mBsD1xivJdGnf4j6f6zirfw/wASXxnp95L4NtIo4S72xjaRFOSAEIP1wT/WvM8N3Br2/V9ZtNL0s307gxYGzB++T0A+tckfiRCOmmP/AN/h/hW9enTk1d2OLBV60ItQhdXOV8I2Nzd+ILIwRFxFKkrnsqhhzXRfFOxuWu4L1IWeBI9jOOQpyTz6da2NA8c2mqailpJAbYycIzPuDHsOg61p+JvEttoUC+aPOnf7sSnBx6k9hTjTgqT10FPEVvrMZOGttjxvY391q7L4WWUx1a5uzG32dYjFvPTcWBwPXgc+n41oD4lwjppcv/f0f4Vu+FPFNv4g8yNYjBNHyY2bJx69B3/p61nRp01PSVzfF4ivKi1KnZepwHxAs7i38SXEskREVwQ0TdmAUA/ka57Y3oa+gsA8mjaPStp4Tnle5zUc0lTgoct7HF/DWxuLfw/K08ZQXEnmR57rtGD+Neb3tpPY3b291GY5oztKn/PQ9jXvnCj2rhdR+ItnBeSxQWjXEaNgSiQAN6kcHj09aK9GHJGMnawYTF1XVlOEb3POFjeSQRxozuxAUAZJJ6CvbPCltJaaDZwTrskjjAZfQ1y0XxItjIqyabKqtjJ8wHA9cY5rrpdWtIdIbU3lH2YJv3+oPT8aeHjCLbi7jx9atVjGE4W1NIUV59/wsyPtpsn/AH9H+FWtM+Itrd3iQXNq1sj8eY0gIB9+Bx71uq9Nu1zhlgq6V3E7eiiitjkCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKDRQaAEoFFFAHEfFP/AI8LP080/wAq89716r440S41nT4xaFPNhYuFbjdxjAPauF/4Q7Xv+fE/9/U/+Kr5zH0KkqrcU2j6PL8RShRUZSSYeBv+Rpsvq/8A6A1evd6888G+FdStNaivL+MW6QA4BYOXJBHYnHX/AD29DFehl1OcKVpK2p52ZVYVKt4O+gGig0V6Z5oUUUUAZ3iP/kA6h/17yf8AoJrxWvctRtvtljPbbtvmxsmcZxkYryubwZrscrpHZeYi5AdZFwfcZOf0rxcyozm1yK57WVVoU+bmkl6mBXoHivP/AAgGnf7sP/oFc9b+DddeRFayCBjgu8i4HvwSf0rt9e0Ce+8MxabbyqZbdU2lhgPtGPwzWGEoVFCfMrXRvi8RTlUhZrRnlBFX9A/5Dmnf9fMX/oYq8fB2v5x9gz/21T/GtDw94Q1ZNXt5b2H7PFA6yliytnachQAe/wDn0rlo4apzrR7nZWxVGVOS5lseoDpRQKK+qPkmLRRRTEFFFFABRRRQBgePP+RVvvov/oa15FXtHiPT21bR7iyjYI8oG0noCGB/pXmTeDNeGf8AQSf+2qf414eY0pzmnFNnv5ZVpwpyU5JO/UxE++v1rv8A4q5+y6fn+/J/SsKw8FazLdRLcQC3iJ+aQurbR9AeT6V2XjfQbjWbKL7IymW3LMqNxv6cZ7dKmhRmqM009bF4nEU3iKbTVlc8qxW54F/5Gyxx/t/+gNSf8Id4g6f2ef8Av8n/AMVW54N8K6lZ61He3yLBHbgkDcGLkgjAwTjGev8Akc1ChU9otHudOJxVKVGSTWxn/EzP/CRJn/ngn82rlx1r0Lx54bvtSvorywUTHaIzHuCnjODkkDvXNf8ACH69nH9nN/39j/8AiqvE0ajqtpCwWIpKklKSRu/Cj/Xajj0j/m1clrv/ACHNQz/z8yf+hGvQfAOgXekQzzXwEck+0eXwSoGeSQe+elc9r/g/VTq9xLZxfaYppGlDBlXG4kkEEjkf59B01KNR0Ixtqc9HEU1ipybVmjks13/hP/kQdS/3Z/8A0Cud/wCEN17/AJ8D/wB/U/8Aiq7vQfD0ll4am02eZTJcK+5lXhCy449cfhUYOjOMm2mtCswxFOVNJST16Hk1FdBN4L1yOR1FmHUMQHWRcEeoyQfzFEPgzXZJ0VrPy1Y4LmVcKPU4JP6VyfV6t9mdrxVHlvzI3vGH/Ih6Z/2x/wDRZrgK9Y8SeHpb7wxDp0EoMtsEKkjAcquMe2c1wv8Awhuv/wDQPP8A39T/ABrrxdGo5LlTehw5fXpxg1Jpa9TP0H/kN6d/19R/+hCup+Kv/IQsv+ubVW8PeD9WXWLaa8hFtFBIsxYsrElSCFAB7/59K3/Hvh291ZIbmyAkkhG0xZAyD3yTVU6M/q7TQVcRTeLjO6skeZjrXV/DLP8AwkEmOv2dv/Qlqh/wh2v/APQOb/v6n/xVdR4B8NX+l3st7foISUMSx5DE5IOcg4A4/wA988NRqRqJuJtjcTSlRajJM5bxz/yNF9/vJ/6CKw+K7jxn4V1K61mS8sY/tKT4yAVUoQAMHJ5z2P8Ak4f/AAhuvf8AQPP/AH9T/wCKrGtQqupJ2e5phsVRVGKclsdX8Kf+Qfe/9dh/6DXc1y/gXRJ9G01hdkebOwkKD+DjGM9z/nmuor3cPFxpJPc+dxcoyrSlF6BRRRmug5QooopgcD8WP9TYf77/AMlrz0V6v480K51mziazKtLblmWJuN+cd+x4rhf+EO1//oHf+RU/xrw8XSqSqtxTZ9Jl1enCioykkx3gT/kbbD/tp/6LavYa848F+FdTs9bjvNQiFvHADhchi5YFcDB4AznP+R6Pmu3BRlGDUkebmVSFSteDvoFBooruPNPCtc/5Duo/9fMv/oZqlxXX+IvBurHVrmWzg+0xTSNKHDqpG4kkEEjp/n0Gd/whuv8A/QPP/f1P/iq+enQnzPRn11HEUVTinJbHT+Gv+Sb33/XOf+RrzuvXNH8PyWvhaTS5ZhvmR1Z1XIUsMcc84/CuCm8Fa9HIyiyDgHAdZVwfcZP8xXTXpVJRjZbI4sFiKcak+Z2uzAr0Dxjn/hAtL9P3H/os1z9v4L1yWVUe0EQJ5d5FwB6nBz+ldx4i8PTXvhmHT7eUGS1CbSRjzCq4x14zn/PWnh6U1Gd10HjMTSlVptNaM8nq94c/5D+m/wDXzH/6EK0P+EM1/wD58P8AyIn/AMVWj4c8HaumsW099H9mit5FlLb1bdg5CgA9/wDPpXPSo1OdOzO2viaLpySmtj1AUtAor31sfHiHpXjfjj/ka77/AHl/9BFey15v4y8Jalc6097Yxi4juPvAFVKEADHJGc9j/k8eMhKUEorqenltWFOrebtocLjmvSvhVn+w7rH/AD3P8hXKf8Ib4g/6Bzf9/Y//AIqu+8DaLc6Lo7RXbDzZm8wqOdnAGM9zxXJhKc4z95Ho5hXpTpWjJN3PIicmlrpLzwPrVvdPHBALiIfdlV1XI7cZyD/nmoV8Fa6zKv2LbkgbjKmB7nBJrmlSmnsehHE0JRvzI9F8Bj/il7H/AHD/AOhGt4Vm+HtPbStHt7N5PMaJcFsYzyT/AFrS7V7sFyxSPkazUqkpLuA6V5/8W/uaf9ZP5LXoA6VynxA0C61q0heyKmW3LN5Z435x0PTPFZ14uVNpG2DnGFeMpbHk4HFb3gL/AJG2xx/00/8AQGpP+EL8QdPsH/kRP8a3vBPhTUbPWkvdQjFuluDtXIcyEqR2JwBnP4/l5NGjUVROzPosVi6LpSSktjN+JP8AyND5/wCeKfyrlhjFehePPC2oalqKX+nAT7lCNHkKVwOuSea5r/hDPEOcf2e3/f2P/wCKq8RRm6jaTJwmKoxoxTktjoPhF/rtS+kf/s1ejdq474e+HrvR4Lia/wAJJcbR5QwSmM9SOOc/56Dsu1enh4uNNXPn8bOM6zcXdDT1rN8T/wDIu6j/ANesv/oJrSPWqmq2pvdOubUPs86Jo92M4yMZxW8tUcsGlJX7nhJptdFL4K16OV0SyDqpIDrImD7jJBx9RSweB9dklWN7QRKTgyNIpAHrwc14fsZ9j7F4qjy350dB44/5EbS/96L/ANFtXnua9a8UeH5tR8NQWNtIvmW2xhuGBJtUrj2zn/PWuD/4QvX/APnw/wDIqf8AxVdGIpSk1Y4Mur04walJLXqUPDXOv6d/18x/+hiuj+Kef7Zts/8APD/2Y0nhnwXq0esW097D9mht3WYtvVixU5AABPX/AD6Vt+PvDV5q0sV5Y4kaNNhiOASM5yCT+lOFObouNhVMTSeLjJNWseaHNdb8K8/8JFNj/n2f/wBCSs7/AIQ3xB/0Dz/39T/4qur+H/hm/wBKvpr3UFEJKGFI8hieQS2QcAcYH9O+eHozjUTaN8diKUqEoxkmzux0paB0oPSvXPliOXGxs+lfPq9K+gpFBVhivIr3wNrkF3KkFsLmJfuSq6ruHbgkEH19/WuHGQlK3Kj2crrU6blzu1znCa9I1DP/AAqlPTyYv/Ri1yqeC/EDyIpsdgY4JMqYX3ODXoFz4eml8H/2MsyCURKocj5SwIb8sjGfxx2rHD0p+9ddDqx+IpScOWSdnc8hNKn+tj+orcPgvxCP+XAt/wBtU/xqxpvgfWpbtBcwC3iByzs6tgewB5P+c1iqVS/wnfLE0VFvnR6+KKBRXtnxoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABQaKDQAlAooFAGD4v11tDsVkji8yWUlUz0BAzk1xf/Cf6v/ctP++D/wDFVufFP/jytP8Arqf/AEGvO6+ex+JqwquMXY+hwGFpVKPNNXZ6D4T8Y3Opaqtnfxx/vQfLaIbcEAk5BPQ4/wA9rHjTxZNo9xHaWUSmYgOzSLldvPHXrXJeBv8AkarL6v8A+gNVv4mf8jEv/Xun82qliav1XnvrexEsLS+tqFtLXF/4T/Wf7lr/AN+z/jXU+C/E0mtiSG5jVbiIbmZPukE8e4ry4dBXafCz/kIXv/XNf5mscHiq0qyjKV0bY3CUoUXKKs0ejUUUV9KfNhRRRQAHpWR4n1f+xNLN2EMjlgir0G4+vtWvXJ/E3/kXV/67r/Wsa8nCnJrsbUIqdWMX1ZzH/CfaxnO21/74P/xVaGgeOby41WC31CGJo52EYMIwVYkAHqcj1/yK4ar2hf8AIasP+viP/wBDFfO0sXVc1qz6WtgqKg7R6HovjPxNJoixQ2sStcSjcGfoADzx1Jrlf+Fgaz/ctv8Av2f/AIqrfxS/5CFl/wBc2/nXGVti8TUjVaTsjDBYSjOipSjdnpXg3xZPrFzJaXsSrLtLqyDC7RgEYJ681W8V+MrnTdTezsIY/wByB5jyDOSQCMAEcAGsX4af8jI3/XB/5rVPx1/yNd/9U/8AQFrR4mp9V509b2Mo4Sl9b5LaWuXv+E/1n0tf+/Z/xrtPCGunXLFpJI9k0R2yAdCfavIa9D+Fn/Hhef8AXUfyqcDias6qjOV0VmGFpU6XNCNmd1RRRX0B86FFFFABXPeMPEB0G0QxR+ZPPuEefugjHJ/Ouhrg/it/qLH/AH3/AJLXNiZuFJyidOFgqlWMZbGP/wAJ9rOc7LX/AL9n/wCKrZ8J+MLvUtWWy1CJP3wPlmNcYIBJzyewrz6tzwN/yNll/wAD/wDQGrxKGKqOok31PoMTg6MaTaitjrvGfiubRrmO0so0aUgOWkGVwc8DBHNc7/wn+sZzstf+/Z/+Ko+Jf/Iwr/17p/Nq5QCniMVVhVkkycHhKMqKco3Z6x4L8SPrsUqXUarPDgsU+6wOcYHXtXTDFeefCf8A4+NQ/wB2P/2avRK9jCzlUpJyPDxdONOs4xQUYoorrOUKKKDQBjeKdYGh6Z9pKea7t5aL23YJ59uK4Q/EHWCPuWv/AH7P+NdJ8Uf+QDD/ANfK/wDoLV5geleLja9SFS0XY9/L8LSqUueavqd14e8c3lzqsFvfxRNHMwjBiGCrE8Hk8j1/yK9E4xXh+gf8hrT/APr5j/8AQxXuArpwNSVSL5mceZUYUqi5FbQWiig16B5hwPizxnc6dqr2VhDHiEYkaUZ5IBGACOAKyP8AhYGs5zstf+/R/wDiqz/HP/I0331X/wBBFYnNfO1sTU52r9T6rDYKhKlFuPQ9f8I6+ddsHllj8uaFgkgHQnGeK5C9+IOpG6f7JDCtuD8gkQliPqD1NanwrONNvv8Arqv/AKDXnh6iuqviKkaUHF6s5sPhaU69SLWi2OrT4haxvXdDbMueRsIyPzrtH8Rxp4Y/trynKbNwTPOd2MZ9M9/SvIRXoEv/ACSof9c1/wDRoow2Im1Lmd7IWMwtKLhyq13YyD4/1gk4W1A/65n/ABqfT/iDqK3K/bYoXgJwwjUhseoyTXHChPvj61xxxdVvc75YGhb4T1zxj4gfQbSMwxebPNkJnouMZJ/OuN/4WBrP9y0/74P+Na3xY/1Vh/vSfyWvPgK6sTiKkalos4sBhaNSkpzjds9E8JeMrrUtUFnfwoplB8toxjBAJORk+n+e1jxp4vm0i7WysYlMy4Z2kGVwRxjmuR8Bf8jXY/WT/wBFtVj4k/8AIyv/ANck/lVe3n9Xcr63JlhaX1xQtpa5J/wsHWv+edr/AN+z/jXXeB/EsuvQzpdRBLiDBZk+6wOccdR0rycGu6+E3/HzqP0j/m1RhcRUlUUW7mmOwtGFFyhGzR6KKXFFFe2fNlW/uksbKa5dSywo0hA6kAZrzaf4g6q8rtDFbLGSdoZCSB2GcjP5V3/ib/kX9Q/69pf/AEE14nXm42tOm0os9jLcPTq3c1c623+IWqpMhnitniB+ZVUqSPY5P8q7LW/ES6f4ei1OOIu04Xy1PYsMjNeQV3/jH/kQtL/7Y/8Aos1hQr1JQld7I6MXhqMalNRja71Mn/hYOtZzttP+/Z/xrR8O+Oby51WG21CGJo52EYMS7SrE4B5PI9f8iuCxWl4d/wCQ/p2P+fmP/wBCFYUsTUc1qdlbBUVTk1FbHuAopRSV9Aj5MWiiigApDS0hoA8xvfiDqDXUn2KGFIM4QOhZvxIOOf0qBPiFqwdTJFbsqkZAUgkd+cnFcn0/qfSkrwfrNS+59hHBUOX4T2OTxDEvhf8AtoQuYym4R5Gc7tuM+me/pXEv8QdZH8Frj/rmf/iq15/+STr/ANc1/wDRorzw9K6K+InHls+hwYHC0qnPzK9mdnYfELUFuo/tsMMkBOG8pSrY9Rk16aDkV4Cn31+te/L0FdGDqSqJ8xyZnQhRlHkVrjqMCiiu48kMUUUUAJxivN9f8fXsGrT2+nwwrHAxiJlG5iwJBPBHHpXpNeEa5/yHNQ/6+Zf/AEI1yYqcoRvE9PLaEK1RqavodB/wsPWf7tr/AN+z/jXc6X4jhvtAfVXgkjSJHeRByflGTj1/HFeMrXo3hr/km9//ANc5/wCRrlw1acm7vodmPwtKEFKKtrYx5/iHqzO5jitkQk7QVJIHYE55/Ki2+I2qrMhnit3jH3lVSrH6HJ/lXJUVisRPud/1Kha3Ke9WcwubaKdQdsqK4z6EZqxVHQf+QPZf9cI//QRV6vaWx8lLcK5Hxt4qk0Mx21pErTyLu3PyoGfTqTXXV5f8Vf8AkNWv/Xv/AOzVlXk4U20dmBpxqVlGaK//AAsLWf7lr/36P+NdL4H8WXGtzyWl7GizKpkV412qVBAIIyecn/Pfy+uu+Fmf+Eilx/z7P/6Glefh605VEmz2sbg6MKLlFWaPVh0oNFBr1j5gY5wpry+++Imovdv9hhgS3z8glQlse+COv6V6fN/qz9K+fz0/KuLF1HTtY9fK6EKzftFex1kfxD1gSKXhtmXIyFQgkfmcV3Vx4ijh8L/235LMnlq4jyM5JAAz9T1rxc16Tf8A/JKk/wCuMX/oxayo1pyUm+iOvHYWlBw5Va7sYh+Iesnolrj/AK5n/GrGnfETUBdKL6CF4GOCIlIb68kj8K4k9KfD99fqKwWJqN7nbLA0LP3T17xt4jbQLSMxRb5pyQhJ+VMYyT69elcZ/wALD1v+7a/9+z/jWr8Xfuad9ZP/AGSvPq2xNacJ2TOPAYSlUoqc1dno3g7xpdapq4sdQjQNMD5bRLjBAJOck9h/nt3orxr4fHHi+xP+/wD+i3r2XtXXhpucLs83MaMaVa0FZWFooorpPOCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACg0UGgBKU0lLQBj+JtDi12x8iRzG6ncjDsfcd65P8A4VzP/wBBFf8Avz/9lXodLXHVwlKtLmktTppYutRXLB6HH+GvBkekXwvJ7jz5FH7vC7QpIIJ688GrPinwpHr0sVwk3kTqNpbbuBX0xkd66fAoxV/VaXs/Z20E8TVdT2l9Tzz/AIVxL/0EV/78/wD2VdH4V8NQ6CkjeYZriX77kYGOwAroKSop4SlSfNFFVMXWqrlk9AoyK8i8R6/qk2tXSrdzQxwytEqxMUGFJHY9e+f6Vn/2vqX/AEEbv/wIauWeaU4y5bM64ZXUnFSuj209aTI6Z5rldA1y7ufCVxfXBR57ZZMHGA21cjP9cYrz+fW9UmkMj39wGYknZIVH4AHArerjYU4qVr3MaOAnVlKN7W0Pav5Vna9pMOs6e1pOWUEhlZeoI715PDreqQuJE1C5JVgQHlZh+IJINd94k1m7tvCVtfW7Kk9wI+QPu7hk4rOGNp1oy5lokVUwNShOKvq3oY//AArmX/oJL/35/wDsqvaJ4ESz1CK6urvzxEd6oqFfnzkHOentXD/2xqf/AEEbz/v+3+NaPhvXtTh1y1Bu55Y5pBE8crFxhiB+BHXP9K4aVfDc6tBnpVaGKVNtzR3ninw1FryI3mmGeIfI4GRjPIIrnf8AhW1x/wBBJf8Av0f/AIqvQ8UV608JSqvmkjxqeMrUlyxehzPhbwlHoUz3Ek3n3DDaGC7QB34+tV/E3gtNXvzeW9z9nkcfvAV3BiAAD1GOlddRVvC03D2dtCFiqqn7S+p53/wref8A6CSf9+f/ALKus8M6DDodkIImLu3zSOf4m/oK2KQ9KmnhaVJ80EVUxdWsuWb0HUma8Xvtf1W7unla9ni3nOyKQqqjsMA/571Ems6mrK39o3eQc8zMf61xvNIJ2szuWU1Gr3R7dSc1yra5d/8ACB/2mSgutn3gvGd+3OPXHPpntjivOzq+ptnOoXZ/7bt/jW9XHQp20vdXOehgKle9nazse3c1jeJtBg16zEUjtHJHkxSD+En1HcV5hYa/qdldxzrezyBT9ySRmU+xGa7j4h6vd6fZQRWUpiNwWDOPvADHQ9utQsXCtTba0RTwdSjVjGL1ezMz/hXE2f8AkJJ/35P/AMVWp4a8GR6TqIvLi4+0SRj93hdoUkEE9TmvPxrGqDpqV5/4EN/jW/4H1zUW12K1nupLiG43AiVi2MKWBBPTp/niuKhVw7qLljrc769HFqm3KaasdT4r8KR65MlxHP8AZ51G0sV3Bh2GMjvWH/wref8A6Caf9+f/ALKvQ6K9WeFpVJOTR5UMZWpxUYswfCvhyLQIXAkM00v33xgcdABW+KSgcVvCEYR5YnPOcpy5pPUWiiirICg0UGgDM1/SINasGtZyQMhlYdVYdDXHf8K2m/6CS/8Afk//ABVeh0Vz1MPTqO8kdNLFVaK5YPQ4rRPAKWOox3V1d+eIiHVVQr84OQc56e1dqBRQKunSjTVomVWtOq7zdxaKKK1Mzj/E3gqPVtS+2W8/kO/+tBXcGIGAevFZH/Ct584/tJP+/P8A9lVPxxrmorr81tDdSQRwYVRExXOQCScHk/59awP7a1P/AKCN5/3/AG/xrw69XDqo04n0VCji/ZJxmkrHrHhvQ4tDsfIjYu74aRz/ABN9O1cxefDlZLt2s70wwE5CMm4r7Zz+Vafw81S71LS5Reyea0DhFc/eIx3Pf611or0IU6VaCbWh5Uq1bD1Za69TzxPhvJvXfqK7c84h5x/31XWPollJoZ0gK/2bbsxu+Yc5zn1zzWvRWlPD06d+VbmdXFVatud7HnR+G8u441Jcf9cT/jViw+HKRXSSXl750S8lFj27vbOeld7S1msHSvexbx1dq3MYfinQIdfsxE7GOWPJjcdifX24rlv+Faz/APQTT/vz/wDZV6LiitJ4enN3aIpYutSjyxZx/hjwXHo2o/bZ7n7RJGCI8Jt2kggnqc8cVL4q8Ixa5cLcRzfZ5wAGYruDKOnGRXU4B/GvN/iLrl/Dqq2NtM8ESKJN0bFWYn1INZVoUqVKzWhvh518RX5oy1sP/wCFby/9BRf+/J/+KrpvCXhyHQIXAcyzSfec8DHYAdq8u/tnU/8AoJXf/f8Af/Gu5+G2rXl+l1bXcxmWDayO+S/Oc5J6jjiubDVKDqJQVmduLpYmNNupK6O4pM14/wCJdd1SfW7tftk8EcUhiRInKKApIHA6k9ST/LFZ39r6p/0Err/v83+Nayx8IytYxp5VOcVLmR7Xd28d3bSwTAmOVSjAHGQRg1wU3w5IkYx6jhM/KGiyQPcgj+Vbeh6zdXHgyXUpijXEETkZHDbRkE4/+tXnE+u6tLKzyaldAk7jtmZRz2ABAH4VOIq0mk5LcWDo14ykqbtZ2Z11t8Oh5ytPqG+MfeVYsE/Qkn+VdTrOg2upaMunMCkcYXyiD90qPl/ya8pg1/VbeZZF1K5+U5CtIzD8QSQa7/xNrV3a+ELe9tisc90EBI/h3KScf0pUalDknZW7l4mliPaR5pXd9DJ/4VtNnH9pj/v1/wDZVe0HwGlhqcV3d3fn+QQyKqFfmByCTk8D0rhP7Z1X/oKXn/f9v8a1PC2vapFrtqr3k0sc0ixOkzFxgkDjng9wf6VjTqYfnXunTVoYv2b5prY9gHSiiivaPnQptL2ryvxzruoDXZrSK6lgit8BRC5QnIBJJB5P+fWsatVUlzM6MPh5YiXJFnqlJ1FeG/2vqf8A0E7v/v8Av/jXpPw61O51HR3F5IZXhk8sOepGARk9+vWsKOLjVlynRiMBUw8OdsyL/wCG/mXUjWl95VuxyqMm4r7ZzzUcfw1YP+81HK5GdsWDjvjmvRRS1o8LSvexCx9dK3MZDaDZHQjpAV1tSuzhju65zn1zz6fhXHn4azA4/tJf+/H/ANlXo9FVOhCaSa2M6WKq0r8r3OAsPhysN1HJd3vnRKcmNYyu72znpXfCloqqdONNWiRWrzrNObuFFFBrQxE7UV5r8R9c1CLVRZW1w9tFGqvmJirMSPUenpXKf2xqf/QTu/8Av83+NcU8XGLcT1aOV1K0FNNanuvGK4fXPh9HfajLdWt55AlJZ1ZN/wAxOSQcjj2o+GusXt9b3dveymUW5Xazkl/mznJPUccVyvifXdUm1y7AvZoY4pWiVYWKKqqSB0PJPUn+mKVarTdNSkr3DDYavCu6cHZo2v8AhWsv/QTX/vwf/iq7HT9DtLLRzpkSlrdkKvknLBhzz2/CvIP7Y1P/AKCV5/3/AG/xr0rQdevJ/BkupXASS5gjkOcYDFRkEgfrU4edJtpLobY2niVGLqSvqYsvw1be5h1EKu47VaPJA7ZORzT7f4akSobjUN8YOWVYgCfxJNcfLr2qSyvI+oXILknAlKj8AMAfQUQa9qkMyyJqNyxXs8jMPxBJFYOpQv8ACdjo4txtzr7j22CJLeCOGIYSNQqj0AFSj9K5DxfrV1a+FLe6tmEc13sVm/uAqWOPQ8Y/+vzXnX9r6n/0Erv/AL/v/jXbPFRhozyKGAnXTkn1Pdea5rxZ4Wh18JL5zQXMY2o/UYznBFcJ4V8QanFrlsjXk06TyLE6zOXGGI5GTwR2x/Kug+JWuX9pJDZ2U5t0dPMZoyQ5OSMZHQcUnXhOnzNaFxwlWjXjCL1ZB/wrOX/oJr/35/8Asq3fCHhSPQJ5Lh5zPcOPLDBdoVOOMZ65HWvM/wC2dU/6CN3/AN/3/wAa6/4bazf3WoT2VzcPPF5RmBkYswYFRwTzgg9Py75xo1KTmuVWO3F0MTGk3Ummj0iigdKK9E+fGsMgivPr74beZeSNaXwit2OVRk3FfbOfyr0OkrOdKNT4jajXqUW3B2POY/hm/mL5mohlyNwEIBx3wc1182hWkmhnSCG+y+WIxg8jByDn1zWvRShRjC9jSpiqtVrnex5u3wzmB41NT/2w/wDsqsad8N44btJL2+86JedipsJ/WvQKKlYamuhbx1dq3MYXi3w7D4gtESRzHLFkxuOQM4yCO4OK5P8A4VrN/wBBNf8Avyf/AIqtX4mavd6da20FnIYftJcPIv3gFA4B7ZzXnn9sap/0E7v/AL/v/jXPWqUlK0ldnoYGniZUr05WR6N4W8Ex6NqP2y4uvtMqDEeE2hcgg9zng4rsRXlnw/1zUX8QRWk91JcRXAYMJmLkEKSCpJ46Y9P0r1Mda6aEoyj7qsefjY1Y1bVXd2FooFFbnEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFBooNABRRRQAUUUUAFFFVrq7gtE33M8cKk4DSOFGfqaTdldjSuWaaelZ/9uaX/ANBKz/7/AK/41bt7mK5jEkEiSxnoyNkH8anmjLRMHFrU8Z13/kM33/XxJ/6Gao16f4i0TQLq/NxqNytrcOoyPOVNwHAbB/LPtWd/wjnhT/oKL/4FpXztbAzc3aSPoqOYQjBJxYeGf+Sf6n/uz/8AoFcFXt9rbW9vbLDAoWJRgAVyV94e8Mfa5TJfpBJuO6P7Sq7T6YPIrpxGEk4R1WiOXDYyMJzk09Wee13vir/kQNM+kP8A6BUtl4d8Mm6iMd+k8gb5Y/tCtu/Dqa6vULS2urN4LlA0LLyDwABRh8LJQkrrVFYrGRqVINLZniNXdE/5Ddj/ANfMf/oQrsf+Ec8Kf9BRP/ApK0fDui6BbX3n6bcLdTqvTzlfaD3wPyz71hSwM1Nao6auYQlBpRZ1Y6UVFcXEVtEZJ5EiQdWdsAfiap/27pX/AEErP/v+v+NfQ8yitT5zlb1Ro0VXtLy3vULWs8cyA4LRuGGfwpl3f2lntN3cxQbs7fMkC5+maOZb3Dld7Fumv0rP/t3Sv+glZ/8Af9f8auxSpPGskTK6MMqynII+tHNGWzHyOOrPCV+9+FFeq6h4I0u9u5LmQSo0hyyo2Bn1xUA8AaQrA5uCPQycfyrwJZdVctz6JZnStaxn/wDNK/8AgP8A7Wrga9yFpB9l+zGNTBs2bMcbemK4x/DvhItzqSDnp9pTit8VhXLls1orHLhcZCHNdPV30OAT76/Wu++Kn+osP96T+S1b0nw/4ai1KGS0vI7mZDuSPz1fPHXA5OOtdJqum2+p2bW15HvjYfiD6j3p0MJL2MoXV2GIx0JVoTSdkeICt7wJ/wAjVY/8D/8AQGrsv+FfaPn791/38H+FaOh+F9P0Wd5rQO0jALukOSB7fWsqWAqwqKTtozWvmNKdOUUnqjdooor3UeAFFFFMAooooADSUppKACimOwjUszcdST2FUf7c0v8A6CVp/wB/0/xpOSjuNRbNKiqVpqdleOUtbuCZhyRHIGI/Kprq6htYjLcSJFGOrOwUD8TS5kw5XexPmisz+3dK/wCgnZ/9/wBf8atWl5b3aF7aeKdQcFo3DAH6ihSi9g5ZLc8j8cf8jXffVf8A0EVinrXrHijR9EvbiKXVp0tZCCFYyqhfH164/rWP/wAI14Tzj+1V/wDApK8Ovg5SqOSa3PoqGYU40oxaeiJPhT/x4Xn/AF2H/oNd0Kz9Gs7WysIobHaYAoKspzu98980641XT7aQxT31tFIOqvKqkfgTXr0YqnTUWzxMRP21Vzity/RWYmuaYzBV1GzZj0AnUk/rWkMVsmnsYOLW4tFFFMQUUUUAFeS/En/kZW/65L/KvWq57xVpmk38Ub6tIkARsLIzqh5H3cn88e1c2JpurDlR2YKsqNVSaPIB0ruvhT/x8ah9I/5tU3/COeEP+gsn/gWldV4c0/T9PsFTSnWSFjnzFcPuPTqOvpXn4bCShUUm1oenjMdCrScIp69zyPXP+Q1f/wDXxJ/6GapV65rHg/TdVvTdTq6SMAG2EAN7njrVP/hXmj/3rn/vsf4USwNRydrF0syoxgk9yj4d/wCScX//AFym/wDQTXnle7QWkFtbJBBGEjQbQvtXHXnhrwqbiTzL9IZNx3ILpV2nPTHata+Gcox12Rz4XGwhObaeruec13/jD/kQ9L/7Zf8Aos1Z07w14V+2xNFfJcSA/LGbhW3fh1NdVqNpaXNjLb3aL9nKndnoB657VOHwsowlG61DE42E6kGk9GeGjpV/w9/yHtP/AOvqP/0IV2X/AAjfhH/oKJ/4FJWn4b0Lw/bX/n6ddJczopwPOV9o6ZwPyz71nTwklNO6OqrmEJU5KzOtFAoFHavaPmxD0rxnxv8A8jXf/Vf/AEEV7Ma5nxRouiX9xFNqs620hBVW81Yy+Pr1x/WuTFUnUhZM78BXjQq3kuh5JXpfwq/5BN1/18f+yiq//CM+Ev8AoKr/AOBSV1+i2lpY6dDBYFTAFBVlIO//AGsjrn1rlwmHlTndtHbjsbCtT5Ip/M0KKoT6vp1tKYp722ilHVHmVWH4E0xNc013VF1C0ZmOAqzKST+depzI8VQlbY0qKbkYrOOu6V/0E7P/AL/r/jUtoSi2adFULfVrC6k8q3vraaTsscqsfyFX6E09gaa3CiiiqEeS/Ev/AJGZv+uS/wAq5avavEHhyw1wR/bFZWQ8PGcNj0z6Vkf8K70b+/df9/B/hXlVsHOU3JdT38NmVKnSjCV7oyvhJjfqWfSP/wBmrjte/wCQ1f8A/XzJ/wChmvYtG0a00a0NvZoQpYsSxyWJ9T+lZ+reD9K1W9a7mWWOVgA3lsAG9zx1rSWHk6SguhjSx0IYiVVp2Z5BivRPDP8AyTa+/wCuU/8A6CavD4d6MRy91n/roP8ACuotbWG1tkggQJEg2hR0xRQw0oNuXYeNzCFeKjFbM8For0e78N+ExdSb9QSGXecp9pVdp7jB5H0p9j4b8KC8iMV+lxIDlYmuVbcfoOTXP9UlfdHf/aVK1+Vlfxx/yI2mf70P/os155Xump2lrd6fLb3iqbdlO4k4AA757Yrj/wDhG/CH/QWj/wDAtK3xOHc2ndHBgsbCnBxae5xXh3nX9O/6+ov/AEMV0nxV/wCQ1bf9cP8A2Y10vhvQvD9rf/aNLukuZ41OAJlk254zgflWl4k0zTNQscas6xRIwIlLhNp+p6U44dqk43CeNg8RGpbRKx4p2rr/AIV/8jHL/wBer/8AoS1qf8I14R/6Cyf+BaV0fhTStJsLaVtHlWcSP88okDnIHTI+uce9TQw0ozTbNcXj4VKLikzfFFA6UV6Z4AdqSjtVCfV9PtZTFcXttDIOqPKqkfhmhtLcaTexforNTXdLdwiajZs7HCqs6ksfpmtKhSTBprcTIpazf7d0k9NSsz/23X/GpbfVdPuZPLtr63mcDO2OQMf0o5kNwkuhxXxc+7p3+9J/7JXnnevctfsLHUdOki1LasA5Z2IGz3yelch/wjHg7/oKp/4FJ/hXn16DnPmTR7eCxsKVJQaehznw/wD+Rvsf+2n/AKLevZM84rmvCmi6JYTTTaPcJcyEBWbzVkKD046Z/pXTV04em6cbM4MdXVerzxXQWiiiug4QooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoNFBoAKKKKACiikoAG6GvMPiXLI+uxx7i0awqQueASTk498CvT68y+JcUi69HKVKxGFQHxwSCeM/jXm5k37HTuehltvb69jk67X4XzP9qu4t5EYRWCZ4z649a4qu1+F8Mn2m8mMZEZQKGxwTn1rxMA5e3R7WPUfYM5nxLK8uuXxd2Yi4cZJ7BiAPwAxWdzWj4jhkh12/WRCpNw7DI6gsSDWfWNZTVSXqdVDk9lH0PQvC91OPA97J5r+ZEsuxsnK4XjHpg158zFmLMSWJySe9eh+F7W4/4Qe8iaFxJKsuxSOXyuB+Zrz2RSpIcYx1HpXbinLkp37HDgkvaVLdxAx7E5r0HxRdTN4GsnMrb5Vi8w55fK5OfXmvPuXOAvzHoB3r0HxTbTr4FsU8ly8Kw+YuOVwuDn6GjC83JUt2FjFFVafqee5rR8OyvFrti8bMhM6KSD2LAEfiDis6tDw7FJNrtgkSFyLiN2A7KGBJ+gFclHm50dtZQ9lK/Y6b4ozN9qtIQx2FSxXPHXGfrXE12/xShk+02c3lnywpUvjgH0zXEVtjnL2rMcv5XQR1Xw1mkXXZY1chGgYlc8EgjGfzNUvHkjv4nulZ8qgRVBPQbQcD8STV/wCGcUh1yWXY3lrEyl8cAkjjP4VQ8eROvie7d0+WUIyEjqNoH8xXRJtYRGELfXX6GDn2r0f4XzSSabdI7NtjlARSeBkZ4rzevSPhdFImm3TyIyrJKCpI68YqMBKXtdS8zUfYOx2lFFFfSs+XMPxu7ReGb1kYoSoGRwcFgCP1ryA816/44jeXwzeJEjO20HCjPAYE/wAq8grwcy/iL0Pocq5fZu/cdDI8M0bxuUdSCGBwQR3zXvArwiCGSeeOOFGd2bAVR1r3da2yu9pXMM15bwt5jqKBRXsHihRRRQAUUUUwCiiigAoooNAHJfE2SSPQEEblA8yq2DjIwTg+3Ary6vUfiXBJNoCmNGby5g7YGcDBB/nXl1eBj21V07H0mV29i7mh4cleHXrAxOyEzopwexYZH0IODXUfFGZhd2kO9thRm254znGfrXL+G4ZJtfsBChcrOjMB2UMCT+Qrp/inFJ9ptJhGfLCFC+OASemami39XnfuVXcXjIW7HEV1vwwlkXXZow7CNrcsU7Egrg/hk1yXauu+GEUh1qWba3lrAVLY4BypAz+BrLCX9qjfG29hIz/HUzyeJ7xHdmVNqqCeg2g8fiawq3fHMMkfii7aRCokKshPcbQOPxFYVZ1uf2kvU2wyh7GHoejfDCeVtKu0kclY5RtB7ZGT+tedSO88rSSsZJJCWZi2ck9STXovwxglTS7p5Y2RJZAyEj7wxivOpopIZWimVo3QkFSMEEdq6cQ37Gn8zjw3L9Yq28hnOMCvY/BkzzeG7GSVmdmQ5LHJ4YivHa9i8FwPB4csopkZJFj+ZWGCPmJrbLebnd+xlm1vZxt3NyiiivbPnQooooAQ15R8SpZX8ReWZGMaxKyqTwM9cCvVzXlXxJt5U8QCZo2ETxKA+OCR1wa8/H/wvmellnL7f3uxytd58KZZCb6IyNtUIyqTwCQQT+grhK734VwOr30xU+WwRVcjgkZz/OvNwX8VHtZjyewdj0EdBmlpPSlr6I+SM3xE7x6HfSROUdLd2VgcEEKcGvEmOSck56817b4jiebQ76KJC7vA6qo6klTgV4mVwSGHI4NePmG6Pfym1pXGqdvK/Ky16F4xuJj4FsWMrFphEJDnl8xknPrzz+FeeojPIqrluwHevQ/GFtOPA2noYm3xeUZFxyuEIOfTniscPfknbsdONt7Wnfued54rS8MzSQ+ILBo2KkzopIPYsAR+IOKza0vDMMk2v2AiRnKzoxAGcAMCT9AK56V+dep2V+VUpX7Ht46UCgdKBX0x8YFeOePJZH8UXYkYsqbUUE9BtBwPxNex14349iki8UXTyKyrIVZSRwRtAyPxFcGP/hr1PVyu3tvkYPNemfC6SR9EuEZjhZiqgnoCoP8AM15pXpnwwikTQ7hnVlEkpZCR1G0DP51xYO/tD08yt7HTueayyPPIzyszO53MzHJJ7kmmg4xg4NOmikgkaKZSjoSHUjkEU3/x5q5pbnoRUeVWPR5Lub/hVwmMztKYgpfJzjzcdfpxXm9elT2c/wDwrDyDC/neWCY8c/63OcfTmvNa6MTzLl9Dgy/ltP8AxMktZJIbmOSJikisCCGwQQeoNe+A8V4HaQvNdRxwo0kjMAqqOte9j7orqwG0jhze3NG3mPFFAor0jxAoxRmigAwKTApaDQA3vWd4jlaLQtQljco8cDsrA4IIU4NaXes3xHE0+hahFEhd3t3VVHViVOBSn8JULc6v3PDjyTmhSVYFTg9Qacw2sQ2AR60KCzhYwSzcADpXzx9v7vKeieOLmb/hCLFvNbdKYw5z975CTn8RmvO69F8cWs7eCLFPJbdC0RkHdQEIOfxOK85rqxad4+h52XcrpP1Zp+GZJYvEGntFIUJnRWwcZBYAj6Y4rovipNJ/aNrCJG8vyt2zPG7JGcetc54Xilm8Q6esSNIVnjc4GcKGBJ+gro/inFKNQtpvLbyfL2b8cbsk4zRTv7CXqTWS+uR9Dia7H4VTONfni3tsa3LFc8Ehhg/hk/nXHV2PwrhkOuTzbW8tYChbHAJZSBn8DWeFT9ojoxyXsJHqdBoFFe4fIkcn3D9K8AmkeSZ3mYs7Eu7E5JPck17/ADfcb6V4DNC8ErwzKUdCQykcgivPx2yPcyjlvO/kR/yHQV6bfXMzfDAS+a/mNCgL555kAPP04+leaYr02/tJ1+F4gMLeckCFo+4AcE/pWOH2n6HZjuVyp/4keZ9KktZHiuYpI3MbqwIZTyD9aiqazgkuLmOKFGkkZgAqjrXKrtnpTUVF3O9+LEsi21jGkjKjs7FQeGI24z+ZrzyvRPivDK1tYSrGxjjZw7DouduM/ka87rpxV/aHn5byqhqdB8PZZE8VWgR2VJBIrAHhhsY4PryAa9jArx34ewyyeKrV1QusYcsQPugowz+ZAr2OuzBv3Dys0t7b3ewUUUV2HlBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABQaKDQAlLSUUAUtX1O10q0a4u2wo6AdWPoK57/AIWDpf8Azxuv++V/xqv8Uf8AjxtP+up/lXngrw8Xj6lGpyRSPYwmBhWp88j13Q/FWn6zcNBbCSOVRuCyADcO+ME9KZ4n1XSrCOJNUiW43HKx7A5GB97B4Hp+NcB4G/5Gmy+r/wDoDVd+JP8AyMKf9cU/m1P69OWGdRpXvYHgoRxKppu1rmp/wk3hf/oE/wDktH/jXTeHdS07ULLdpqiKNGKmILt2/gPzrx49a7L4X/8AIQvP+ua1lhMZOVRRaRri8FCnSc4tmz4h1/Qba+MN9ai6uFABxGj7e+3LY/yazv8AhJ/C3/QJP/gMn+Nchr//ACHb/wD6+JP/AEI1TrKrjpqb0RvRy+EoJ8zPbtPu4L21Se1cPEw4IpkmkadK7SS2FtI7HJZ4lJP4msH4Z/8AIvt/12b+QrrB0r3aElVpqbW54NZOlUlBPYox6Rp8UiyRWFsjryGWJQR+OKdqV3b2FlJcXjKkKj5sj9Ku1yXxL58PIPWdf606zUKcpJBSTqVFBvcof8JN4W/6BP8A5LR/41oaB4g0K4vhBY2gtZpAQCYlTd3xkV5hV7RONcsfaeP/ANCFeFSxsudaI9yrl8IwbTZ6n4i1TT9OtD/aQWWNyAItm4tz6HjjrzXN/wDCU+Ff+gQf/AZP8aq/FD/j/s/+ubfzrjK1xWLnCo42WhlhMDCpTUm2eteFtW0vUY5o9LgFtsbLR7FQnj72B+X4VrXNha3YT7VbxT7Pu+YgbH0zXm/w1+XX2/692/mtepdq9LC1Pb07yR52Lp+xq8sWZ39iaX/0D7T/AL8r/hV6GKOFFSJFRFGAqjAH4U+lrqUIx2RyuTfUKKKKskKz/wCxtN/58LX/AL8L/hV+lqXFPcak1sUYNLsbeQSQ2lvE46MkQUj8RV0YpaShRS2E23uFFFFUAtJRRSAWuc1bxjpul3bW0vnSyqORGoIB9Mk9a6I14jrf/Icv/wDr5k/9CNcONxEqEU4nfgcNHETcZHf/APCw9K/54Xf/AHyv+NdJZ31veWaXVvKGhcZDdse/pXh4Fd74TP8Axb7Uf9yf/wBArlwuNnUk1I68ZgadGKlHvY0pfH+kJI6KtxIFONyKMH3GT0pYPH+kTSrHsuEBIG5kGB9cE15bQK5/7Qq81tDq/suja+p7z8k8XZ42H4EVT/sXS/8AoHWn/fhf8KXw/wD8gSx/694//QRV8V7qSmk2j51txdkVLbT7O1cvbWkMLEYJjjCkj8KkmghuIjFPEsiN1VxuB/A1YpCKvlj2FzNmf/Ymlf8AQNs/+/C/4VYtrS3tY9ltDHEmclUUKM/QVYopcsew+aXcq3NjaXZU3VtDPt+75iBsfTNRf2JpX/QNtP8Avwv+FX6KThF7oLy7kaRLGipGoVVGAAOAKqzaVYXEpkuLK3lc9WeIMf1q9RT5Y9gUmigujaarApp9opHQiFeP0q+oCjApMinZFNRS2E23uFFGRRkUxBRRkUZFABVe6s7e7QJcwRzKDkCRQwB/GrGRRkUmkxrQzf7D0v8A6B1n/wB+F/wq3bwRW8Yjt4ljReiqNoFT5o4oUUgbk+olLSZ5pc0yQrPl0fTpXMktjbSOxyzNEpJPqa0M0nFJpPcpNrYow6Pp8Miyw2VtG69GWJQR+NWnRHRkdQykYIPQipOKOKXKgcpMz/7E0v8A6B9p/wB+V/wqW202ytHL2tpBCxGC0cYUn8qucUUcsV0Dnk+oDpQKKBVCCqt3Y2t5t+1W0U+zO3zEDbc+matUUmk9xptbGb/Yel/9A60/78r/AIVdiiSGMRxqqoowFAwAKlopKKWwOUnuyjc6Vp9xIZJ7K3lkPVniDE/iaYmjaYjq6WFqrKcgiFQQfbitCijkj2Hzy7iAADFUP7E0z/oHWn/fhf8ACtCim0mJSaKVvpVjbSCSCzt4XH8SRKp/MVdHSlpKSilsDbe4ooNFBpiMXX/EljoWz7WXd5DgJGAWA9Tk9Kyf+FjaR/zxu/8Avhf8a5X4lf8AIzvj/nkn8q5evLrYucZuKPoMNl1GpSjOTd2e3aHrVprdsZ7NmwDhlYYZT7itOvPPhJ9/Uv8Atn/7NXodd1Co6kFJnkYqkqNVwjsgoopa2OYzpNI053aSWwtmZiSWaFSSfUnFLFpGnwyLLFY2qOvRlhUEfQ4rQopckexXNLuZ+r3lrYafLNfkCALhgRnd7Y75rjf+Eo8J4/5BP/krH/jWh8Vf+QBAP+nlf/QGry0VwYmu4SskezgMJGtT5pN79D1bw54h8P3V75Gn2y2k7DgmJU3e2RXS3NvBdRNFcxJIjdVcbgfwrxTw3/yMOnf9fMf/AKEK9xUCtcLU9rHVHJj8OsPVSi2UP7D0n/oGWf8A34X/AAqza2lvaR7LWCOFM5KxoFGfoKs0V12Rw8zAUUUUEhVCfSLC4kMlxZW00h6tJErE/iRV+g0WT3Gm1sZyaLpyMGSwtUZeVZYVBB9uKs3U8dtA887hIowWZj0AqfvXO/EL/kUb/wCif+jFqZWhFs0p3qTUW93YwP8AhK/CX/QI/wDJWP8Axq7onifw1JfpHa2YtJX+USGFE/DI9a8wNLHxIpHB3CvLjine1kfRSy6nyvVnv0sMc0bJKiujcFWGQap/2Lpf/QNtP+/Cf4VoAUtepZPc+Z5mipZ2FrZlja2sMG7r5aBc/lVuiiqSS2BtvcKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoNFBoABQaBRQBynxB0u61HToms4/NaBi5QfeIx2Hf6V59/ZGqf8AQNu/+/D/AOFe2UmBXmYjL415czdjvw+PnQjypHmXgXRNQTXIbme2kgit8ljKhQnKlQFB6/59qufEPRb641KK9toHmjZBGRGCzAjPUDsfWvQea5bxV4pXRZUtoYfNuHG4hshQv19SamphKVLD+znLS97mkMVWrV+eC1ta3kee/wBi6p/0Drv/AL8N/hXafDvR7yxae7u4mhWZQqo4Ifg9SO341Q/4WJd/8+EP/fZro/CniVNcSRGTy54uXUcjBPBBrlwlLDqquSV2dWLqYmVJqcUkcP4k8P6nFrVy62c06TSNKskSlxhiTjgcHsQf5Vm/2Pqn/QNvf/Adv8K7XXPHQs9QktLS2EqxkozO2PnBwce1Uf8AhYd1/wA+MX/fZrKpRwvO7ye5rRrYv2a5Yo6XwVptxpWjCC8CiR2MhUHO3IHB9+K6EVj6brdrqGkNqUZZYo1YyAjlcDJ/SuVn+Ic/muIbKMx5O0sxBx7163t6OHglfToeT7CrXqSaWvU9C71z3jjTbjVNDaK0XdIjiQL3YDPA9+a5yD4hzeavnWUYiBG4q5zXW6rr1tp+ipqZJeKVVMYA5bdyP0oWIpV4NJ6W1D2FXDzi2tb6HlP9jar/ANAy7/78v/hWl4a8P6pPrVs7WcsCQyLK0kyMgwrA4GRyfb+lan/Cwrr/AJ8Y/wDvur+h+OTeahHa3dsIhKdiMpz82cAGvJpUcLzq0metWq4t02nFB8QtIvL4wXVrE0yxAoyICW57gDrXF/2Jqn/QNu/+/D/4V6X4s8RrokaokfmTy8oh4GB1JNcz/wALDu/+fKH/AL7rbFQw7qPmk0zLCVMSqSVOKaJfh7ol9b6jLe3UD28axmICVSrMTg8A9uOv/wBevQh0rlvCfipdblktp4hFOo3gLypX6+uag8T+MxpOoCztYBNIn+sLZAXIBAHrx1ruoVKNGldPQ4K0K1es4tanYUtecf8ACxbz/nyh/wC+j/hXXeFtci1yy85F2SJhZF9D7HvWtLF0q0uWD1M6uEq0o801obNFFFdZyicUuapatew6ZYS3c+RHEMnaMk84x+ZrhW+ItyP9XYxlfUvXNWxNOi7TZ0UcNUrK8Eej0V59p/xDeS7jS9tUjhY4Z0OSPwrvxg81VKvCsrwZNbD1KDSmhaKKK3MQorlvFniwaJPHbwRCadhuYNkKFPTn3NYP/Cxrr/nxi/77NcdTGUqcuWT1Oyngq1SPNFaHozd68l8SeH9Th1u5ZbSWeOWVpVeJCwAYn0HB9Qf5V3fhPxJHr9vJmMRTx43oDkYPQg1v/hSqU4YuC10FSqzwdRq2p4l/Y2qf9A28/wC/Lf4V6H4b0K6tvCVxp9wESe5WTAzkLuXAz/8AWzXVY5oqKGBhRd0zSvjp1oqLXmeKT6DqsMrxtp90ShIJWJmH4EAg/hRBoWqzSpGun3Slzjc8LKB9TjivazRWLyyF78zOn+1qtrWRW0qBrXTra3cgtFEiEjoSBirVJSivVSsrHjyd3cKU0Vj+I9dt9EtPOnyzE4RF6samUlBc0ioQc3yxNZiB1NUZda02JykmoWqMOqtMoIryXWtdv9XmZriUrET8sYPCjtx/Wsxj2FeZUzJJ+6j2aeUOSvOVj2v+3NK/6CVn/wB/l/xo/tzSv+glZ/8Af5f8a8SorP8AtN9jT+yI/wAx7b/bmlf9BKz/AO/y/wCNH9uaV/0ErP8A7/L/AI14lRR/ab7B/ZEf5j23+3NK/wCglZ/9/l/xo/tzSv8AoJWf/f5f8a8Soo/tN9g/shfzHtv9uaV/0ErP/v8AL/jR/bmlf9BKz/7/AC/414lRR/ab7B/ZC/mPbf7c0r/oJWf/AH+X/Gj+3NK/6CVn/wB/l/xrxKij+032D+yF/Me2/wBuaV/0ErP/AL/L/jR/bmlf9BKz/wC/y/414lRR/ab7B/ZC/mPbf7c0r/oJWf8A3+X/ABo/t3Sf+glZ/wDf5f8AGvEqKP7TfYP7IX8x7Z/b2kf9BOz/AO/y/wCNH9vaR/0E7P8A7/r/AI14nRR/ab7B/ZC/mPbP7e0j/oJ2f/f9f8aP7f0n/oJ2f/f9f8a8Too/tN9g/shfzHtn9v6T/wBBKz/7/r/jUttq1hdPstry3mb0jkDH9K8Oop/2i+wf2Qv5j33r70teSeGvF95pU6x3Tvc2rcFScsvuM/yr1Oxu4b62Se2cPGwyCK76GIhW23PKxOFnh3aW3cs0UCiuo5QooooAKKKKACiiigAooooAKSlNYPinxDF4ftVdkMk0uRGvY4xnJ7damUlBczLhCVSShFas3aK83/4WTd/8+EP/AH3Wt4X8aDV9Q+xXcAhkcZj2HIJAJIPpxWEcTTm7JnVLA14RcpR0RkfETQtQm1Vb22ge4ikVUIiBZlIHcDt71yv9jar/ANAy8/78P/hXuRAIorGpg1OXNc6KOZ1KUFBJOxxPw00m8sIbu4u4jCJyiqjgh/lzkkHp14/wxXb0AUtddOChHlR59aq6s3N9RKWioLyeO1tpJ5m2xxKXY+gAyatuxklcnorzif4jz+Y3kWMZj3HaWbnHvii2+JM/nKLixQRH7xRiWH0Fc31ul3O7+z69r8p0Pj/TZ9U0IpaLvkhkEuzuwAIwPfmvMf7D1X/oG3v/AH4evWNa8QW+l6MNRIaRZQvlAfxFuR+lcd/wsi8/58IP++zWGIp0nK83ZnXgZ4mEGqcbq5meFvDuqS63ayNaSwRwSJMzTIUGFwcDI6+w/lXrw9a4Xw/49+3ajHaXtqsImIRHQk/MTgA1reL/ABSmgokUcfnXMg3KDwoXOMk1ph/Z04XT0McWq9eqozjZnTCkrzM/Eq8/6B8P/fw10fg/xaNelltp4RDcIN4CnKleO/rk1tHEU5OyZz1MFWpR5pLQ6qiuK8VeN/7J1E2VnbCZ4x+8ZyQATggDjmsj/hZN5/z5Q/8AfZqZYinF2bKhga84qajoemUlY3hnXI9d00XCKUkQ7JEPZsZOD3FbNbxkpK6OSUXCTjLdBWN4u0+bVNBurO2wZZFBUE4BIYHH44xWzRRKPMrBCThJSXQ8LOi6qOumXg/7YN/hVjT/AAzq93dxxLYzxAnJeaNkUAd8kf8A169rxSjiuP6lDueq82qtWshRRWD4t8Rx+H7NZDGZJpMiNOxxjOT+Ncf/AMLLu/8Anwi/77redeEHaTOOlg6taPNBaHp1FcX4T8b/ANr3/wBiurcQSOCYguSDgEkH04FdpWkJqaujGrSnRlyzWoUUUVZkFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFBooNABRRRQAUUUGgAry34l/8jAv/XFP5tXqNcf4x8KTaxcJdWciLKAEZZeF2+oIBOc/59eDHU5VKVoK53YGpGlWUpuyPNOK7T4W/wDH/e/7i1W/4QDVv+etp/323+FdR4M8NvoiyS3Mwe4lGGCn5QAePfNeTg8NVjWTlGyPVxmKozouMZXbPOdc/wCQ3f8A/XxL/wChGqddxr3ge8uNSnuLKeIxTMZCJSQQxOSOAcj0/L3ql/wgOr/89LT/AL7P+FY1cHWc3ZdTehjaMaaTaNPwp/yIGp/Sf/0CuCr13SfD0djocmmvM7iZXEjgAHLDBx/9fNcfL8P9TErCKe3ZBwrMxBI9xg4/OuvF4WrKEFFXstTjwmKpRqTcna7ucjXe+KuPAWm/SD/0CqEPw+1QyKJp7dIz1ZWZiPwwM/nXXaz4fTUPD0WmJKyeSqiNyM8rwM0sLhasYTUla60Hi8XSnODi72ep5Jiruhf8hvT/APr5j/8AQxW7/wAK/wBXBx5tp/323+FXdD8D3ltqkFxfzQrHAwkAiJJLA5A5AwPX/JrkpYStGafL1OqtjqMoNJrYi+KP/H9Zf9c2ri69U8Y+Gn1wRS20ypcRDaA/3SpPPPUGuW/4V/rH/PW0/wC+2/wroxmErSrOUVdGOCxdGFFRlKzQnw2/5GI/9cH/AJrVLxz/AMjTe/VP/QFrr/BnhOfR7l7q9mRpiCirF93acZJOAc/5+lfxX4NutS1N72xmjHmgeYkpIwQABgjPGB/nPG0sNU+rciWtzFYql9ac76WPPDXofws/48rv/rqP5Vi/8K/1j/npZ/8Afw//ABNdn4Q0BtDsSkkm+WUh5MdAfQVOBwtWnV5pqxeOxVKpS5Yu7N8UUUV9AfPmB49/5Fa9+i/+hrXkQr2zXdPXVNNnsnYosoA3DsQQR/KvPT8PtXzxLa/99t/8TXiZhh6lSonBXVj28txNKlBqbtqcqvb6ivek+7Xm1j8PdQNyn224t1hByxjYlsfiMV6SowK1y6jOknzq1zLMq8K0o8jvYcKDRRXqnknlfxL/AORiX/r3T+bVy3avS/GfhOfWbyO7s5UWVVEbLIcLgZOQQCc81gf8K/1f/nraf99t/hXzuKw1WVSUlG6Z9LhcZShRjFys0XfhP/x9ah/ux/8As1eiVzPgnw5JoUUzXMqyTzY3BPuADOMcA55rpa9fCQdOioyR4mMqRqVnKOwtFFGa7DlEooooAKWkpaAGk8V4v4j1aXV9VlndiYgSI17Kvb/69es+IXZNEvnjOHSB2U+hCmvEzycnqa8fMqlrRR7eU003Kb32EooorxT6EKKKKACiiigAooopgFFFFACUUtJTAKSlooAKKKKYBRRRQAUhpaKoBKKKKACuy+GmqyRaodOkOYZgxQdlYDPHpkA1xprS8Mu0fiGwKMVJuEHHoWAI/Kt8PJxqJo5cZTU6Mk+x7cKKBRX0p8aFFFFMAooooAKKKKACiiigAPSvPviz93TvrJ/7LXoFc54y8OnX7OLyZRFPASUz905xkH8utc9eLnTcUdWEqRp1oykeQ1veAf8AkbbH6yf+i2q8fh7q4OPNtP8Av43/AMTW34R8GXGl6qt7fzRFoQfLWEkjJBBySB0B6D/9flUcPUVRNrqfQYnG0ZUZRT1aO6ooor3T5UUUUgpaACsrxT/yL+pf9e0v/oBrVqtqFql9Zz2shISZGjbHXBGKmWxUGlJNng1FdfL8PNVWVhFPatGD8pdmDEe4wf50+D4daoZl8+e2WPPJRixA9gQP514X1Wp2PrPr1BxtzF7xz/yI+l/70P8A6LNefAc9K9g8Q+HV1XQI9PjlMf2faYnbnJAKjP1B7f8A1q4z/hXesf8APa0/77b/AArpxNGc5JpdDiwGKpUoNTdtTC8O/wDIf03/AK+ov/QxXRfFb/kMWn/XD/2Y1b0DwJd2mqQ3N/cRBIHEqiJiSzA5AOQOPX/JrZ8Z+FJNd8u4tZlS4jXaFk+6wznqBkH86cKM1RcbCq4uk8VGaeiR5Seldd8Lf+Rgl/69m/8AQkpP+Feaz/z0s/8Av63/AMTXR+CPCc2i3Ul5eyo0zKYlSM5UKSCTkgHOR/8ArzxFChNTuzbGYyjOi4xlds4vxz/yNd99V/8AQRWHivRPFngm51DVZL2wnj/f8uspIwQAOCAax/8AhXes5x5tn/39b/4moqYeo5NpdTTDY2hClFOXQ3vhR/yCbr/rv/7KK7isDwloZ0HT/s7yGSSRt8hH3Q2Oi98cd+vt0roB0r1aMXGCTPnMVNVKrlHYKKKK2MAoNFBoA88+Lv8Aq9O+sn/slee17D408ONr9rF5U3lTQElMj5WzjIPp061xn/CutZ/56Wf/AH8b/CvKxFCc5tpH0WAxdKnRUZuzKHw+/wCRusv+B/8AoD17LXCeEPBd1peqC91CaNmhB8tYSSDkEEkkDseg/wD190O1deGhKELM83MasKtbmg7qw6iiiuo88KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKDRQaACiiigAooooAbXDeO/EV9p95HZ2LeRtUStKMEnqAORgCu6NeX/ABL/AORiT/rgn82rzswnKFK8XY7sBTjUrKMlcof8JZrv/QQb/vhf8K6/wH4gu9WMttfYd4RuEg4JBPQj+teb12Xwt/5CN7j/AJ5r/OvHwNeq6yTk2mevjqFONJuMUmj0YDiloor6g+aDFFFFADaxPF+rS6Ro5nt0DSM4jBJ+715/StuuU+Jn/IAX/ruv8jXPiJuFNuPY2w8VKok+5xf/AAlmu/8AP+3/AH7X/CtDw74t1X+2LaO7m+0RzusRUqFxuIG4EDt/n1rl6uaF/wAhrT/+vmP/ANCFfM0sTVdRK73Pp6uGpKnJ8q2Pa80UUV9cfJjqKKKBBSUtIaAPJr3xnrE9w8kNx9niJ+WNQCFH1xz71Cni7XVcN9vLYOcFFwf0rEJzScelfIPE1XLdn2EcLRS+BHtPh7UX1TR7e8ljWNpAcgHIyCR/StGsHwH/AMirZfRv/Q2rfr6ui+aEW92j5OtFRqSitkwooorUzCgUUCgBcUUUUCEPNeXeIPF2q/2vcR2k/wBnjhdowqqDnaSMkkdT/n1r1Bq8R1v/AJDWof8AXxL/AOhGvLzKc4QXI7HrZXThUqNTV9C7/wAJdr//AEEG/wC+F/wrvtD8QS3vhmfUp4l8y2V8gHAYqM/hn8a8orvfC4J8Ban/ALs//oFcWCq1JSacm9Dtx9CnGCcUlqc/P4w1xpXdb4orEkKqLge3IJpIfGOuRTK0l4ZApBKNGuCPTgA1g0VyfWKvN8TO9Yajy/Aj3XT7n7XYwXO3b5savtznGRmrFZ/h/wD5Adj/ANe8f/oIrQr6qDvE+QkrNmd4k/5AOo/9e0n/AKCa8UHSva/En/IB1H/r2k/9BNeKDpXiZp8UT3Mp2kFFFFeSe8JRRRQAUUUUAFFFFUAUUUUAFFFFMBKKWkoAKKKKYBRRRQAUUUVQBSYpaKAEq/4d/wCRg07/AK+Y/wD0IVQq/wCHf+Rg07/r6j/9CFaUf4kfUyr/AMKXoe4iigUV9QfEBRRRTAKKMiigAoNFFAGT4l1J9J0S5vY4w7wgbQTxksB/WvMD4w17n/iYNj/cU/0r0P4g/wDIp32PRP8A0Na8gHBrycdOUZpRdtD3sro06kJSmk9TotP8a61BeRPPcfaIgcNGygZH1A4Ndj491+50a0gSzAWS43DzDyUAx0/OvL0/1i/71d58VySmmZ/vSf8AslZ0a03Sld7GuIw9JYmmrKzuc1/wl+vf9BBv+/a/4VveCfFWpXesx2V+/wBoS4zgkBShCk5GByDiuINb3gL/AJG6w+kn/otqxo1qjqLV7nVisNSVGTUVsew0UUV9AfJBxivK/EPjHVhrFzHaTC3ihkMQCgHO0kZJI6n/AD616m1eG69/yG9Q/wCvmT/0I1wY2cowXKz1srpQqVGpq+hf/wCEv1//AKCD/wDftf8ACu/0TxBNeeFpdVmhHmQRuzqpwGKjPpxn8a8kr0Pw3n/hXF/jp5U//oJrkw1apJtN9DszDD0oQi4xS1Oal8Za68rsl4UVjkIqLhfYZB4pYfGeuRTI7XjShTkoyLg+xwAa5+isPbT7nofVaLh8KPWPFPiG4sPDcV9bRgS3WxUBOdhZS2enOMY/ziuC/wCEv1//AKCLf98L/hXS+OM/8IRpf+9D/wCizXn1dWKqyUkl2ODAUKcqbcop6nX+GvF2rNrNtFd3H2mOeRYipULjccZyB2rc8f8AiW80maKzsf3bSpvMvUgc8Afh1rhfDX/Iwaf/ANfMf/oQrovirn+2rXP/AD7/APsxp060/ZN3JqUKf1uEbK1jI/4S/wAQf9BFv+/a/wCFdV8PvEd9qd3NZai4mIQyrIcAjkArgcd8/wCPbzo9K634XZ/4SCXH/Ps3/oS1nhqk5VEmzpx+HpRotxikeqUtAor2T5UKKKKAG1l+J9RfSNFub2NBI8ajap6ZLAA/rWrXPfEP/kU73/tn/wCjFqKjag2jSjFOpGL6s85bxhr5/wCYk+D/ANM1/wAKsab421m3u43uLj7RHnDRsoAb8ccGucpyffX6ivGjVnzbn1zw1Dl+BHv/AFpaBRXunxotFAooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACg0UGgBKWkooAOMU3zBXI/Ey6mg0yCOGRkWZyrgfxDHQ+1ebV5eKzFYefIlc9LDZe68Oe9j3fcuOKxPEfhm11wxvK5imTjzFHJHpXCeAbua38RQQxOVjnDCRB0YBSRkeoPf/GvV/0rWhVjjKbc1pcxrUp4SpaL17nF/wDCu7X/AJ/pv++RW74d0C10SAxwYeRvvyEfMfQfhWxxikBreGFpU3zRRnUxNaqrSldCFgOtG9fWvG/E93Pd63dvcSNJslaJc9FVWIAA7f5PWswnsK82pmyjNx5dj0aeVOcFLmPeaTI9a4/w1qd2/gy6uJJ2eaFZPLdiCRhe+euD6153NM08jyyuzyO2WZzkk+5ravj1SjGVr3RhRwDqylFu1nY90yPWqWsadBqlm9rdIGR/zB9R714vHI8EqyxO0ciHKupwVPsa9p0aV7jSrSaU5eWFHYjjJKgmnhcXHFpxasRicK8I1K9zl/8AhXdr/wA/s/8A3yKt6N4Is9Ov0ujI87R8qJAMBuzfUV1NLW6wlJNNIxeMrSVnIWiikrrOYWm7h60GvJvH91PP4inhlkLRQFVjTsuVBP8A+uubE4j6vHmtc6cNh3iJ8t7HrO4etHUV4MSAMDnNelfDS6nn0yaOeQusThYwf4VxnFcmGx6rz5GrHVicveHhz81xL/wDY3N08sc0kKuc+WoG0fT29qiX4d2YYFruZhnkbRzXbUV0vCUW72OdYyulZSK9jaQ2VslvboEjQYVRVilFFdaVlY5W23diUUUUxBRRRQAtFFFABXI614LsdQvpLpZXty/LrGBgn+9+NdY3Q14v4nuprzXrtp5C5jleNd3RVDEDA7D/APXXn46pCEVzq534GnOpNqDsdd/wruy/6CE3/fC11ljpdpZWP2OCFFgxhlxnfkYOfXNeKYPqK9U+H17Pf6Fvu5GkZJGQFuTgAYye/WubBVqU5uMY2Z1Y6hWpwUpzuihP8PLFpHaO5mRCchAAcD0yeaIPh3ZRzJI91PIqkEoQACPTiu2FFd31Oje9jh+uV7W5iKGNYo1jjQKigBQOABUlLQa6zluZviT/AJAOo/8AXtJ/6Ca8UHSva/En/IB1H/r2k/8AQTXig6V4WafFE93KdpBRRRXknvBRRRQSJRU9lZXF9cLBaxmSRuwr0bw74GtLONJdRUXNxjlW5RT6Y7/jXVQw06z93buctfF06C9569jgNO0i/wBRfFpaySLnBcD5Qfc9BW/afD7UpFDXMkEfPK5ycfyr0uKJII1RFCqowABjA9hUlevTy6CXvani1c0qyfu2Rw6fDi22/NfTAnrhRil/4Vxa/wDP7P8A98iu5orf6nRX2Tl+vV/5jzG7+HuoxlzbzwSqPuqSQx/p+tc9qmiajphP2u1eNBgeYBlc+xHFe3U1kDDDDINY1Mvpy+HQ6aeZ1Yv3rM8EpK9P8SeCLO+VptPUWtyASAvCMfcdvqMe+a851CwudOuDDdxsjjsf6V5NbDTovXY9vD4yGIXu79itRRRXMdgUUUUwCiiimAUUUUAFXvDv/Iwad/18x/8AoQqjV7w7/wAjBp3/AF9R/wDoQrSl/Ej6mVf+HL0PcRRQKK+pPiAppOOppa8h8fXdxceIrmGaQtHDhY17LkAnA/maxr1vYx5rXOnDYf6xPkvY9b3r/eFPBz0r5/A7DpXqHwzu57jRZEmkLrDLsTPULtHH0rnw+M9tLltY6sVlzw0OfmudjRSDpSmu88wrX9nDe2slvcIJI5Rhga40/Dez73tx/wB8iu6paynShN3kjaliKtJfu3Y4vTvh/p9pdxzSzSTqhz5bABSffH8q3fEGiWmuWnkXS4K8o4HKk+la9FKNGCTSWjCVerKSk3qjhP8AhW1p/wA/1x/3yK1PDng6y0W7a6DtcS4wjSKPk9ce59a6ekpRw9OLukXLF1pxcXLQRjjrTd6+teYfEy8uH1sWjSn7PHGrrH/tEdff8a5EnJrlq432cnC2x3UMslWgp81rnv8AnI4rk9a8B2Oo6hJdrNJbmXl1jAwW7nn1rO+FN3O8N7bSSFoYdjID/CW3Zx+Vd7xiuiHJiIKTRxy9phKrjF6nDf8ACtrT/n+uP++RXWWmmWdnp/2CGBBb7ShQjIYHrn1zV6s/XriS00a8ngOJYoHdDjOCFJFXGjCldxRE69Ws1GbuctP8O7BpndLyaNGOQgUHb7ZPNOtvh7p8c6O91PKinJQgYb8RXnDvJNK0kjF5HJLuWznPUk0lvPLbTCSCRo3TlWQ4INeSq1G/wH0H1TEctva/ge2anpFrqOmmyniURYG3Axsx0K+mK5f/AIVzZf8AP/N/3ytS+MtQu4vBtpIkzLJc+WsrDgsChZunTkdvp0rzTqcn8q6sTUpxaTVzhwWHrzi3Cdlc9V0TwRp+mXy3Zme5ePlA4GFbs31rQ8ReHbTXoQLhdsqfdlUfMPavMfCd5PZ+IbMwSMgmlSJwOjKSAQf8+9e0joK1w/s6tNpKxzYtVcPVTcrvucN/wrW1/wCf6f8A74Wtrwz4YtNCMjxEyTSDBkdeQv8AdHtnn3/CugNJW0aEIO6RzVMXWqLlkxw6UUUVsc4UzcPWiT7jfSvBby6mvbmS5upGkmc5Yn/PQdh2rmr1/Y20vc7cJg3ir2drHvO9c9eah1C1gv7OS2uoxJFIMMprwiORo3V1ZlZSGUqcEGvT7vUrxPhuL0TOLpoUHmgfMMuBn64PXr361EMUqid1sjavgJ0HCzvd2Kn/AAriw/6CE4/AVZ0zwDpttdJO9xJchOfLcDaT7+teYZJ5Y4J6k1Z029uLG8S4tZTFKvAYd/Y+o9jXIq9O6909SeFxHK17X8D3gYApu9fWuG+Kd7cQWlrbwyskc5fzApxuAC8H25rzg5J5rrqYrkly2uebhstdeHO5WPoEMD0NOryH4c3dxb+J7eCGRhDcBxInZsIxH4gjr/jXro6VvRq+1jzWsceKwzw1TkbvoOooFFbHMFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFBooNAAKDQKDQBxHxRUmxtWCkqJTk+nFee17VrDWKWEp1RkFrj592f6c5+lcmJfA+eVjx/uy/4V4GOwinV5udK/c9vA4twp8nI36HOeBkLeKbPAyBvJPoNpr1wZ71z3hqTw6biUaGIlk2jeAGBx7bu309s9q0tU1ay0pVa/uFiDnCggkk/QCu3A01QpWck13OPG1JYirdRadti/xilOKwP+Ez0L/n+H/ft//ia0tM1K01ODz7KZZo84yM8H6GuxVqc9IyTZyOlUiryi0jyHXUYa1fhgVP2mRuR2JJqlXsuoaDpmozedd2qSSYxuyQcfgarDwjof/Pgv/fbf414lTK6k5uSaPapZnCEEnFmD4YjY+BL9drbis2Bjr8vGK4CvdUiSONY0QKijAA6AVx17L4K+0yG48lpMncVEhGe+McflW2KwnuRXMlbTUxwuLtKb5W7u+h53XtOgArotkrDDLbxgj0+UVzVnN4K+1R/Z/IWTI2llcDPbOePzrrrieK1head1SNBlmY4xV5fQVHmk5J+hGYV/bOK5WvUmpawP+Ey0LHF8P+/b/wCFWdO8SaVqNx9ns7tZJSCwXaykgemQK9GNek9FI850akdXF2NY0UUVuZifxV5J46Vk8UXvynnYR7jYK9c6Vn6pothqbo97bLMyAhSSQQPwNcWMw7r0+SL6nZg8QsPU55K6seKe9ei/C1W/s66LKVDSjB9eK2f+EQ0P/nwT/vpv8a1bS2isoFht0CRqMKo7CuPCYCdGpzyZ14vHwr0+SKZYFLQOlFeyeOFJUcsiwo0kjKqqMkscACsVvGWhKcG/H/ft/wD4ms51YQ+JpGkac5/CmzezRWLZ+KdGvLhYLe9VpX4VSjLn8xWheX1vY27TXUqxxr1Zj/nmkqsJLmi00J05p2aaZaorA/4TTQf+f4f9+3/+Jq3pmvabqrvHYXIldBll2spx+IFCrU27KSuU6NSOri0jVooHSitTMa3Q14jryMmuX25SrfaXPP8AvEivcKytR8P6XqM/nXdokkpAG8kg4H0NcWMw8q8Uo9DtweJWHnzSV0eM16b8NFZNAO5SuZ2Iz3GBWh/wh+if8+Kf99N/jWxFHHBGqRqFVRgAdAK58Lg50Z8zaOrGY6FeHJFMk5pawZvF+hRSPG9+pZDg7Udh+BAOfwoh8X6HNIscd8oZzgbkdR+ZArv9vTvbmR53sKtr8r+436DSZpTWxiZniT/kA6j/ANe0n/oJrxUdK9q8Sf8AIB1H/r2k/wDQTXio6V4WafHE97KdpBRRRXjnuhU1jay3t1FbwjMkjBQKhr0L4a6P5ML6lKu1pBtiz/d6k/j/AI104ej7aoonJiq/sKbl9x0Hhzw9a6FbBYx5lww/eTEcsf6D2ra7UoFIa+phFQjyxR8jOcpvmk7sO9ArgvG/im7sdQ/s/T28soAZJNuTk8gDPGMf545XwN4qu7+/NjqLiRmUsjgYJI6qccdOc+3vXP8AW6ftPZdTq+pVPZe26HeUUUV1HGFFcX498R3WkzR2ljtR5E3mQjOASRx+VUfBfiy+utUSx1B/OE2dj7QGUgZ7YGMCuV4uCqeze52LB1HS9stj0KsbxFodtrlmYZhtlXJjkHVT/h6j+uDWz2pa6ZRU1Zo5YTlCSlF2aPCL21ms7uS2nULJESpH0qCvRfiRo3nWg1KIfNDxJ6lfX8Pr0rzqvmcRRdGbifX4TEKvTUuvUSiiiuc6wooopgFFFFABV7w7/wAjBp3/AF9R/wDoQqjV7w7/AMjBp3/X1H/6EK0o/wARepjX/hy9D3EUUCivqj4kQ14346Vl8UXm5SM7SM9xtFexnms/U9E07VWRr+2WZ4wQpJII/I1hiKLqw5UdmDxCw9Tmkrqx4hXpfwrGNHuMqVBn49/lFa//AAh2h/8APgn/AH03+Na9pbQ2kCQW6BI0GFUdhXJhsJKlPmkzrxePhXhyRTLA6UGgUGvTPIEpu73pskqwozyEKqjJJOABWE3jXQFOP7QH/fqT/wCJqJTjH4nYuNKc/hTfodBnAozWLZeK9Fvbhbe3vleVjgKUZcn05HWr9/f22n2zXF5KIo16k/8A1qanFq6egOnOLUWmmXKBmue/4TXQP+f8f9+n/wDiau6Xr2m6tI6WFyszIAWG1lIH4ikqsHs0OVGpFXlFo87+JakeJmYjAMSYrl+9e5alpdlq0Kx31usyqcjJIwfwrP8A+EN0H/nwT/vt/wDGvNrYKdSbmnuexh8zhSpqEovQ5r4Tq2dSJBwTEM+43V6DkVXsLC2063FvZxCKIEkKPU1Q1HxPpGm3Jt7y7CSgAlQjMR9cA12UY+xgoyZ5tabxNZzgnqa+RWd4jDHQb8IpZjbSAAd/lNZ//CbeH/8An/H/AH6k/wDia3opYriFZYXWSNxlWU5BHtWqlGaaTMnTnTack16ngmMdsU0ivSLuTwObmbzPKaTzDvKiUjdnnBHH5cU/T5vA6Xkf2byVmz8pYSAZ+p4/OvI+r/3kfSPH6X9nIr+OFb/hCdPG1vlMWeOnyEc/jXnor3qe3iuYWhlQPE4wyt0IrIPg/Qj/AMw9P++m/wAa6q2GdR3izzsHmEKEXGSe55Z4bUv4g04KCSLhDx6ZGa9wHaszTfD+mabMZbK0SGQjG5ck4/E1qVvhqLpRszlx2JWImnFWQtFFFdRwCGlrK1XxDpekyJHfXSxO4yF2sxx6nAOKpf8ACbaB/wBBBf8Av0//AMTWbqwWjZqqNSSvGLZvSEbG+leAMjIWV93oQeCDXvNndwX1slxbSLLDINysvQis+98MaReztPcWSPK5yzZYZP4GsMRSdZJxZ3YHFRwrfOnqeKng4r0nUUb/AIVaq7W3LDEcY5wJFP8AKt2LwhocUiyR2EYdTkHLH+ta0nlRwt5u1YVU7t3QDvn2rKjhpQUrvc1xOYRquHLF6O54HTrdGeZFXczZUBRyTXoZl8A5OVjz/uTf4Vd0KTweb9BpgiF0eEyJB+W7jP61zRw3vfEj0Z5g+V/u5fcZ/wAWo28qwfnapkyew+7ivPv1r3m9s7e/t2guolljYYKt0rK/4Q7Qv+gfH/303+NdFbCucrpnBhcwjRpqEkzzr4fKzeLbHCnAEhPsPLYV7CKoaXolhpRc2FssJfG4gk5/M1oiurD0nThys4sbiFianOlbSwoooorc4wooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKDRRQBxPxS/48LP8A66t/KvPBXpPxJtJ7jS4pIE3iFyz47DHWvN8EdRXymZJ+3Z9PlskqKRueBzjxRZd/vj/xxqufEvP/AAkEfp5A/mar+ArSe48QwTJGfKg3GRuwypA/HNXviVZzDVorry28l4hGGHTdknBrSEZLBN26kzlH66tehx+PSu0+Fv8Ax/3n/XMfzrjdjehrufhjZXCSXF3JGVhkUKjHuQawy6Mvbq5rmEo+wep39FIKWvrT5UzvEJxod/j/AJ95P/QTXi55PPevatahe40q7hjwXlhdFB9SMV4xNDLBK0UsZSRDgqeoNeBmyfMrHu5U0uZMZ0rvvFO7/hBNP/3Yfx+WuEhiknlWKGNpJGOAqjJJr0XxRpl2/g21gjjLy26xl1Xk/KuDj15rnwcZOnPTodGNlFVKevU82q9oR261YFeD9oi5H+8KpYwcENmtTwzZzXet2YgRm8uVJG9AoYZzXFRjP2sbdzurOCpSv2PZKKKK+1PjAooooAKKKKAFooooAwfHP/IrXn0X/wBDWvJMV6/4xt5rvw7dwW675WUFVHfDA/0rx8q4OCCCOtfO5om6it2PocqaVOV+4Ifn+9tINd78UDi3sR2Lv/IVxNhaT3t5Hb26F3c4x/ntXffEuwuJ7G2mgQukBcyY7Agc/pWWHhJ4epZdjXESisRTu+5510rb8C/8jTZe5f8A9AasTDV0Xw/s7ibxHDOsf7q33GRuwypA/HJ6VhhoydaPqdOKcVRlr0PWB0ooHSivrj5AKKKKACszxHn+w78g8/Z5P/QTWnVHWoXudLu4Yhl5IXRR6kqQKia91lQ+K54kabUk0UsMrxyxFHQlSpGCD6Glt4JZ5kijjZndgqhRnNfH8suax9pzR5b3PaNDbdoti2esEf8AIVoGqGjQvBpVpDIMPFCiMPcAA1e7V9hD4UfFz+Jmb4k/5AOo/wDXtJ/6Ca8VHSvavEn/ACAdR/69pP8A0E14rXi5p8cT3Mp2kFFFFeOe6PhiaaVIoxl3YKo9TnAr2/TraO1s4YIl2oigADtXjWif8hmx/wCvmP8A9CFe3J92vcyuKtJngZtN80YjqKKK9k8M4zxj4Ql1e8F5ZSxpLsCur5G7HQ555xx+FL4M8JSaPdtdXbxvLt2qF52+vPrXZUVy/VaftPaW1Or63V9n7K+glFFFdRynK+M/C765JFPbyrHcRjb8+dpXOfwql4Q8GT6ZqP22/kRmRf3aoxOCeCSfp/Ou2OK5bxB4xt7CYWthH9tus4KI3Cn0Pv7VxVKNGM/ay3O2nWryh7GOx1JwB7VRudZ062cpcX1tE69VeVVP5GuQj0bxD4gJfVrprS3b/liuBkcnp6/WtWz8C6REgE8b3D92diM/gDirVWpL4Y2XmQ6NOHxy18h2o+KPD9zaS20t8rJMpjbarHgjHYV5Sa9oXw5o6KANNtSB6wqf6VDdeE9FuR81jFH7xDYf0xXLiMLUrtNtaHZhcXSw7aSep45RXo2qfDu2mZm064aDOMRsNyj1561xus6BqGkSE3cJ8rOBKvIPXHI78dK8yrhalPVrQ9qjjaNbRPUy6KKK5zsCgUUCmgCr3h3/AJGDTv8Ar6j/APQhVGr3h3/kYNO/6+o//QhV0f4i9TGv/Dl6HuIooFFfVHxIUUUUwCjFGaM0AFBozRQBz3j448KXuOpCf+hrXkJr2TxpazXnhy7ht13yMqlV9cMD/SvHCuDghgRwa8bHpuasfRZU0qb9QjO2RSOCGHIrvviw+2HTl9TJ/wCy1xFhaXF7eRW9tEzuzDAHT6n2rv8A4o2FxcWlpPBH5iW5fzCP4Qcc/pWdFS9lL5GmJlH6zS17nm4re8Att8WWXPUSZ/74asHY391q6X4dWU83iOC5VP3VureYx6DKkD8cnpXPQT9pG3c6sXKKoyv2PWqAKKK+lPjxrV4dr/8AyHL75t3+kS/+hGvc2rxPxRZ3Frr16s0RTzJXlQ9irMSDXm49NxVj2cqaVR37GVXo3ht2Pw6vPmO4RTY9vlNed7G/umvTvD2lXieBrmzkTZcTxy7FPH3hxn0/GubBqXNL0O3MpR9nHXqeY0U6SGWKVo5YyjodrAjBB7ilt7ea4nSGGNnkc4VVHWuO0ux6XNHkPbtEbOj2Xc+Qn8hV6qmlRNBptrDIMPHEqtj1A5q3X0kPhR8TJ+8wpaSlqyQoNFFAHjPjv/ka732K/wDoIrDro/iBZXMPia4meMiKfBjbs2FAP5Vz23HrXztWL9pL1Ps8JJOjH0PSvhV/yB7n/rv/AOyiu2xXIfDKynttDd7iMp58nmKD1K4AB/Suvr28Pf2aufLYxp1pNCVznxC48JXvbhP/AEYtdJWD43s5r7w1d29speVgpVR1OGBwPwFVV1hL0M6DSqx9UeN0sRKzoVOCCOBSFGBwRVnTLG4vr2OK2j3yMQceg9T6CvAim3ZH2UpRUXqe7gUtFHevokfDsWiiiqAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoooNAGX4g1m30Wz8+4ycnCoOrH0Fcx/wALEj/6B8n/AH9H+FS/FH/jytP+uh/lXnor53HY2pTq8kdke5gsHSq0ueZ6f4f8X2+r3htmhNvLtygZ9271HQcirHiTxPb6IyRGJp5n52KcYHqTiuC8E/8AI02X1f8A9AarvxI/5GEf9cV/mauONqvC+063sKWDprEqn0tc1f8AhYif9A9/+/o/wrofDXiC31yJjGPKlT70RbJAryI9K7H4X/8AIQvP+ua/zrHCY6rOqoyd0zTF4KlTpOcdza1jxza6ffPaxW7XBThmD4AbuOlUf+FjRf8AQOk/7/D/AArjtc/5DV9/18Sf+hGqNZ1cfWjUaTNaWXUZQTZ7ZpOpW2qWa3Nq4ZG4I7g+hq3jHFct8Mv+Reb/AK7N/Surr6KhP2lNTl1PArw5KkoLowxRRRW5kFFFFAGN4m8QW2h26tKpklflYgcEjuc1z3/Cxo/+ge//AH9H+FVPin/yErP/AK5N/OuKr57F46rTquENEj3sHgaVSkpz6nrXhrxVba7JJCsbQTJzsY5yPUHFQeIvGNvo92LVYTcS4y4D7dmeg6HmuV+G3/Ixt/1xf/2Wqfjn/kabz6p/6AtaPGVPq/tOt7ELBU/rLp9LXOj/AOFjR/8AQPf/AL+j/Cun8P61b63Zi4t8jHDoeqn0rxkivQ/hZ/x43n/XUf8AoNLBYyrUq8k3dFY3B0qVLnhudvRRRXvHhBRRSEgDJoAWsrxDrVvotp58+WZuEQHlz6Vq9q4T4q/6iw/3n/kK5sTUdKk5I6MNTVSrGD2Yz/hYkec/2c//AH9H+Fanhzxdbazfm2aA20u3KAvu3Y6jp1FeXAVueBf+Rssf+B/+gNXiYfG1JVFF9We5iMBRhSlKOjSPX6KKK+kPmwooooAKhnkSCF5pCFRFLMT2Aqas3xF/yAr/AP69pP8A0E1M3aLHFXZy03xFgSaRUsXeNT8r+aBuHrjHFOg+IttJKqy2bxIxwXLg4HrjFeeUV819frH039nUbXPdoJUmhSWJgyOoZSO4PSpaz9A/5Alh/wBe8f8A6CK0O1fSQd4o+ZejaM3xJ/yAdR/69pP/AEE14rXtXiT/AJAOo/8AXtJ/6Ca8Vrxc0+OJ7uU7SFooorxz3SW1mNvdQzqMmKRZB9Qc17jbSCSBHByCM5rwmvS/h1q/2rTjYyNmW2+7nunb8jXq5bVUZuD6ni5rRcoqa6HYjpRSClr6A+eCiiigBKKDXM+PNbfS9M8q2OLi4yiMOq+p+vp71nUmoRcjSnB1JKETJ8Ra1farqZ0fQzjblZZVOMEdRntit/w94cstEiXyl8y4YYaZ/vH2HoPYVH4L0RdJ0xPMU/aZgJJS3UE9vw/nmugA4rClTbftJ7v8DetVSXs6ey/EAMU7isDxT4ki0CGJmiM0kxOxA23p15wfUVW8L+L4dbuXtnt2gkC7ly+4MO/Yc1o68FP2bepkqFRw9rbQ6ig0VDdXEdtA00x2ogyT6VsZJX0JajmiSaJo5VV0YYZWGQR9K4dfiLEbnabEiHON/mfNj1xj9M/jXcQyLNEsifdYAisoVYVb8uptUoVKNudWPPfGXg5LaBr7S0IVMmSEc4Hqv+FcPXvjLuUjsa8n8caD/ZGpGW3Xba3B3Ieyt3X/AArysbhVD95TWnU9rLsZz/uqj16HN0UUV5R7YVe8O/8AIwad/wBfUf8A6EKo1e8O/wDIwad/19R/+hCtKP8AEXqY1/4cvQ9xFFAor6tHxIlcr4j8aW2jXgtUhNzKP9YFfbs9uhya6uvGvHH/ACNN9/vL/wCgiuTF1ZUqd473PQwGHhXq8s9rHT/8LKj/AOgbJ/39H+FdV4e1m31uxW5tyR2dT1VvSvFK9H+Fn/IIuv8Aruf/AEEVyYXFVKs+WR247BUqVPmggvfiJaQ3TxW1o9xGhx5okADfTio4/iTA0gVtPkVc8nzBwPXpXnXYfWlrB42onY645bQtqj3ayuor22Se3YPG4ypqwBx71heBf+RVsf8AcP8A6Ea3hXtQfNFS7o+bqxUZuK6MQCsnxJrttodsJrjLO+RGgOC5HativP8A4tdNO+sn/slZ15OnTcka4amqtVQlsH/CyI/+gdJ/39H+Fa3hrxha61eG1MRt5cZQF92/uew6V5UelbvgP/kbLD/tp/6LavMo4qo5qL6s9vE4ClCm3HdK533ifxZbaDKkTRm4mbkoG27R6k4NYv8AwsqL/oHNj/rqP/iaw/iV/wAjM/8A1yWuXp18XVjUlGOyJwuX0Z0lKau2j2bwz4hg161aWNDFIhw8ZOSvpzjvWTrfju20/UJLSG2a5MXDMH2gN3HQ1mfCb72o/SL/ANmrkNd/5Dl//wBfEv8A6Ea1niZxoxmt2YUcHTliJU3sjs/+FlR/9A1/+/w/+JrstI1K31WxjurV98b/AJg+h968M4r1j4af8iyv/XV/50YXE1Kk7SYswwlOjTUodzqABilwKKK9Q8W5n65qtvo1g11cngcKo6sewFcifiVH/wBAyT/v8P8ACrnxV/5AMH/Xyv8A6C1eZV5eKxE6c7RPbwGDpVqfNNX1PUND8dWup3yWktu1u8nCFnyCew6CuvFeH+HD/wAVBpx/6eo/5ivcBXThKzqxbkcuYYeFColDZoUUUUV2HmiUUUUDEJAGa4e/+I1rb3kkVvaPcRrwJQ+A304rtZhmNvpXgQbPA6CuHF4iVG3Kepl2GhiHLn1seip8SrcyKr2EqqxGW8wHA9cYrq5dXs49J/tJpR9mCB93qDwPxJ4rxCvRL/8A5JUn/XGL/wBGLWdDEznzX6K504vBUqfJyaXdhp+JMQ+7pz/9/h/hVjTfiFaXN4sNzavbI3Hml9wB98CvMzTovvp/vCudYmo2dcsuocuiPafEmvW2hWizXALM5wiA4LGuX/4WXH/0Dn/7+j/CmfFv/V6f/vSfyWvPu1a4jEThOyOXBYKlVpc81dnrXhnxpba5eG1MJt5iMorPu39zjjrjmuqrxn4ff8jdY/8AbT/0W1ey114Wo6kLs4MfQhQq8sNmri0UUV1HAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBzXjbRrjWbBFtCvmQsXCtxu46A9q4ceD9e/58f/Iif/FV3vjHXG0SwEkce6WUlUJ6KcdTXFf8Jzrf9+D/AL9ivBxywvtP3l7+R7WCeJ9n+7tbzNPwh4U1G11mO8v4xbpASQu4MXJBHGDx15z/APqs+OfDd9qN9HeWCiYlRG0W4LjGSDknBH+fozwl4vu77VRZ6gFfzgdjIoG0gEnP4V3RrfD0KFeg4Qva5jiK9ejX552v+B5N/wAIhrv/AD4f+Rk/xrq/Anh670jzri+wkko2iIYOAD1yDj8K67FHNa0ctpUZKauZ1sfVrQ5JWPNdf8H6m2qXEtpELiKZzKrBlUjcSSpBI6f59Bnf8Ihrv/Pgf+/yf/FV63g0tRLK6MpOWupUMyrQioqxieEtJk0TShbTSLI7MZG2jgHA4Hr0rboor0qcFCKiuh585OcnJ9QNFFY/irWP7G0prpYzI5OxB2yfX2onNQi5PZBCLnJRW7NijmvLP+E61n+9D/37q/4f8a3suqQwXqI8UxEY2LgqxIAP0rgjmdGUlHud0svrRi5Poavjzw9d6sIbiyCySQjb5ZwCQfQnj865H/hENc/58v8AyMn/AMVXruKKK2Ap1pucmxUcfVow5Faxw3gXwzf6ZfS3t+BEdpiRMhic45yCcDj/AD3q+MfC2pXutPeWMS3CTAFgWClCABjk85xxj/8AX6Fj86B05rT6lSdL2XQhY2oqvtdLnkf/AAh2v/8APgf+/wBH/wDFV3PgfRbnR9PkW7YebMwdkBzs4xjPeukFFRRwFOjLnjcqvjqtePLKwUleZXvj3UpLp/sapHDn5VdMt+PvUS+OtX3jcYGUHkeXjIqXmdGLaNI5bWavoep0VgjX4z4VGr+U+0ru8vvndjGfrXEN441fBCvEB7x1rUxlOna/UxpYOpVvbo7Hq1ct460O41m0iNoy+ZAWYI3G/OOAe3SuZsPHmoR3cZvQkkOfnVEAOD6fSus8Ya+2iWkRhj3zzkqhP3Vxjk/nUuvSxFGV9luWsPWw9WPfocH/AMIjr3/Ph/5GT/Gtvwd4W1Oz1pL2/jW3SDOF3Bi5YEcYPAGe/wD+rO/4TnWv78H/AH7ra8I+LrvUNWWy1BVczA+WyLjaQCTn8K82hHC+0XK3e56WIli/ZvnStY7mnVxnjbxTcaRcx2lkg80qJGZhkYOeMfhXN/8ACea3/fh/79V6VXH0qUuRnm0sBWqwU47M9Xorl/A/iOXW4ZY7lMTw4JdVwrA5x9DxXT110qqqx54nJUpypScJbi1V1G2+2WNxa79nnRtHuxnGRjNWqrX1ylnaTXMgJWFGkIHUgDNXK1tTNXvoeVS+DNdjlZVs1dRkB1lTB9xkg/mKWLwXrskyq1osYY4LNIhC+5wSfyFW7jx3qxlcw+SiEkqpTOB6ZpLfx5qyzxm48l4wRvVUwcelfOyWFvufTKWMcbJI9J0+3+yWFvblt3kxrHuxjOBjOKs9qr2Vwt3axXCghZUDgHqARkVYNfRQtyqx8073dzN8Sf8AIB1H/r2k/wDQTXite1eJP+QDqP8A17Sf+gmvFa8TNPjie7lO0haKKK8c90Ku6Lqc2lajFdW/JQ/MpOAy9xVKkqoScWpImcVOLi9me2aNq1rq9mtxaPuU9VP3kPow7GtGvEdE1e50a9W5tjkdHQ9HX0r2LS7xb/T4LpQVEyB8HtkV9LhMSq8bdUfKYzCPDy02ZcoooruOESvPdU/4m/xAt7UsGigI4I/ujcR+Yr0KvN9C/wCSj3H/AF1m/wDZq4sS7uMejZ24TTnkt0j0cAAYFLRRXYcZyfjvw9c6xBDJZlTNBu+Q8bwcdD0zx3/P1oeCPCd5YX32/UcRugYJGCCcnjJxkYx6Gu8ormlhoSqe0e50rFVFS9lfQSqmq2SahYTWkpISZdpI61borpaurHMnZ3PKR4D1j7d5JEPlA8T7+MfTrn8K9RtovIt44s52KFz64FS0tYUaEaN+Xqb1sTUr25+g0Vz3jqyW88PXDYG6AeaCewHJ/QV0RrK8U/8AIuaj/wBe0n/oJq6sVKm0yKEnGomu54vRRRXyh9uFXfDv/Iwad/18x/8AoQqlV3w7/wAjBp3/AF8x/wDoQrSj/EXqY1/4cvQ9xFFAor6s+JCvN/GXhPUrrWZLywjFxHPyRkKUIAGOTzntj/8AX6RQayrUY1o8sjehXlQlzwPHf+EO17/oHn/v9H/jXe+BtEuNH0pkuyPNmfzSg52ZAGM9zxzXR/hS1jSwlOk+aNzor46rXjyySPIr3wRrUN48dvbi4iH3ZQ6qGH0JyD6/160yPwZrzOqtZ7FYgZMyYHucMT+lewUVm8DTbvqarNKyVtDO8P6c2laPb2byCRolwWAxk5J/rWjWdr2pLpGlz3zoZFiXO0dSSQB/OvNz471snhrcf9s63qV4ULRZz0sNVxN5o9ZrlPH2gXOtWsElkymS3LHy2ON+cdD0B471zOnePdSW8j+3iOWBjtZUQK31BrrPGviGTQbKPyI909xuCE/dXGMk/nWcq1OtTfbqaLD1sPWjbd7HBf8ACGa//wA+H/kZP8a3fBnhPUbHWEvb+NbdbcHYu4MXLAjsTgDP/wBb0y/+E91rr5lv/wB+xW54P8YXepasLLUEVjKD5bxjGCAScj3AripfV/aLlueliZYz2b57Wt0Dx34Xv9R1AX9gBNuUI0eQpXHfJODXM/8ACG6//wBA8/8Af6P/AOKr2IdKWuyeDpzk5NnnUsxrUYKCS0OR8AeH7zRre4lv9qSXG0eUCDtxnqRxznt/9Yc14g8Gaw+sXM1lALmGd2lDh1UjcSSpBPb/AD6V6liirlhacoKHRGUMbVhVdVWuzx//AIQnX/8AoHt/3+j/AMa9H8IaTJo2kR2kzh3yWYgYAJ7e/wBa2aWnSw0KTvEdfG1MRHlnYUUUUV0nEc5410ebWtJMFswEsbiRQ3RsAjGe2c/5615//wAIX4g/6B5/7/R/417FSVzVcNGq7s7qGOqYePLCx5h4c8G6tHrFtPewrbQwSCUkurFiDwoAP8//AK1enj0oxTq1pUY0laJhiMROvLmkFFFFanOJRzXn/i/xheWGrNZ2Coiw8O0gB3EgHj0xWL/wnut/89bf/v2K5Z4uEXZno08urTipq2p6w4ypA715Jd+B9agunSC2FxGD8siOqhh9CQQfX+vWu/8ABuuNrml+dKmyaJvLkHYnHUVvg0504V4pkU61XBzcVueOp4K19mQGy2g8FmmTA9zgk/pXeXOgSzeDf7FWdROIlUOQdpZWDfXBx1/HHaulpOamnho000uo62Oq1mm7aO546fBXiDP/AB4Z/wC20f8A8VVjTvA2tTXcaXMC20WctI0itgfQHk/5zXreKKhYOF73NZZpWatocn4/8P3Wt2kBsmUy25ZhG3G/OOh6A8Vw3/CE+If+gef+/wBH/wDFV6D428RSaBZxC3j33FxuCE9FxjJP51xP/Ce67/z0t/8Av2KyxPseb327nTgpYv2X7u1vM1PBPhHVLHWUv7+NbdIA21dwYuSpXsTgDOf88ejCuB8HeMrzU9XWx1BFYzA+WyKF2kAk5HuBXfV14bk5PcODHOr7X97vboLRRRXQcQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAHE/FH/jxtf8Arqf5V55XsXiTRItbsvIkdo2U7kYdj7jvXKf8K7m/6CS/9+j/APFV87j8HWqVXOC0PdwWLpU6XJNmF4HGfFFkPd//AEBq9dArk/Dfg1NK1AXc9x9odB+7AXaFJ6nrzXWd69DL6M6FLlmrO5w4+rCtVTjskLRQaK9I4BaSiigBaKKDSAK5P4m/8i8P+uy/yNdXWdrulQ6zp7Ws5IBIZSOoI6GsMRB1KUoLqjahJQqxk+jPFzV3Q/8AkM2P/XxH/wChCup/4V3N/wBBFP8Av0f8avaH4GSy1CK5urvzxEd6qqFfnB4Oc9PavnKWCrKauup9BWx9FwaTO17Uoo7UCvqj5kKKKKACkNLSGgDwfsaaK768+Hwe5drW88qFjlUZS232zmok+Hb7vm1D5c84j5x+dfKyy+vzbH1McfQ5dyf/AJpd/wAB/wDa1cBXsf8AYVmNE/skK32bbt+983XOc+uefSuSPw7mzxqKkf8AXH/69dmLwlWpy8ivZHHhMXTg5cztd3OJj++v1rvfikMQWP8AvP8AyWlsfh8IrqOS6vPNiU5ZFTbu/HNdH4l0KHXbMRSMY5EJaNx/Cfcd6dDCVY0ZxkrN2sGIxtKVeEou6Vzx7mtvwN/yNVl/wP8A9ANbn/CuZ/8AoIp/35/+yrU8N+C00jUPtlxP9okQYjwu0LnqepzWFDA1lUUpK1mdFfHUJUpRi73RznxL/wCRiX/r3T+bVy3avVfFPhSLXJY7hJ/s86jYWK7gV7DGR3rC/wCFcS/9BJf+/J/+KqsVg6s60pRV0ThMdRhRUZPVB8Kf+Pi/+kf/ALNXodYHhXw4mgwPmTzZpT8744x2Are4r2MLTdKkoyPGxdRVarnEWszxF/yAtQ/69pf/AEE1pVFcQJcQSQyjKSKUYeoPWuiesWjmi7STPCjSV3c/w6PmN5N/tTPyq0WSB7nI/lRB8OXEqGbUN0YOWVY8E/jmvmfqFa9rH1SzGhy3udd4f/5Adj/17x/+gitKoLeBbe3SGIbUjAVR1wBU4r6eCtFHy0neTZneJP8AkA6h/wBe0n/oJrxQ9a9r8Sf8gHUP+vaT/wBBNeKHrXiZp8SPcynaQtFFFeOe6FFFFADkVpHVUXcxIAAr221jh0/T4otwWKCMJuY44HFeJ208trcRzwHbJEwZTjOMHIq9q+t32rOftUxKY4iThBznp3+p5ruwmJWHTdrtnm4zCzxM1rZI7XXPHlvaS+VpqLdEffcnCjrwPX69Kbp/xEs5HVLy2khJ6uDuA/DrXndNp/2hW5r3+QLLKHLZ/eesf8JtobcfaWx7xt/hXLNq1oPHceoWsqm3kKqzH5QMjaTzXI0U5Y6pUacktGEMup0r8r3Vj3wUVzfgjW01bS0jkcG6gGyQc5IHAbnrn+ea6Svoac1UipI+aqQlTm4S6C0UUVZmJRRRQAUUUUAGK53x9fC08OXChlD3A8pQepB64/CugbjvgV5J421w6vqrJC2ba3+VMHhj3b/PauTF1lSp+bO3A4d1qq7LVnP0UUV82fXhV7w9/wAh/Tv+vmP/ANCFUav+Hv8AkP6d/wBfUf8A6EK0o/xF6mNf+HL0PbxRQKK+rPiQooopgFFFFABRRRQBz3xA/wCRTvfon/oa15B0r3LVrCHVNPls7gExSjBwcEYOQfzFcOfhvLnjUlx/1x/+yrycbQnUmpQXQ9vLsVTo03Gb6nDp99fqK734rDEWn/WT/wBlqTT/AIdpFcpJd3pmiU5Mapt3e3XpXQ+KPD8Gv2iRyO0UsRLRuOxPXI79Kmlh6kaUo21ZVfGUpV4TWy3PHBn3rd8Bf8jbY/WT/wBFtW5/wraXOP7TX/vyf/iq1/DHgtNF1D7XPcfaJEGI8KV28EHuc8cVjSw1VTUmtmdWJx9CdKUYvdHX0UCivePmAooooAKKKKACiiigAooooAKKKKACg0UUAeMeOP8Aka77/eX/ANBFYYJ9a9R8TeCE1fUjeW9z9meQfvMruDHsRyMVl/8ACtZc4/tJf+/J/wDiq8Srhqkpt26n0+Hx9CNKMZOzSL/wo/5BN3/18f8Asortqx/DWiwaHp628LF2Y7pJCPvN61s16tKLhBJngYmoqlWU47MSilpK1OcWiig0AeffFrpp31k/9krz3Fe0eKfD0HiG0SOR2iliJMbjnGeuR3HFcn/wrSb/AKCSf9+f/sq8vEYec6jcUfQYHG0qdFQm7NGF8P8A/kb7H6Sf+i3r2IVyPhfwVHouofbJ7j7RIgIjwu0LkEEnk54OP8iuvFdWFpypwtLuedj60a1Xmg7q1haKKK6zgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAAUUCigAooooA5T4g6lc6fp0K2khjaZyhcdQMdvSvPv7W1P/AKCF3/3/AG/xrtvil/x42f8A11b+Vee18rmVWarWTPo8uowlRu0dV4I1m/OuxW09zLPFOCGErFsYUsMEng/59KufELV7yDUIrK3neCNYxLmIlWJORyR246f/AFqxPBH/ACNVn9X/APQGq58R/wDkYF/64L/M1UKtT6o5Xe9hOjT+uJW6GF/a2pf9BG7/AO/7f412vw71i8vDPa3cplWIBlZslue2e4rga7H4Xf8AIRvf+ua/zNZYCrN10m2bY+lCNFtI9Fooor60+XKmr3LWmmXVwgBaKJ5BnpkDNeQya5qcsryNfTgscnbIyj8ADgV6x4k/5AN//wBe0n/oJrxmvAzacouKTPbyunCfM5Ivxa3qUMqSLf3LFTkbnLD8QTzXe+ItZvIPCdtfW5WOa5WPcQudm4ZOP/r5rzOu98T/APIh6f8A7sP/AKBXLhKtR056vY3xlKCnTsupxv8AbGpH/mJXI/7bn/GtLw3rmpwa5aq13PMk0ixFZmLjaxAPXofQ/wBKwau6F/yHbD/r5j/9DFcdGrUVRas7a1Kn7OXurY9r7UopKWvtD5AK8v8AHOsX669JbQXEkEUAAURsVzlQSTg8nn/PNeoV5D46/wCRrvPqn/oC15eZzlCknHuellsIyqtSXQz/AO1tS/6CN5/3/b/GvQvh5ql1qOnSi8k8wwuEVj94jGeT3rzAjivQ/hZ/x43n/XUf+g15uXVZusk2ejmFKEaN0jt6KUUV9OfOGR4qvZdO0K5ubcgSoo2EjIBLAZ/WvKP7X1M7t2oXg/7asP616f48/wCRWvfov/oa15LXz2aVJRqJLax72WU4TpttdTSsPEGp2d1HMl7PKVP3ZZGdSPoTXsinI614QOo+te7p92t8pnKUZXMc1pwhKPKh9FAor2TxxMCloooAbxXknibXdSl1y5CXksSRSmNVicoAqkjseSe5P8uK9cavEtb/AOQ5f/8AXzL/AOhGvJzOpKMFbuetldOM6juugf2vqX/QQu/+/wC3+Nem+CNUudU0VZbtg0iuU3AYyAByfevJa9P+GZx4ff8A67t/IVyZdUlKrr2OvMqUIUk0tbnWYooHSivoT54KKKDQBm+JP+QDqH/XtJ/6Ca8UPWva/En/ACAdQ/69pP8A0E14qeteHmnxI97KdpBRRRXjHuhRRRQAUUUUAFJS0VQCUGiigCzpt/cabdrc2rmORR1/vexr1Hwz4pttZiSNiIbsD5oj0Puvt7df515LTlkeNw8bFWXkEHBrrw+KnQfddjhxWDhiFfZ9z3qivK9J8dalYqqXIS7jHdvlb/vocfpXTWfxB0ybYLiOeBj1JUMo/Ec/pXuU8bSnu7ep4FXAVqb2uvI66iuf/wCE00D/AJ/x/wB+n/8Aiajm8c6FHGzpdGUr/CkbZP5gD9a2+sUv5kYfV6v8r+46TNB4GTXEv8RrHz1VLK58s/eYlQwPsM4P5102marZ6tAZLOdJRj5gOo+o7Uo16ctIu7CeHqQV5qyOC8aeLjel7DTSUtxkSP0L+w9B/OuP96t6xbNZ6ndQk5MchUEd+aqV85XqznP3z6zC0YUqaUAooorE6Qq/4e/5D+nf9fUf/oQqhV/w9/yH9O/6+Y//AEIVrR/iL1Ma/wDDl6Ht4ooFFfVnxIV5X441y/OvT20VxLBFb4AETlc5AJJweT/n1r1SvGvG/wDyNN99V/8AQRXBmE3Gmmu56mWQjKq+ZdCj/a+p/wDQRvP+/wA3+Nej/DzVLrUNGlN2/mtBL5SsepAAPJ79eteWV6P8Lf8AkC3f/Xc/+giuHBTk56s9HMaUI0bxXU4q88RatdXLzPfTx7znZDIyKPQAA/571Gms6qjq66hd/KQRmViOPYnBqgv3fxp1ccqs+bc9GNCkoq0UepS65eL4D/tQFVuynB28Al9uceuOfTPtxXnJ1bVGzjULs/8Abdv8a7Wf/klQ/wBxf/Rorz49K7MTVkuWz6HnYGlT9+66tGnp+v6raXkcqX08gU8rI7MpHcYJrt/iLq95p9pbxWkvlG4LbmHDYGOAe3WvNo/9Yv1Fd38WM7NNz6yf+y06FSfsp69gxNGCxFNcq1ucb/a+p/8AQRu/+/710XgLXNRbXo7Sa5luIbgMGErFiCFJBBJ46f54xyVbvgD/AJG2x/7af+i2rChOXtY69ToxdGmqMtFsexDpRSUtfSHyQhrx/wASa7qcutXgF5NAsUrRIsLlAApIHAPJPc/0r1814dr/APyHdQ/6+Zf/AEI152PlKMU4nrZVCM6jUl0D+19U/wCgld/9/m/xr0bQdcvJ/B0+oz7JJ4I5GBxgPtGQSAe/4V5ZXofhv/knN9/1yn/ka5MJVm3LXod2YUYRhFpdTi5dc1WWR5H1G6BckkLMyjJ9ADgfQUW+t6tBMsq6hcMV6B5WYH6gkg1QormdWbe53eyp2tyo920ydrnT7eeQANLGrsB0yRmrVZ+gf8gay/64R/8AoIrQr6OOx8dLRhXA/EjW7+0mhsrSY28bp5jMmQ5OTxu7Diu+rzD4qf8AIZtf+uB/ma58W2qTaO3ARjOulJXOa/tjU/8AoI3f/gQ9df8ADbWr+41Cayurh7iPyjKDISzAgqOCecHPT8u+eDFdb8L8/wDCRy4/59W/9CSvLw1STqrU93HUYKg2kj1MDig9KXNFe8fKEchwhx6V4reeINVvLt7h72eLec7IpCgHsAD2/wD1817TN9w/Q14H3Nebjpyio2Z7WVU4ScuZF6PW9Vjfcuo3W5SCN0pI/I8GvYPDd3Jf6JZ3U5HmSxhmwMDNeIGvZvBf/Isaf/1yH86zwU5Sm02a5rThGnFxXU3KKKK9Y8AMUYoooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKSlpKAKmo2FvqNq9vdoJEYfl7j3rE/4QXRuyTf9/DXS0D6VjOhTqO84ps0hXnTVotoyNH8Oado8zy2kZ8xht3OSxA9vTNM8R6fpN3Ajau0cSq2FkdwnJHTJ/l7VtYrzP4kSOdcjiLsUWFSFzwCSc4HviuPFOGGov3U12OnDKdesryafc1jonhDtfQ/+BQ/xrotAstOtbJRpZjaFiTvQht/Pdh1rx2u1+F8kn2u7i3t5YQNtzxnOM49a8/B4uEqqioJX6noYvCzhScnNu3c9Cooor6I8IQgEYNc3P4L0aWZpGiZGck4VsAfhXS0VlUpU6nxq5cKk6fwOxzcHgnRoplkWJ2KkHDNkHHrW3d2kF1avb3MavEwwVPSrNFKFGnBNRilccqtSbTk27HM/wDCC6N2jlH/AG0NWtL8K6Xpl0Lm3iJkAIBc7sfStvijrURw1KLuoouWIqyVnJ2Irm5htIjLcSpEg6s7BQPxNVP7f0j/AKCVn/3/AF/xrjfijNJ9qtIg7eWULFc8Z9a4mvOxOYujUcEtjvw+XqtTU3Lc9xs722vYy9pPHMoOCY2DDP1FZ2teGtO1iVJrqM+YgxuQ4JHv61xXw1kkGuSRByEeEkrngkEdfzNem4rtoVFiqV5x+RyV6csLV5Ys5j/hBNG/uTf9/DW5pthb6bapb2qBEQfn7n1NXKbgVvCjTpu8UkZTrTqK0myncazp1tKYrm9t4ZB1WSVVP6mo11/SnYKuo2jEnAAnU143JJJM7vK5kdiSzMcknuSaaOOleM81d9Ej2FlUbayPc5okniZJVDxsMEHkEVxr6H4PL838QOen2ocfrQLib/hWO/zH3+Vt3ZOcebjH0xx9K89/nV4zFQjytxTuuplhMLOXNaTVnbQ9L0nRfDCX0b2dzFcTrkonnB+QOuPauuHFeEwO8UkckTFJEIK4bGMdwa91XoK6MvrxqxfLFKxhj6EqLXNJu/cdRRRXpnmle8vLeyjEl1NHChOMyOFGfqap/wDCQaT/ANBKz/7/AK/41wnxLlkOuxxF2KLCGVc8AknPHvgVyleNiMzdOo4JbHs4fLFWpqblue5211BdRCW3mSWM9GRgwP4iud17SvDlzemXU7iK2uHUEgyhN45GSD1+vtWP8LZnLX0W4+WNjBc8AnIP8q5TxFI82uXrSOWYTuuSewYgD8AMVVbFr2EajinfoyKGEkq7gpWt1R2J0Lwdj/kIQn/t7H+NdjawwW9ukVugSJB8oXpivDsV6F4Wu5/+EFvZTK/mRJMEbJyuF4x6YNRg8VCU2lFLToXjMLOEE5Tb1Onl1zTI5Gjl1C1jdCQytKoIPuKIdc0uaRY4dRtpHY4VVlUkn2FeLb85zn165zQOPmU81H9qSvblNP7Jja/Me90Vn6K7PpNm7lmZ4YySepJUZJrQ7V7id1c8NqzsZviT/kA6h/17Sf8AoJrxY9a9p8Sf8gHUP+vaT/0E14seteHmr95Hu5TtISiiivFPdCiiiqAKKKKACilpKoApKWigBKDz1oooAKKKKACiiigAqa0u57OZZbaV43XupxUNFVGTi7oTipKzJb67lvrp7ifmSQ8moelLRSbu7saVlZCUUUUxhV/w9/yMGnf9fEf/AKEKoVf8Pf8AIf07/r5j/wDQhW1H+IvUxr/w5eh7eKKBRX1Z8SFYuueGtN1iVJryImRBjcpwSPetmiplBTVpLQqM5Qd4vU5b/hAtE/uTf9/DW7p1hb6bapbWkYSJBgAd/f3NXKY3TmojSpw1ii5Vqk9JNs5DVtE8LtfSPeXENvOSC8fnhNpxnO3tnrUMOg+EfOj2XcEjbhtT7UDuPYYzz9K87lleaZ5JHLu53MSc5PcmkHGCDyK8Z4qDfwI+gjganKv3jPdGt4mtjA0aGJl27McY9MVz7eAtFbOY5s/9dTV3wXK8/hqykmZndkOSxyT8xArbr2VThUim0eDzzoycYvqc7Y+DNIsbqO4ihdpI+V3tuAPritXU9NtdUtWt7yIPG35g+o9DV3ijA9KqNKMU0loTKrOUlJt3Ry//AAgOh/8APOb/AL+GtLRvDem6PK8tnE3mOMbnOSB6CtfmkpKjCOqQ5YipNWk2QXl7bWUYe7nigUnAMjhQT9TVP/hIdH/6Cdn/AN/1/wAa89+JU0j+IBGzkokS7VJ4GeuK5avPrY505uCWx6lDK1Vpqblue7293b3UKy20ySxt0dG3A/iK5zxDo/hybUDNqU8NvO6AlTMI9w5+Yg9fTPtWR8KpGI1CMsfLQxsqE8Andn88CuT8QyyTa7fNIWb9+6gk9AGIA/KnVxMXSUpRvcihhGq7pxk1bqjsv7D8Gf8AP9D/AOBa12dtbQwWywxRqsQGAoHGK8Kr1b4dySSeGIjKzMyuyjJzgDoKMJWU5NKKQ8fhp0oKUpt6iz+BtGlleUwupc5wrEAewHpS2vgfRbedZlgZ2XoHbcv5V0tLXd7Gn2R5/wBYq2tzMaihFAUAAdAKdRRWxzhWfrOjWesQeVex71ByCOo+hrQoqZRUlZjjJxd4nK/8K/0T+5N/38Na2iaDYaKki2EO0yNuZmOWP41qUnFRGlCOqRrKtUmrSbKt5qVnYlReXMVvvztMjhc49M1W/wCEi0fP/IUs/wDv+v8AjXmPjyWR/FF2ruWCFVUHsNoP9awa4KmOcZuKjserRytVKam5bnvUc0c8SyRMro4BDKcgg+9YV/4L0e9upLiSBleTltjbQT64FZ3wvlkk0WZHYlI7ghQf4RgHA/E12ldkOWtHmaPMnz4aq4xexy8fgTREdW8mRtpBwzkg49q6OCJIUVI1CqowAO1S0laRpxj8JnOtUqfG2x1FAorQzCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACvMfiTBINbimZSsbwhQ3YkE8frXp1Vrm1t7tNlzDHMucgSKGGfoa5MXhvrEOS9jow9b2E+e1zxGu0+F8MonupyhERXaG7E12X9i6Z/0D7X/AL8L/hVqCCK3QRwRpEg6IgAA/AV52Fyz2FRTbvY7sRmPtoOCjuT0UDpQa9s8kSio5ZFjQu5AAGSTwAK5mfx7pMUrR7LmQKcbkQYP0yRWVStTp/G7GkKU6nwK51P1pa5SLx9pMkioUuI1JxuZRgfXBNb15qVrZ2TXdxMohAB3DnOemKUK1OabjJOw5UakGlJPUunFJxXKf8J/pf8Azxuf++V/xq3pfjHTNRuhbR+ZFI33fMAAb2GCazji6MnyqSuU8NVSu4s574o28vn2twEJiVSpb0JriK9znhiuYjHPEkqHqrrkH8Kq/wBiab/0D7X/AL8rXDictdao5qVj0MPmPsaapuOxwPw0hkbW5ZlVvLSIqW7Akjj9K9OFVrW0gtF2W0KRJnJVFCjP0FZeueKrDR51gm3ySkZKxgEr6Zz0rrowjhKVps4683i6t4I3aO3Ncn/wsDS/+eNz/wB8r/jW9pGqWurWi3Fm+5T1B6qfQjsa2jXp1NISTZlOhUpq842R4xNE8ErxTL5ciMVZT2plei6t4k8OC+kWeyF3IvymUQo4OPcnPFV08S+Gd67dMCtkc/Zk49+tfPPCU+Z++j3oYyryr92yc2dx/wAK08jyj5vl7tnfHmZ/lzXnXSvbBf2v2EXgnT7Nt3eZnjFcg/ifwtu/5BRPv9mTn9a7MXhYS5bzS06nLhcTOLlaLd3fQ4e3he4uI4YlLyOwCqO5r3IdBiuO0jxL4bfUIlt7MWsrnCytAqAZH94dM9K6PVtVtdKtTPeSbV7D+Jj6AVvgacKEJS5kznx1SpXnFOLRfzRmuS/4WFpX/PG6/wC+V/xrR0PxVp2s3DQW5kjlAyFkABb1xg12wxNKbspI45YarBXcWcd8S4pF1yKZlIieEKH7EgnI/WuUr3K7tILpQtxDHMoOQJEDAH8arf2Lpn/QPtP+/K/4V5tfLJVajnzbnpUMz9lTUHHY4/4XQS/6dNsxGxRVb1IyT/OuW8RQvBr1+kqbGMzsAfQkkH8jXsdvbQ28YjgjSNB0VBgD8K5jXvEWgWt+YL22W7lUYJESvt9smqr4SMaChOVrdRUMXJ13OMb36HmdeieFbG4/4Qi8jMR8yZZTGv8AeyuB+Zqv/wAJP4W/6BP/AJLJ/jXZafd297apPZyLJE3Qr/KoweGpxm7ST0KxuJqTgk4NaniRXaSCMEcGhVZ3VV+Zm4AFe0SaTpzuzy2VuzMclmiUkn1JxSxaTp8civFZW8bLyGSJQQfY1P8AZTvfmNP7WVrco7RkeLS7SOVdrpCisPQhRkVepFGBS17iVkkeG3d3M3xJ/wAgHUP+vaT/ANBNeLHrXt+sQtdaXd26felhdB9SCK8RPU14earWLPdyl/EhKKKK8U9wSiiimMKKKKYBRRRQAUUUUwCiiimAlFFFABRRRQAUUUUAFFFFACUUUUxhV/w9/wAh/Tv+vqP/ANCFUK1fCdu1z4ksETqsyyfgvJ/lW9FXnH1MMQ0qUvQ9pFFAor6s+KCiiimAUGiigDwKeF7eZ4pVKSISGU9QabXpOreJfDQv5UmshcyKdryiBXDEDH3j19KrQ+KPC3nx7NMEbZGH+zINp9cg/wAq+feGpp250fTLG1XFfu2dH4PgktvDdnDOpWRU5B/3ia2qp/brZbH7a0qfZgu7zAeMVz3/AAsLSf8AnjdH/gK/417KqU6UVFs8B06laUpRj1OtPHtTq5Wy8daTd3SQATwlzgNIoC/nmtfWdZtNGtfOvHwCcKq8sx9AKpVqbTknsQ6NSMlFp3Zpc0VyH/CxNI/543f/AH7H+NaOheK9O1uZobbzUkUZCygDd6455qY4inLRMqWHqxV5JnE/Eu2kXXvOaNvLeIBG7EjrXKV694p1fSLGNItUiW5YnIi2ByP9og9Kwf8AhJ/Cf/QJ/wDJaP8Axry8Rh4yqNuSR7OFxc40orkbsJ8KIXEeoSsh8tzGqt2JG7I/UVyXiOGSHXr9ZV2kzswHsWJB/I16r4c1PTdSsd2lII40ODFtClDnuB09axtf8Q+HrbUGgu7VbqZAAWESNt9sk/pW06EHRUebbqY0sTP6xKag7voeZV6z8PIJbfw1CJ0KEszKD3UnisX/AISfwp/0CP8AyWj/AMa7awu4L22Sa2cPG3Qing6MISbUrix+JnUgoyi0r9SzRRRXqHjhRVPU9Rg0u1e5u3CxL+ZPYAdzXOf8LD0kf8sbv/vgf41lKrCGknY2hQqVNYK519Fc5o/jTS9UuxbRGSKVvu+aAoY+g561d1vX7LRIQ945LN92NMFj74oVWLjzX0E6VRS5GtTWpOa5D/hYuk/88Lv/AL4H+Na+g+I9P10P9jdg6dY5AA2PXHpRGtCTsmOeHqQXNJNHm/j2KSLxRdNIhVZSrKT3G0Dj8RWBXq/ifXdDsbhIdStxdyLk4Eavsz65PFZH/CVeE8/8gf8A8lo/8a8urRi6jfOj3MPjKipJKm3oXvhdBLHokzuhVZZyyE/xDAGf0rsR0rP0O/s9Q06ObTyohwAEAA2Y/hwOlaHavToRUYJJ3PDrzc6jlJWYtFFQXdzFZ27z3DiOJBlmPQCtW7GKuyeiuPPxF0gf8srv/v2P8an07x3pF9dLb/voGbgNMAFz6ZBNYrEU27JnQ8NVSvys6mlrN1nWbPRrXz7yTaDwqjlmPoBWD/wsbR/+eF3/AN8D/GqlVhF2bJhQqTV4xbOvoHSsDQ/Fmna1M0Ft5kcoGQsoALjvjBOa3xVxlGSumZzhKDtJWYtFFFUSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFGKKKADFGKKKACiiigDN8Rf8gO+/695P/QTXjNe2arbtd6bc26EBpYmjBPQEjFeSS6Bq0UzRvp85KnGUjLD8CBg18/m1Kc2nFXPayurCF+ZmbXe+KM/8IDp3+7D/AOgVylvoOrSzLGun3A3HAZ4yoH1JGBXeeItFup/ClvYwhZJ7dUJUH720YOK5cJSqKlUvF7HRjKtNzp2a3PMzVzQf+Q5Yf9fEf/oYp39iar/0Drof9sG/wrR8O+H9Tk1q1L2csKRSLK7zKUACkHA45Pt/SuSjRqe0jeL3O2tXp+zl7y2PVh0pTSdqca+zR8gxK8j8df8AI0Xn/AP/AEBa9crzTxtoV+2uS3NvbyTxTgYMSlsEKBg+nT/PNeZmkJSpLlV9T0ctnGNV8ztocjxmvQvhf/yD7z/rqP8A0GuM/sXVP+gdd/8Afhv8K9A8A6Xc6fpkhu08tpmDhD94DGOfSvLy+lUjWvKLsenmFanKjZM8w6nC0vStW78O6ta3UkH2GaUKcb4o2ZWHqCB/nvUa6DqzMFGnXQJ9YmA/lXFOhVv8LO6Nelb4kdaP+SWD02f+1a4KvTv7DvB4G/srCfadnTdxnfuxn17emfauAOiaqGwdOu8/9cW/wrux1Go+R2eyRw4KrTTmnJbtlBPviu9+KJJt7HP95/5CuXs/Duq3N1HD9ini3H/WSRsqr9Tiu08f6TeajYwyWaeaYNxZB1IOOg79OlPD0p+wmuV62FiK1N16bUlpc8zzW54F/wCRps/+B/8AoDVT/sTVf+gZd/8Afhv8K3fBGhaguuR3U9tLbxQAkmVSu4lSAAD16/54rnw9GoqsdHudOJrU3Rl7y2PTaMUUor68+SY014nrv/Ibv/8Ar4l/9CNe3V5J4i8P6pFrNyy2ksySyGRGiUuMMT6DgjuD/KvHzSMpU0oq+p62WTjCo3J20MCvTvhlz4ef/ru38hXn/wDYmrf9A67/AO/Lf4V6Z4J0u40rRxDdqFkZy+0HO0HHBPrxXLltKcat2tLHZmVWnOklF63N/HFLigdKK+iPngooooAaRnNeUeNtCk0vUGuEGbWdiVYfwnrt/wAK9ZqtfWcN9bPBcIHjcYINcmLw6rw5ep1YTEPDzutup4bRXYax4DvIZS+mbZos8RswUqPTng1gSaFq0blW066J/wBmFiPzAxXzVTDVYO3Kz6eni6M1fmRm0Vof2Lqv/QMu/wDvy3+FH9iar/0Dbv8A78t/hWfsan8rNPb0v5kZ9FX/AOw9V/6Bt5/35b/Cj+w9V/6Bt5/35b/Cn7Cp/Kw9vS/mRQoq/wD2Hqv/AEDbz/vy3+FH9h6r/wBA28/78t/hR7Cp/Kw9vS/mRQoq/wD2Hqv/AEDbz/vy3+FH9h6r/wBA28/78t/hVexqfysPb0v5kUKKv/2Hqv8A0Dbz/vy3+FH9h6r/ANA28/78t/hR7Kf8rD29L+ZFCkrQ/sPVf+gbef8Aflv8KP7D1X/oG3n/AH5b/Cj2U/5WHt6X8yM+itD+w9V/6Bt5/wB+W/wo/sPVf+gbef8Aflv8KPZT/lYe3pfzIz6K0P7D1X/oG3n/AH5b/Cj+w9V/6Bt5/wB+W/wo9lP+Vh7el/MjPorQ/sPVf+gbef8Aflv8KP7D1X/oG3n/AH5b/Cq9lP8AlYe3pfzIzqK0f7E1X/oGXf8A34b/AAqW38N6xcybE06dT6yJsH5nApqjN9GDxFJfaRk16D8OtAkgzqlyCGkXESHsD1b8R0pfDXgTyJludWKSEcrCOQD7nv8ASu5VQqgKMAdBXrYPByi+ep8keLj8cpr2dP5seKKKK9c8QKKKKYAaaacaaaAPA2O4/wAhRWpeeHNXtbiSE2VxJsb70UTMrDsQQP8APeo00LV3kVRpt0NxxzCQPxJGBXyjpTT2Z9pGvS5fiR2U3/JKV/65r/6NFeenpXqc2h3R8Df2UpQ3IjAxnjO/djP6V522iasODpl3/wB+W/wrtxdKb5dOhwYGrTSmm18Vygn+sX6iu/8Aiv8A6rTf96T/ANlrlrDw1qt3dxxCymhDHl5Y2VVH1IrtviJo13qNpbSWcfnG3LlkHLEHHIHfpSo0pqlPTsLE1abxFNqW1zzIH5R9K3fAf/I1WOP+mn/otqpf2Hq//QLu/wDvy3+Fb3gXQdRTXo7q4tZLeG3DbjKpUklSAFB69f8APFY0Kc1Ujp1OnE1qToy95bEHxH/5GV/+uSfyrmCOK7f4gaFqE2qre2sD3MUihMRLllIHcenvXMf2Hq//AEDLz/vwf8KrE0p+0ehODr0o0YpyWx1fwn+/qOPSP/2auQ13/kO3/wD18Sf+hmu7+HOkX1hDdTXkRtxOVCqww3GeSPxrl/Efh/VotbumWzmnSWRpVaJSy4Yk9hwfUf0rpq0p+wirHPQqQ+tzk5LY56vWPhp/yLKf9dG/nXnH9iat/wBAy8/78H/CvUvBWmz6VoUVvd7RKSWIBzjJ6fWjAwlGbuiMyqwnSST6m9RQKK9o+fON+Kf/ACAIP+vpf/QWrzKvWvH+l3GqaGUs13ywyCXZ3YAHIHvzXmf9h6t/0C73/vy3+FeJjKcpTukfQ5bWhCk1J9Q8Pf8AIf03/r6j/wDQhXRfFHP9sWmf+eB/mao+F/DuqSa7aO9pNbxwSLM7TIVGFI4Hqa3viLol9fTwXtpC08caeWyoMsOvOO45pU6c/q8tOpdWtT+txfMtjz0V1vwwz/wkU2P+fZv5rWH/AGHq3/QMvP8Avwf8K6v4caJqFrqM15cwPBF5RiAkBVicg8A8446/l3qMNCftFdG2Oq05UXaSOf8AHP8AyNN//vL/AOgCsICuu8daDqba9NdQ2kk8U4DAwqXxgAHOBxWF/YWrf9Au9/78t/hUVac+d6dTTD1qaoxvJbHdfCj/AJBN1/18f+yiu1HSuX+HmlXWmaS32xDG87+aIz95RgAbh2PHT8+a6mvbw8XGkkz5rFNSrSaErnviH/yKV79E/wDQ1rou9Y3i3T5tT0C7tLbHmuFKhjgEhgcfpiqqpuDsZ0Go1Yt9zxenRf6xPqKvf2Dq+cf2Xef9+WqxpvhnV7u8ji+wTxAnJeaNkUD6kf8A168FUp81kj66Vekot8yOn+LIwmnehaT/ANlrgCK9O+I+j3mpWlrNaRmU25bci8sQcdB36VwP9h6v/wBAy9/78GurEwk6jscWX1qcaKUpIv8AgH/kbbH6Sf8Aotq9iry/wHoGox6/FeXFtLbxW4YkyqVJJUqAAevXP+RXp9deDi409e55mZzjOteDvoOFFFFdx5gUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGJ4n1xdDsvO2eZI52ovbPvXI/8ACwdR/wCfW3/X/GtP4of8eVr/ANdD/KvPR0r5nMcbWhV5IOyPewOFpTpKU1dno3hfxi+qX/2O7iSJ5B+7KZ5xknNWfFvig6LNFb20ayTsNzb84C/4muM8Df8AI0WX1f8A9AarnxI/5GBf+uKf+zVccbVWEdS+t7XJeEpfWlC2lrk//Cw9Q/59bf8A8erpvCXiQa5HIkqBLmLllXOCpPBFeV12Pwx/5CF5/wBc1/nWOCx1edZRlK6NsZg6NOi5wVmXNc8cS2upSW1jDHIkJKM0mclwcHHsKof8LB1H/n1tv1/xrnNc/wCQxf8A/XxL/wCh1SHSsq2YV1NpPqa0cDRlBNo9h0vXLa/0h9RBZI4wxkBHK7Rk1yVz4/u/Nf7Paw+Xk7d+c498Va8M/wDIh6l9J/8A0CuDrqxeMqxhBxe61OXC4SlKc1JbPQ6+3+IF4Jl8+1g8vI3bd2fwzXXavrkFhoq6jtLq6gxjpkkZH04ryKu78Vf8iHp30h/9Ap4TGVZQm5O9loGKwtOE4KKtdlE/EHUD0s7f8Sf8avaD42mu9Sit7+CONJSEVo85DE4Gc9q4LpVzQ/8AkN2H/XzH/wChiuWhjqznFN9Tqq4GjGDaR7YOlKKQdKUV9afMMKMUUUAFGKKKADFFFFABRiiigBKxfFGuR6HZCVl3yvkRp2J9/bmtuuF+Kf8AqLH/AHn/AJCubFVHTpOUTow1NVK0Ysz/APhYOoZz9ktv1rY8LeMX1TUPsl5CkbSD92yZwSBkg15x2rb8D/8AI02X1f8A9AavAoY2s6sYt6Nnv4jA0Y0pOK1SPXaKDSivqD5cTOK4PXfHMlpqMttYwRukR2M0mclu+MEcDpXd14lrf/IYvv8ArvJ/6Ea8rMa06cE4aHp5dRhWqNTR0n/CwdQ6fZbb/wAeruNA1aHWNPW6hBGflYHse4rxjivTPhl/yAT/ANdm/kK5cuxFSpV5ZPSx15hhKdKnzQVtTrqKBRXvnhBRRRQAUUUUAGKMCiigAwKMUUUAGKMUUUBcMUYoooAMUYoooAMUYoooAMUYoooAMUYoooAMUYoooAMUYoooAMCjAoooAKKKKACiiigAooooADTTTjTTQB51qPxCuUupVsreJoAcIZM5PvwaiT4iXu9fNtIAvG7Gc474rjW6CivmpYyrzbn1kcvocux7jpd5FqNlHcwZMcgyMjFWx0xWH4G/5Fex/wB0/wDoRrer36T5oKT7Hy9WKjUlFdGJijFLRWtjMMUmKWiiwCYoxS0UWATFGKWiiwCYoxS0UWAKKKKYGP4m1ePRdMe6kXczHZGvq2Cf6GuI/wCFi6jjH2a1/I/41ufFT/kX4f8Ar6X/ANBavMq8fF4icJ8sT3suwtKrS5pq+p6H4c8cy3uqxWuoQRxrOQiPFn7xOBnnoa1vGPiddCVIo4xLcSDcA33QM9TXm3h//kPad/18x/8AoQrofiiMaxa/9cP/AGY0qeJqewc763HUwdNYqMEtGtg/4WLqP/Pra/r/AI10XgzxW+uSzW9zEkc6DzF2Z2leM9e4J/WvKweK674Xf8jHL/16t/6ElTh8TUnUSb0NcZg6MKMpRVmj1LFAoor2j5wWiiigQUUUUAGKKKDQBz/i/wAQroFmjhN88xIjU9OMZJ+mRXH/APCxtR/59bX/AMe/xq/8WumnfWT/ANkrz/NeTiq84VGon0OAwlGpRUpo9L8I+M31fURZXsKRySAmIoDhiASQeT2Ga7UV474B48XWJ9PM/wDRb17EK68JOU6d33POzGjGjW5YLSwtFFFdh54UUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGB4u0I63YqkU3lyxEtHn7pOOhrj/wDhAdX/AOetr/32f8K6vxxrFxpOnp9kC+bMxUMf4eM5FcL/AMJXrv8Az/P/AN8L/hXgY+eFVS1RNvyPZwUcS6f7tq3mdN4W8IXWmamL2+kjJjB8tY2J5IIOSewH+eObPi/wtNrFzHdWkqiVQEKyHClRyCCBnP8An65Pg/xNqF1rKWl7J9oWYEAkAFCATnge3+e/oZFdGGpYfEUOSCdrnPialehWUpNXseZ/8IFq3/PW0/77b/4mun8IeG30RZZbiXzJ5flIX7oUdPcmul5orell9GjLnijOrjK1WPLJ6HA674Iu7jUZp7GeIxTMZCspIKsTkjocjPT8veqH/CA6t/z0tP8Avtv8KPEHivVP7WuIrWYQQwuUCqoOSpOSSR3/AM+tZ/8AwlWtf9BBv+/a/wCFeLWngvaO66nq0YYzkVpHoWk6FHYaE+mGaSQTBhK/Q/MMHHp+tcfN4C1NZWEU1u8YOFZmIJH0wcfnXUaNr0t74Zm1GaMeZbq+4A4DFRn8M/jXETeL9ckld1vDGGOQiouB+YJrtxUsK4Q5k7W0scuGjieefK1e+pft/AOptKomntlTPJUsSB7DAz+ddfrGgLfaEmmRSlBCqiNiM/dGBmuAh8X66kyMbwyhTkoUXB9uADXqOm3P2uwt7nbt86NZMemRmrwCw1SMo009e5GMeIhKMqjXkeef8IDq6/8ALa0/77P+FX9B8D3lvqcVxfSxeXCwkAiJJLA5A6Dj/wDV7134oxXRHLqEZKSWxhPH15x5WwHSlFJS16RwBRRXnfjLxPqNvrL2dlKYEgAyRhi5IBzyOMZxiueviI0I80jehRlWlyxPRKSvIf8AhK9b/wCgg/8A3wv+Fd14I1q41fTXa6CmSBhGXH8fHUjsa5aGY0q0uRJ3OmvgalCPO7WOlorya88YaxPcvLDc+RGT8sagHaPqRzUK+LNbVgftu7Bzgxrg/pWX9rUb21NlldZq90evUlc5/b8n/CHDVxChm8v7u75d27bn8+cfhnvXCt4s1w8/bnUHt5a/4VvWx9Oja+t1c56OBq1r20s7Hr9c/wCL9BOuWiLHJ5U8JLRk9CT2P5Vwlj4x1eG6SSa4NxEv3oiANw+uOK9YUdz1p0sRTxsGktBVaNTBzTe55l/wgOr/APPW0/77b/Ctjwp4PudM1Nb2+liJjB8tYiTkkEEkken+fXuKKIYCjCSklsVPH1pxcG9GJ0orhvHfiG+068jsrFvI+QSGQYJOc4GD9K5n/hK9c/5/2/79r/hWdXMadGbg03Yull1SrBTTWp6/Xn2veBry41Ka5sZojFOxkYSsQQxPI4ByPT8vetTwDr15q8c8V6Q7wYIk6Eg54I/Cud8QeLdVGq3EVtN9nihcxhVAOcE8kkdT/n1rPE4ijUpKU07PYrDUa9Os4Qtdbif8IDrH/PW0/wC+2/wru/DWkDRtOW2EjSHO5mIxyeuB6cV5p/wlmuf9BF/++F/+Jr0XwjrEus6StxcRhZFbY2OhIA59utZ4CWHc37NNPzNcdHEKCdVpryNyiiivbPHCiiigAoorjfH3iG60ryLex+R5huMvXAHYD39ayrVY0YOctka0qUq01CO7OypOntXj3/CWa5/0EH/79r/hXT+BPEV9qN3NZ3z+d8nmLIQAeoBGAMEc/wCe3FSzGlVkoJM662X1KUHNtHdcYozXnPjDxTqFtrD2tlJ9nSDAJABLkgHPPp6Vi/8ACW63/wBBB/8Av2v+FTUzKnCThZ6FU8tqzgp3Wp7BRXM+CdcuNX0x2ugplgYIXU/f4zkjsa4u+8Y6zcXLyQ3XkxE/LGqghR25xk+9azx1OEVJ31MqeCq1JuCtoet0mfevIE8W64rg/b92DnBRcH9K9O0DUG1TSbe8dAjSrkqDnHJH9KqhjIYhtRTuhYjB1MOlKVrM0qKBRXacYUUUUAFFFcD468S31lfrY2J8naA7SDBLcdORgVjWrRox5pG1GjKtLlid9SCvHf8AhLNdH/MQb/vhf8K7P4f6/d6tHPBenzJIMES4ALAk8ED0x1rmo4+nVlyxR1VsvqUYc7tY7Ciiiu488Q0tU9WujZafcXQTf5MbSbc4zgZxmvK5fGGtyuzLeFAxztVFwPYZBNc1fFRoW5up14fCVMQm49D2CivH7fxjrcUytJdGUKclWRcH2OADXq+nXP2ywgudmzzo1k25zjIzilQxUK91HoGIws8Pbn6lmiiius5AooooAKKKKACg0UUAeZX3w81EXMgs54Hgz8hlJDY98Aj/AB9ulRr8PdW3gPLaqpPJDsSB9MCvUDSVxPA0m7noLMa6VrlLR7JNM06GzjJKxDGW6nJz/Wrv86zPEuoNpejXF4ih2jAwCeMlgP615gfF+ut01FvwRf8ACnVxEMPaDIoYSrirzXc9jo5ryXT/ABnrMN3G9xc/aIs4ZHUDI+oHBrrvHmv3ekWkCWYUS3JYeYedoGOg7nmiGMhODmug54GrCcab3Z1lHNeOf8Jbrv8A0EG/79r/AIVveC/FWo3WsR2N7J9oScHDHCmMqpORgc5xjH+TFPHQnLlSNKuXVacHO60PRaKKK7zzQooNeWeIPF2qrrFxFaTfZ4oXaIKqhs4J5JI6n/PrWFavGiryOjD4eeIk4wPU6Oa8cHi3XR/zEHH/AABf8K9J8JatJrWkx3UyBHJKsB0JHcen0qKOKhWdom2IwVTDx5pWsbdBoorqOEw/Fei/27pZthIY5FbzIz23AEYPtzXD/wDCvNX/AOe1p/323/xNep4ormqYaFR80jqo4urRjywZ55oHgS8tNUhur+4hEduwkAhYklgeAcgcev8Ak1r+NfCsmueVPazKlxGuzbJ90rnPXBIPNdZSULDQUHDoweLqymqjeqPLP+Fe6z/z1s/+/jf/ABNdJ4I8Jz6JdS3l5KrzOpjVYjlQpIJJJAJOR+HvnjsKBU08LTg+ZLUurja1WLjJ6C0UUGuo4gpKa/Ct9K8ivfGes3F1JLDc/Z42OVjVQQo7ckc1hWrxo2v1OnD4aeIvy9D2CkHPvXjkfjHXUk3fbi4Ug4Ma4PscCvU9Cvm1HS7e8dQjTIGIBzippYmNV2ReJwdTDpSlazNGiig10nGc34y8Otr9rH5UojngLFM/dbOOD+Qrjv8AhXms/wDPS1/7+H/4mup8f69daJawrZACS4LDzDztAx0HvmuF/wCEx17/AKCDf9+1/wAK8vESo8/vp3PcwccU6X7trl8zrPCHgy50rVVvdQljZogfLWFiQSQQSxIHY9P8Oe4/nXnPgjxTqd5rUdlfyfaEnDYYqFKEKT2HOcY/zz6N/OuzCuDh7mxwY1VVV/eu7sOooorpOIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDifih/x42f8A11P/AKDXn1eza3o9vrFobe5HGcqw6qfUVzv/AAr7T/8An7ufzH+FfO47AVatVzhse3gsbTo0uSW5yvgf/kabP/gf/oDV65XPaD4UsdHuzcRPJNLjapkwdvriug7135dh5Yek4z7nFjq8a9Tmj2HUGiivROE8V1z/AJDF9/18yf8AoZqlXp2reDdPv7x7kvJA78sI8YJ9cEdap/8ACv8AT/8An8ufzX/CvlauWVpTcla1z6SjmFGEEnch8Mf8iDqX+5N/6BXBHrXtFjplpZ2P2O3hVYCCCuM7s9c+tc/P4A055GdZrhFY5CBgQPzFdmKwFSdOEYWdlqcmGxkKdSTl1Z5xXs3h3/kX9O/69o//AEEVz0Pw/wBOWVHa4uXVTkqWAB/IV1kESQRLHGoVFGAAMYFdGW4Sph3Jz6mWPxUK9uXoTCim0V69zyx1FFFMBDXkXjf/AJGm++qf+gLXrprndc8JWWs3YuZGeKTGGaPHzemcjqK87MMNKvSUYbpndga8aFTml2PKq9A+GH/IOvf+uo/9BqX/AIV5Yf8AP5c/+O/4V0WiaRbaPZi3tV4H3mPVj6mvPwWBq0qvPPY7cZjqdanyxPFz2pK9MvvA2mz3DyLLNAHOdiAbR9OOKij+H+nAj/S7kjPTcvP6VzPLa3N0OuOY0VHqVf8Aml3/AAH/ANrVwleznTLQ6X/Z4iUW2zZ5eOMf498+tc2fAGnDpc3A+hX/AArrxWCqT5eXorHJhcbCnzc3V3PO0+/+Ne7r2rkbHwNptvdJM8s023nY+3a314rrxgCujLsNLDpqfU5swxEcRJOPQKKM0Zr1rnmnl/xL/wCRiX/rin82rlwRmvXfEPhmz1x0kuC8cqcB48ZI9OQax/8AhXlh/wA/Vz/47/hXz2Ky+rUqucdme/hsfSp0owlujP8Ahb/r9Q/3Y/8A2auW13/kM3//AF8Sf+hGvVtA0G10SBo7YFmc5aRsbm9B9BWbq3gnT9RvHud8sDycsI8YJ7nkd63q4OpLDxprdGNLG044iVR7M8tr074Z/wDIAf8A67t/IVX/AOFeWGP+Pq6z/wAB/wAK6nTNPttNtFt7SMRxr2Hf3PqaWBwVSjU5p7CxuMp1qfLHuW6XNNozXt8yPHHUUUUwA9K83+KP/IQsv+uZ/nXpFZHiDQbTW4VS5BV0OVkXG4VyYyjKtScYnVhKyo1VOR44a6n4Z8+IZP8Ar3b/ANCFbn/CvLD/AJ+rn/x3/Ctfw/4YstEMjW5eSR+skmMgegx2rysNl9WnUU5dD1cVj6VSk4R6nnnjb/kaL7/eX/0EViV6xrvhOw1i7FzK7wykYZosDd6E5B5FZv8AwrvT92Ptd1+a/wCFRWwFSVSUk92aUMwpQpRi90iH4Xf8g2+/67D/ANBrgB92vaNG0i10e0FvaIAOrMerH1NYd54D025uJJY5JYN5zsTGB9OK6K2DqToxjHdHNh8bThWnOWzPMuK9e8Df8ixZf7p/9CNZK/DywVgxubk47fL/AIV1lnbRWdukFvGI40GFUdBWmAwlSjNyn2Ix+Lp14KMO5YFFFFeueQFFFFACGvKfiP8A8jK3/XNP5V6rntWF4h8M2euOrzho5V6SJjJHofWuLG0ZVqfLE7MFWjQq88trHkPeu5+FP/H1qH+5H/7NV/8A4Vzp3/P1dfmv+Fbvh/QbTQoWS2UsznLyNjc3p+VcGFwVSlUUpHo4vH061JwibFFNzRmvbPCsZvif/kX9Q/69pP8A0E14tXu88aTxNFKoeNwVZWGQQe1chJ8PtMaVmjubhFySEDKQPbkZrzMdhp1mnE9bAYmFBSU+p5xXtnh7/kB2H/XvH/6CK5y38Aaakyu89xKAclGZdp+uBmuthjWGFI0AVEG0AcAAdhSwGGlRcnLqLMMVCuoqHQmopuaM16h5YtFFFMQUtJRQAtFFFABRSZHrQWX1FAWOe8f/APIq3v0T/wBGLXkfSvdL60hv7V7a6jWSKQYZTyDXKN8OdP6/arr81/wrysbhp1ZqUex6+AxlOhBxn3POE++v1Fd38Vvuad9ZP/Za0bHwFptrdJNJJNOEOdkmNp+uBW1r2jWutWwiul5XlHH3kPqKmjhJxpyj3LrY2nOvCS2R4vW54D/5Gyw+sn/otq6r/hXenf8AP3df99D/AArT8P8AhGw0W8a6haSaUjCtLg7c9cYHU1hRwk4zUn0Z0V8wpTpyjFatWOkooozXvHzoGvDtd/5Dd/8A9fMn/oRr3DINctrHgfT9RvXut8sDScsI8YJ7nn1rhxtCVaC5eh6GAxEcPUbmeWZr1P4af8izH/10b+dVP+Fc6fj/AI+7r/x3/Cuq0+xg0+0S3tIxHGgwAP8APJrnweFnTnzSOrHY2nXpqEO5copuaM16x4o6ijNFABRRRmgBKKTNLQMKBRRQIjm/1bfSvBB0/CvfjyK4++8AaZPdPOks0Ac58uPbtH04rz8ZQlVtboepl+Khh3JS6nmA6V7N4O/5FjTsf88hWGnw901WXddXLAEZBK8+3SuwtbeK1gSCBAkcYwqjoBUYPDypybZeYYuFeEYx7k46UHpQOlBr0jyDz74tdNO+sn/slefE17dr+h2muWohvF+6co4+8p9jXOf8K30//n7uv/Hf8K8vEYac53R7uDx1KlSUJ7o5TwB/yN1h/wBtP/RbV7B/FXO+H/B9ho12bmIyTS4wrS4Oz1xgDk+tdHXVhaTpQ5ZHBja8a9Xmj2sLRQKK6zhCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA4/4lXU9vpkEcMhRZXKuB/EMdK84A5yetehfE5CdPtWwfllOT2HFefV8fmkpKufTZal7E3/AAHdTQeI7eKNyI5twkXswCkj8j3/AMau/Eq6lfVIrYSHyUiEgTtuyRn3rN8EKzeJ7TapKqHJwOg2EZP4mrnxHVv7fjba20wqAccE5P8AKrhOf1J69SZwj9cXocyp5/zxXb/DO9maW5tmkZoY1DKp6Ak84rh67P4Yo32q7fa23YozjjPpms8ucvbo2zCMfYs57xNdTXWt3b3Em7y5mjUHsqsQAB/n1rN496va8hXXb4OCrefIdpGOCxIP4iqNclacnUl6nTQhFUo+h6l4Cu573Qw1zIZGSQoCeuAOOfxrojXL/DhGTQfnVl3SsRuGMjA5FdTX2OEk3Ri32Pk8SkqsrdwP3a5v4hXU9roGbd2jaSQRsVODgg5/lXSVy3xIVm0EFQTtlUnHYc08U2qMrdh4ZXqxXmeZ5rT8L3c1rrto0DsnmypEw9VZgCD/AJ96y6veH1Z9dsAisxE8bYAzwGBJ/AV8fQnL2sX5n1deKdKSt0PaqKBRX3R8YFGBRRQIQ9KQ06mmpew0tTw66uZbq6ee4cyTSHLMf88D0FRoxV1ZTtbqCByDSSK0btHIpVgcEHgg+hpK+FnKTlrufbRjFRstj0cand/8K6+2ec32ry8eZ/F9/b/Lv179a865JJJJY8kmu9aGT/hWAXy33bM7cc483rj9fpXBV6GOc/cT7I87Axiudrux9ncTWdxHcW8jRyIcjH+entXf/Em+uIbC2hglKJOWEgHG4YHGfxrz+JGkkVEUs7EKAoyT9K7r4nRubSzZV3KrtuOOBwMZp4aUlh6mvYMTGLr00/M4Dn3rofAFzPB4ighjciOcsJF7HCkj8QRXP5NbvgZWbxRZlVLBd5YjsNhGfzNc2ElL28fU6sTFexn6HrlFIKWvs0fIBijAoopgFUtZne30q7miOJIoXdTjOCFJFXM1n6+rNot8qqWZreQADqSVPArOo7RZUVqjxiSaSWV3mcyOxJJY5JPqaWN5IpRJCxSRCCrhsEEd6jHrTv8Ax5jXxjcubc+z5Y8ux7XpMr3Gl2ssxzJJEjsRxkkA9qvVn6GpXR7JWBVlgRSD2IUVoCvtKfwo+Ll8TCjFFFWIKKKKAPJfHd3NP4kuYpZCyQ4WNeyggZ/M9657J9BW743Rk8TXhZTtYqRkYyNoGRWFXx+JlJ1Zep9jhVH2MfQ9J+Gl5PcaZPFNIXWCQKmf4VxnFdkBXE/C9GGn3LMrKGl4JHB47V2vFfS4Nt0Vc+YxiSrSsFFFFdZyi0Gig0COJ+J11PDZW0ELlUmZhIB/EBjivOgK9B+KaMbaxdUJVZG3HHAyB1rz6vmMfKXtmfUZdGLoJnQ+AbuaHxJBDHIVjnDCRT0YBSR+II6/4161XkPgNGfxRaFVLKu9jgdBsIz+Zr16vTy1t0te55maJKtp2Eooor1DyzxfxNdTXWvXj3MhfZK8a57BScAen+TWYOTV7xAjJrt+HUr/AKQ5wRjgscfmKoivjq05Ocr9z7TDxj7OLXY9L8P6ndN4Inu3mLTwRybJCASNo4z649682kkeWVndjI7ElmLZJJ6kmvQvDsUn/CvrtfLfc8U20Y5bIOMDvntXnfOML/8ArrtxkpOEE+xwYKMfaVNOo+GV4ZlmhYxuhyGVsEH616J4t1G5TwXazLKVkuBGJWGBuDKSenTJ9K839u9d/wCL4ZE8Eacvlvuj8rcuOVwhHPpzRhHJU527DxkI+1p+pwBODk1q+FbmW18QWZt3KeZKsTY6MpYAgj/PrWXV/wAOKzeINP2qXYToeOeMgk/gK5KMpKpG3c7cRCPspadD2yigUV9efGBXkfjy6nuPEdxFI5KQ4WNeyjAz+Z7165Xj3jlWXxTeFlKglSMjGRtAyK8zMm1SVu56uV29tr2MXoDzXpfw1u57jQ5FnkL+VJsTPYbQcfrXmVek/DFGGi3DMpAac4OOvyjpXn4CUvaHpZjGPsfmee3d1NeXMk11I0jucs5/z09B2qJCUdWUlWU5BXggjuKSRGVirqyspwR0II7Gkrjk5c12eioR5LI9k8I3ct74etJ7lt8jL8x9cEj+lbNYfgiNovDNkjqVYIcgjH8RNblfU0dacb9j4yskqkku4lcT8UbueG1tLeGVkjmL+YFONwG3APtzXb1wfxXRzBYyBSVVnBPoSFx/I1li240W0a4JJ143PPuP8iuj+H11PD4lt4I5GEVwGEi9m2qSPxBHX/GubroPAKM3iqzKqW2B2OB0Gxhk/ia8HDyl7WPqfTYuMXQlp0LnxLu55NbFq0rGGONXWPsWx1965P8AAflXU/EhWXxGZGVgpiXBxwcdea5iqxcn7Vhg4x9jHTod98KrqZ4722klLwxbGRT/AAk7s/y6V39eefClGDahJtO1vLAOOMjdkfrXode7hG3RTZ85jklXlYb3rP165kttFvbiA7ZYoHdGxnBCkitCs/xAjSaFfxopYtbuAAMknaeMVvU+HQ5IfEr9zxOR3mkeSRyzsSSxbJyepJpYJXt5hNExjkQ5VlOMGmdePWl7f3mr5e8ua59tyxcbHpPjTUbqPwbZyxylZLny1kPQtlSxHHTJHb6dK825ByeSK9C8bRSf8IXp6+Wd0Zi3Lj7vyEc+nPFee12Y2UuZX7HnZakqb9TV8J3dxa+ILNoZWQSyrG6joylgMV0fxRvrgXUFokxEDR72Qcbjuxz+Vcv4bUvr9gEBYidG4GeAwJP4Cui+KKN/adtLsOwQ4344zuPGadOT+rv1FWjH63DTocZ06V2XwuvJ11ae03t5DRGTy+24EDI9OD+P4CuMrrvhejHXpn2syrbspbHAO5cDP4Gs8K5e2R0Y+MXQfoepUUUV9EfIjJPuH6V4Te3M17cPPcyGWWQ5Zj/np6DtXu0v3D9K8EdGidldWVgcEHgg+hrycxk1y2PbyhLmlcEdo3VoiysDkEHBBHcV7T4VuJbrQLKadi8rxgsx7mvFK9o8HoyeG7BXBVhCuQanANuUrm2bJckWu5siikFLXrnzwUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigChrLWK2Mn9plBb4+bd/8AW5/KuV8zwR6J/wB8S/4VJ8T/APjxtf8Arqf5V59nmvnMfjfZ1eRxTt3PaweF9pT5uZr0PU/DT+HWmmGiCPzdo38MGx2+9z9fwz2rV1HSrPU41jvYRKqnIyTwfwrzLwOf+Kps8+r/APoDV6zx+Nd+AqrE0XeKSvt0OTGUnh6tlJvS9zE/4RHQ/wDnwj/76b/GtKxsbWwtxBZxCKMchRVqkrtjQpwd4xSOOVWclaTbMy/0DTNQn867tEkkwBuJOcD6Gq//AAiWif8APgn/AH03+NbmDRQ6FJu7irjVaolZSZHHGkMYSNQiKMADtWLN4s0WGZ45L8blODtR2AP1AIq74gwdDv8A/r3k/wDQTXjR715+OxssLZQSO3B4SOJ5nJ7HrMPi3RZpFjjvhuY4G5HUfmRWnePbLau12U8jHzF+mK8S713vin/kQ9P+kP8A6DWWHzCdWE3JLRGtfAxpygoyerJPP8DekX/fMv8AhV7QJPC/27/iUGIXJU44cEjvjd/SvMau6Ica3YD1uI//AEIV59LHN1Irkjv0R3VsClTbU382e1UGiivrD5oQ9KzNT1zT9MkVL65WNnGQuCTj14BrTryTxsf+KovPqg/8cWuDG4qWGgpRV22duDw8cRU5ZPod5/wmWhf8/wCP+/b/APxNa1neW97bpPbSiSJxlWXoa8Rr0D4YnFhee0g/lXFhMwqV6nJNI68Vl8KNPmi2WNWk8HnUJTf+SbkHD8OeffHH1/Wq8UvgcSL5flBsjGVkxn8eK8/bcxJPJPc0mK8+WPfO/cj9x3wwC5fjl957juiFvuyhg25z/Dt/wrjXl8EFzu8vdn+7L/hTc/8AFr8542ev/TauDyK7cZjOTk9xO66nHhMJz83vNWdtD0jRpfCX9oxfYPKFyThMhxzj34z6V093aQXlu8E6CSNxgqa8RU4wRwc9RXuq8AV05fXVdNcqVuxz4+j7CStJu/cw/wDhEtF/58E/76b/ABq5pmi2GmM72VqkTSY3EEnP5mtKkr0FRpxd1FHFKtUkrSkyjqer2WlIr384iDnA4JJ/AA1n/wDCZ6F/z/D/AL9P/wDE1xvxK58Qr7Qp/M1zGa8bE5lUpVHCKVkerh8thVpqbb1Pa9O1K01S38+xnWWMnGRkYPuDyKq3/iTStOm8i7u1SUDJUKzEfXAOK5P4XH99qGewj/rXK66c61f/APXxL/6Ea3nmE40Y1EtWZU8DGVeVJt2R6b/wmeg/8/w/79v/APE1tRSxXEKyQuskbjKspyCK8Lr074anOgH/AK7N/IUYLHzrz5ZJBjMFChBSi2aE/hXRppWlksIi7nJOSMn8DSweFtHt5VkisI1dTlTljg/ia2eaWvS9jTvflR53t6lrczBQAKKKWtjMKpanqdppcAnvplijJ25OTk+wAq7XnHxRb/iYWYB/5ZtmubFVnRpuaOjDUfbVFBs6b/hNNB/5/h/37f8A+JrS0vV7LVY2ewuFmCHDYBBH4EV4px7V1PwzOPEEnvbt/wChLXmYfMZ1aig0tT0sTlsKVJzi3odb4lfw+txCNc8syYOzIYnHvt/TP4d6yBJ4Gzysf/fEv+Fc14348T3x9So/8dFYwrnr421Rx5Fo+pvh8DempczV10PadIazbT4TphU220bCuen49/rzVO98VaNZ3LW9xeqsiHDAIzYPpwDWH8MW/wCJdeD/AKaj+VeesGdizEjBySe9dlbHSp0oyjFanJRwKq1ZxlJ6HrS+MdBZgov1yTjmNx/StxWDAEHIPNeEV694I/5Fmz/3T/6EavBYydeTjJInG4KGGipRb17m5RQOlFeoeWV7y0hvYGguYxJGwwVNZI8IaIP+XCP82/xreo5qJUoTd5JMuNScFaLsZ2maNYaW7vZWqRM4+YrnJ/M0uqaxYaUivf3KwhzhQQSSfoBWhivKfiLz4jYekan9K58TU+rU7wSOjDUvrNXlmzt/+E00H/n/AB/36f8A+JrS0/UrTVLUT2M4mjJxkAjn6HkV4jXcfCnH2m//AN2P/wBmriw2YVKtRQaR3YrLoUabnFu511/oGmajP515apLJtC5JP9DVf/hENC/6B8f/AH03+NbtHNek6FOTu4o8lVqkVZNjI40jjVI1CoowAOgFY83hPRJpWlksUZ3OWIJGT+dbfNLWkqcJboUako6xbRi23hbR7WZZoLFFdeh3Mf5mruoNbR2MrX+0W4U+Zu6Yq2a5L4nf8gFP+u6/+gmsqqjRpuUUaU+atUipSZT83wFnpF/3xL/hWh4ek8Lm/I0fyxclT0Dgkd8bv6V5bV/w8ceINPPrcR/+hCvGpYz317qPeq4L923zvRdWe20UUCvoT5sKztV0XT9UdXvrZJWQEKTnI/I1o0VMoRkrSHGUou8XZmEPB+hf8+Cf99N/jWtaWsFlbpBboI4oxtVR0AqemvjbzUKlCGsUXKpOek22chq8ng06hKb8Qm5B+fAkPOP9nj/6/vVeCbwP50ewQq+4bcrIBn8Rj8688DZ+Zic+9FeFLF3fwo+jjgVy255fee7iSKODzNypEozuzhQPXPpWJ/wmmgj/AJfx/wB+3/8AiaxJTn4WLlufLXn/ALaivPTXXXxsqfLypaq552GwEavNzN6Ox7HZeKtHvbgQW94rSscBSjLk+nIFaN5ZwX1u0N1GJInGCprw2P5ZlI4II5Fe8p0GK6MJiHiE1JGWOwqwko8jepif8IfoX/Pgn/fTf41b0zRNO0oubC2WFnxuIJJP5mtEiiutU4Rd0jjlVnJWlJspanpVlqkaJfQLKEO5c5GD+FUP+EQ0P/nwT/vpv8a3KKJUoSd2kKNWpFWi2irp9ha6fAIbKFYowc7RVPUfE2labcG3vLtUlABK7WbH1wDitU9PavEde51u/PpdSf8AoRrnxNb6vBOKOrCUFiajU2z0/wD4TTQf+ggB7eU//wATW5DNHNCksLrIjjKspyCK8HzmvQ/Dh/4t3e+0U/8AI1z4bGSqyakulzpxeAhQScG9X1HXUvgf7TN5vleZu+cgSkZzzjH9OKfp8vgkXkRt/KE+fkLCQc/jxXm5OTSVxfW7Sfuo9L6grfHL7z3eeCG6geGdRIjjaynoRWT/AMIhof8A0D4/++m/xq/ogH9kWX/XBP8A0EVer3FCM1eSufNc84aRk0ZmnaBpmmymWztEicjGQSf5mo/ETaSlgf7cMfkZGN+ck+2OfyrWOMV5p8Uyf7XtR28n+prKvJUabaR0YaEsRWSlJ+pf87wH6Rf98S/4V0HhZtGaCX+w/LCKw3hMg5xxkHnHp+PvXjx611nwuOPEUwz/AMu7f+hJXBQxXNUUbJX7HqYvBezpOfO3buepjpRRRXsHz4VjX3hnR764ae6so3lb7zZIz+RrZpKlxjLdFRlKLvF2MKPwjocTq6afGGU5By3H61rlooIizFY0QdegAqQ9K5/4g/8AIp3vvs/9DWply0ouSRpFyrTjGTerHf8ACa6D2vh/36f/AOJqay8VaNe3Agtr1HlbopVlz7DIHPtXjZp0RKyIRwQRyK8uOPnezR7kspp2upM9x1DULawtmuLuVYo15LN/IeprJ/4TfQP+f8f9+n/+Jrn/AIrnEenj3k/9lrz+tsRjJU5uKRzYXL4VqfPJs9t0vXtO1dnXT7kTMgywwwIHrggVqA8V4/4AbHi2y57Sf+i2r14V04as60OZo4sZh1h6nIu1x9FAorqOMKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDkPiNaT3GmxPDGXETlmx2GOtedeVJ/cb8q9f8Q6zBo1n504LsxwiDjcfTNct/wsFf+gY3/f8A/wDrV85j8PQlV5p1LP0ue1gq1aNO0IXRkeA7S4l8QwzJERFbhmduwypA/EmvU65jw54uttWvjbPAbaUjKZfIbHUdOtdQOlejl9OnTpWpu6ucWNqTnUvUVmFFFFeicQUUUUAU9Zha40q6gjxvlhdFz6kYFeNy200MrJJGyyLwQVIIIr3Ckx7V52MwKxVru1jtwuMeGvpe54fDBLNKscULs7HAAGSSa9B8TabdP4MtbeOIvLbiPeqnJG1cHGOvNdftHpS1nQy2NKEoXvdWNK2PlVlGVrWdzwvY44KsD9K0fDdncXOu2fkRMwjlWRz2ChgcmvYse1JjHQVhTyhQkpc34G1TNJTi48o6lrD8TeIYNCgVpF82Z/uxhsZ9yewrnv8AhYn/AFDT/wB//wD7GvSqYyjSlyzdjhp4WrVXNGOh3h615T48s54vEM07Rny59rI3Y4UA/iMV2vhjxPBrbyRGI206chC27cvqDgV0GAOtZVqcMdSXK9L7l0Kk8HUbktex4Z5bf3G/75r0T4c2NxBpc8lxGYxO25AepAGM11+F9KUDFY4XLVh5817m+JzCVeHJax4feWdxZXDwXETJIpxjH+ePSmJHKzqqoxZuAMda9ywPSjaPSsJZPFu/N+Bss2klblOQGk3Y+Hn2Exf6T5e7y+/+s3Y+uO1ecmN1OCjAjjBWvbNRvItPs5bm4fbHGMmuMPxDTdhdOYj183/7GjG4ai3FTnaysGExFZKThG93c42ys7i9uo7a3iLO5/L/AOtXtyngGuK0/wAfW8t5HHcWZgRzgyeZuC/UYFdBr+uQaJZ+fccs3CIOCxrXAxo0IylCV+5ljp1a84qUbPoa9FcF/wALGX/oGt/3+/8Asa1PDnjGDWL42kkBtpCMpl9271HQc11xxtGclFPVnLPCVoRcpR0Oe+JdlONXiuhGxheIJuHQMCTg/nXJeW/9xv8AvmvVPE/iaHRHji8nz5n5MYfG0epODWIfiGp/5hrf9/8A/wCxryMXRoSrNyqWfax6uFr140Uo07ruO+GVlPFHd3MsZWKbaqE98E5/nXLeJLK4tdcvFmiK+ZM8iHHVSxwRXpPhrxBb67bs8SeXJGcPEWyR6H3FbIA7Cu36nCvRjGL0XU4/rk6FdzlHV9Dwry3/ALrflXqfgGyuLLRAt1GY3eQuFPUA9Mjt0roto9KcBWmFwCw8+ZO5OKx7xEeVqwtFFFemecFFFFABXn/xOsZ3e2vI4y0SKUYjsSa7/jFYfiXxDBocCs6GaV+VjBxkeua5cXCM6TUnZdzpws5wqpwV2eR7G/ut/wB812Hw0spf7Tmu2jIgWIx7iMfMSDgflVxfiLGv/MMb/v8A/wD2NbXhfxRDrryxeSbeePnyy27I9QcCvHwtChGqmp3Z62KxFeVJqULLvc4jx3YXEPiGeWRGEcwDRsBkHAAP4isDa391vyr0zxH4xt9IvPsqQG5kQfOA+3bnt0OTWd/wsdP+gW3/AH+/+xqa9DDyqNyqWd+xdCviPZxtTvp3Lfw4sLiDSppZ4yizsHTPUjHWvP7uxubS6kgnjZZIzg8f549DXr/h/WoNbshcQAqRw6E5Kn0rRVQO1d88HCvSjFS0XU4IY2dCrKUo6voeFpFIzqqqWY8AAdTXsHhO2ls9Btre4XbIi/MPQ5J/rWrgelLWmFwSw0nJO9yMXjnikotWsFFFFegeeFFFFABXmXxHsbhdYF4IiYHVUDDpkDofSvTa53xP4rt9DdIfJNxO3JQNt2j1Jwa48ZCMqfvuyOzBTnCqnTV2eUFWz9xvyrvvhdZzwreXMsZSKXaqE/xYznHtTB8RkH/MMP8A3/8A/sa6Pwx4gh162eSNDFJGcPGWyV9Oa8/CUqMaqcJ3fax6OMrV50mpwsu5tjpRXHa345h06+ktoLVrnyzhnEm0bu46GqX/AAshf+gaf+/4/wDia9J4yjF2bPNhg60ldRO+paztP1i1vdLGoRviDbuYn+H1zXKzfEaJZnEOntJGDgMZcE++NvFXUxNOmk5PciGGq1G1FbbndmuW+IlpNd6EPs8ZkMUqyMB/dwQf51nQfEaJ5lWewaONjgsJckD1xtH866XVdZttP0sahI4aIrlMH75IyAPrWcq1KtBpPQpUatGabWvQ8a8pv7rflWr4Vsbi61+z8qNj5UqysccBQwya6Y/EZSc/2Wf+/wD/APY1c0Hxvb6jqSWstqbZpOEYybgW9OgryaVGhzr95+B7VWviPZtOnbTudlQKKK+iPmxaKSuV8R+NINIvhaR25uJVGZMPtC+g6HNZ1KsaSvN6GlOlOq+WCuzqqa4yK4L/AIWQP+gW3/f/AP8Asa6vQNZg1qxW5gyp6Oh6o3pWcMRSq+7B3NKmGq0lzTVjx+8s7i0uXgmhdJEOCCP88HtUSRTSuqpE7sxAAAOSTXvGB6UbRXnvLFe9z0v7Wla3KcjLpF3/AMK8FiIibkRg+X34fdj647fhXmZjZTgowJ6/LXuGpX0On2ct1cMFjiGSf0x+fFcZ/wALGjAx/Zrf9/v/ALGni6NL3eeVrKxODxFZKThG92cXp9jc3t7HBbxO7sw4x+p9q9wT7oridO+INtPexxT2jQRucGTzNwX6jHSu3rbA04QvyO5jmFWrOS9pGw6igUV6J5olLXN+KPFlvoUkcPkmed+SgbbtHqTg1h/8LJH/AEDG/wC/4/8Aia5pYmlB2bOqGErVI80Y6HfN0rxjxPY3Fprl4s8TL5kryqccFWY4xXpvhjxDb6/bO8UZhkjOHjZskehz3FZGteO7bT7+S1gtWuTEcM3mbQD3HQ1z4r2damm5WR0YOVXD1WlG77HmoRv7rflXpmgaVdxeBp7SWIpcTxSbUbg/MOM+lZ//AAscf9As/wDf8f8AxNdlpGowarZx3Vq25HH4g9wfessJQpKT5JXdjfHYiu4x54WVzxSS3lid0ljZHTIZSpypHUGkt7a4uZ0iiid5JDhQFJzXvG0elLtHpR/Zv94r+15WtylXSojBpttFIMPHEqMPcAVbrP13V4NGsHurnkDhVB5Y9gK5H/hZS/8AQMf/AL/D/wCJrunWhRsps8yGHq1ryirnfYyK86+KGn3L3dveRxM8CR7HZedpyf8AGtXRPHlvqd+lpNam2MnEbGTcC3oeBitHxR4kttCRBIhlmk+5EDjj1J7VlWlTr0t9DahGrQrLTXseQ7H/ALrf9812fwusp/7UnvDGywCIx7iMAsSDx68DmrSfEhV/5hZ/8CB/8TW74V8U2+vPJGIjBcRjd5ZbdlfUHH+eK4cNRpRqJxldnpYuvXlSanCy9TpKK5LxJ41g0e9+yRQG5kUfvMPtCe3Q5rM/4WSP+gY3/f8AH+FelLE0oPlbPKhgq84qUY6M9AorJ8P6zDrenrdQ/KejoTkq3pWqa2jJSV0csouEnGW6CsTxpaz3vhu6gtYzJKwUqo74dSf0Fbfek/ipzjzxcSoS5JKXY8DMbqcFGAHX5asabY3V9exQW8Ls5Pp29Sewr3PaKNorzVl6vds9iWbyasonEfFCxnuLS0mhiZ0hL+YVGdoO3n9K882N/cb/AL5r2TxLr1voVmJpgXdziOMHBc1y5+I8Z/5hbf8Af/8A+xqcTSpud5SsysFXrqlywhdepi/D2yuZfElvcJEfJgDmRjwBlGA/Ek9K9aArlPDPjG31q9No9u1tMRlAz7t3c9hyBzXVjpXXhYxjC0Xc8/GznOreorMWiiius4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOJ+J/8Ax4Wn/XU/yrgOK9R8aaNcazYItowEsLFgp43cdM9q4n/hD9d/58f/ACKn+NfJ5nhas67lGLafY+hwGIpQoqM5JMTwP/yNFl9X/wDQGr1rtXn/AIQ8L6jZ6xHeX8YgSEHA3BjISCOx4xn/AD29Ar1cqpTpUbTVtTz8xqQqVbwd9BRRRRXrnmiUUUUhhQKKKAFooooAKKKKAPOvijn7faZ/55tXGHG6vSvHXh671byriyxJJEMeUSAWBPUEnH51yf8AwiGvf8+A/wC/qf8AxVfKY/D1ZVnKMW0z6XBYmlGgoykk0W/ht/yMDf8AXF/5rXpw7VxHgjw3e6deyXd+ohO0oqbgxOec5BxXbivZy2nKnQtNW1PIx84zrXi7i0GiivSOEKKKDTA5/wAdf8ixe/Rf/Q1ryge1eyeIbBtT0m4s0cI0oADEcDkH+lebt4P10HixyP8ArrH/APFV87mtGpOonFX0Pdy2tThBqbS1MNPvr9a7v4pZ+y2Gf78n8hWJY+C9Xmuo0uYPs8WeZC6tgfQHJNdh420K41myiNqymWAlgjcb+nGe3Ss8Nh6qoVE07u1jTE4im69Nxasrnl1bXgf/AJGqyx6v/wCgtS/8Ihr2cfYB/wB/k/8Aiq2vB/hbUbTWFvNQjW3SAEgbgxckEdjwBn/Pbmw2GrRrRcovc6sRiqLpSSktil8R8/8ACQjP/PBf5muXJrv/ABv4cvtSvUvbFRMdgQx7gpGM4OScHrXOf8Ifrv8Az4/+RE/+KqsZhq0qzai2rkYPE0lRScktDZ+FX+vv/wDdj/m1eh1yXgPQLrR4p5r0COWfb+7BB24z1I+tdZXv4GEoUVGSseFjZxnWcou6FopKK7TkFooopgFFFFABXnXxS/5CNn/1yb+deimuP8d+H7vVmhuLICSSIbfKyAWyeuSccVw46Mp0XGKuzswUowrKUnZHm1dT8Nc/8JBLj/n3b/0Jao/8Ifr3/Pgf+/0f/wAVXT+A/Dd9pl5Le36iElDGE3BickEnIOB0x/nnw8Hh6qrJuLR7eNxNKVBqMkzlPGv/ACNF9/vL/wCgiseu28Y+FNSutXe9sI1uEn5YbgpQgAY5POaxP+EO13/nwH/f5P8A4qpr4aq6jtF7mmGxVFUopyWx1Hws/wCPG7/66j+VdvXNeCNDm0XT2FyV82Yh2ReiHHTPc10tfRYSEoUkpI+cxc4zrSlFhRRRXUcwlFFFIYUUUUABryv4i/8AIyt/1yX+VepniuG8ceGb/UL8XtgonLAIY8hSMd8k4Nefj4SnStFX1O/L6kada8nbQ8/4rt/hXnz9Qx/dj/8AZqxf+EO17/nw/wDIsf8AjXY+A/D93o8VxNe7Y5JyB5QwduCe445zXl4OhUjVUnFpI9bHYmlOi4xkmefa3/yGr/8A6+ZP/QjVDiuv8QeENVbV7iWzi+0QzOZQ25VwSSSpBPb/AD6Vnf8ACHa9nH9n/wDkZP8AGsamHqub0e5vRxVGNNXktjpPDmf+FdXv/XOf+Rrz+vWNH0GW08NS6XNKC8yOGcDIUsMH61ws3gzXY5GVbMSAEgOsiAEeoyQfzFdeLoVHCFk3ZHHhK9NVJ3aV2YNd34uz/wAINpeemYf/AEA1iW/gzXJJVR7VYlJ5kaVSAPXg5/Su017QJbzw5Dp8EoaW2CFcjG8qMY9s/wCfWlhaNRQneL1QYrEUnUhZrRnlWaveHP8AkP2H/XzH/wChCr3/AAhuvf8APgP+/wBH/wDFVpeHvB+qRavbz3sQt4YHEpYurEkHIUAE9f8APpXLSoVVUj7r3O2viaLpy99bHptFA6UV9WfJBXj3jb/ka776r/6CK9hPNedeMPCuo3WsveWEYuEn5ZdwUpgAdzzmvOzCEqlNKKPSy2pCnVvN20OJzXo3wtIGk3I7+f8A+yiuV/4Q7X/+gf8A+Ro/8a7zwRos+jaW0dywMsz+Yyg528AYz36Vw4GjOFW8k0ehmNelOjaMrs6QdKDSA8Upr3z5w57x9/yKt79E/wDRi15Ga9p8R6e2q6RcWaOEaUDBPTIIP9K8zPgzxB3sR/3+j/8Aiq8XH0pzmnFNqx72WVqdOm1NpO/UxYv9cn1Fe8L0ryjT/BWsy3ca3MK28WctIXVsfgDkmvVlGBWuX05wT5lYwzOrCpJcjvYeKDRRXqnknk/xJ/5GVv8Ariv8jXM/xV6F478L3+o6gt9YATb1CNHkKRgdck4Nc1/whmvZx9h/8ix//FV81iaFSVR2T3PqcHiaMaMU5JaG78Kf9ZqP0j/9nrktd/5Dl9/18S/zNeheAtAu9HhuJL4Kks5X92pB2AZ6kcd653xD4N1ZtXuJrOIXMUztIGDquNx5UgkdP8+ldVWjN0IpLVHLSxFNYqc29GclmvVPhp/yLKf9dX/nXEf8Ibr3/QPP/f6P/GvSPCukyaRo8dpNIHcEs2OgJ7ClgKc41G5JoMzr06lJKDTdzZooor2zwDjfin/yAYP+vlf/AEFq8yr2DxppEus6R5FuwEsb+YoP8RAPGe3WvPP+EN17/nwP/f6P/GvExtKc6nups+gy2vThSak0ij4c51/T8f8AP1H/ADFdD8UM/wBs2uf+eB/nR4b8H6rHrFvPexC2jgdZMl1YsQcgAA/zra8deGbvVZIruwxI8SbDESAWHPIJOO/eiFKaw7TQ6mIp/W4yurWPNa6v4Y5/4SKXH/Ps380ql/wh2v8A/QPb/v7H/jXUeAfDN9pd5LeagBC7IYliDBiQSCWODgdMf55yw1KoqibibY3EUpUGoyTOU8cf8jRe5/vL/wCgisSu38ZeFNUu9YkvLCJbiOfGQHVTHgAc5POfasX/AIQzX84/s9v+/wBH/wDFVNajUdRvle5rh8VRVKKclojq/hX/AMgm6/6+D/6CK7UVzngfRp9F0ox3TAyzN5rIBwmRjGe545/ya6SvdoRappM+bxUlOtKUdgooorYwCgUUCgR5/wDFj7unemZP/ZK4CvVvH2gXOtW0D2RUzW5Yqjcbs46E9DxXDf8ACF+If+gf/wCRo/8AGvExdKc6rcU2fSZfiacKCjKSTQvgL/kbLH/tp/6LavYa868F+FNSstZjvr+MW624IVdwYyEqV7E4Az/nt6LXbgoOFO0lbU8zMqkala8HfQUUUUV3HnBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUGig0AYHi3Wm0axV4k3SSkqh7A471xn/AAm+tf3of+/Yrc+KHFjZj/pqf5V5/nivlMzxdWFbli2kj6HAYelOipTimzvPCfi27v8AU1tNQVW84Hy2RcbSASc/hXcivJPA/wDyM1l/wP8A9AavW69XK6061G83ezPOzClGlVtFW0Cig0V6x5555rvjK9h1OaCxVEihYxnzFBJYHBP0zVH/AITfWf78H/fsVka5/wAhm/8A+vmT/wBCNUq+KrY6uqj97qfWUcLRdOPurY9Z0fxBHe6E+ovE0fkhvMUc8qMnFcZN451ZpGaHyUjLHarJnA+tavhb/kRNS/3Zv/QK4Ou/GYutGnTcXurs4sJhqTqTUo3szp4fHWrxyo0vkPGGG5VTGR9e1dlrPiBLLQE1KKIsZgvlqeOWGRmvJq7zxT/yIem/SH/0ClhMXWlTqNvZXQYvDU4zglG12ZH/AAnOs/34f+/Yq9oXjW+m1OGG/CyRTMIx5agEMTgH6Vxfaruh/wDIZsP+vmP/ANCFcVDG13UV5Pc662DoxhL3VseheMvEk2jLHDapm4lGQzDKqAeeO5rlv+E41n+/B/37q78T8/2haZ/55t/OuMFdGPxdaNZxjJpIxwWGpSoqUo3bPR/BfiefVrmS0vlUzAF1ZFwNoxxVbxb4tutP1RrOwVR5IG9pBncSARj6Csj4b/8AIxP/ANcW/mKp+N/+Rpvfqn/oC1s8VVWD5r63MVhqf1vltpa5Z/4TrWf70P8A37rtvB+uNrWnmSVNssR2PjoT6ivJq9B+F/8Ax5Xf/XUfyqcuxVadZQnJtM0zDDUoUeaEbM7aigUGvqD5wztd1BNK02a+dS6xLnaOpOQB/OvPf+E41n+9D/3wK7Tx1/yK979F/wDQ1ryevn80xNWnUUYOyse7ltCnVpuU1fU6qy8dail1GbtVlgzhhGnzfhXpa814Un31+te6r0FbZXXnWUud7GOZ0IUpR5Fa4uKXAoor2TyQxRRRQAUUUUxBRRRQAUUUUDCiiigAooooAKKKD0oA4LxZ4uu7HVHs9PRVMA+cuAdxIB4/CsX/AITrWv70P/fsVV8af8jRe5/vL/6CKxsc18nXxdWNWSTe59RhsHSdKLaR614Q1063YFpUKTQkJJ6E46iugrh/hb/x53n/AF1H8q7ivosJNzoqUjwMXTjTrOMRD1rP1vUl0nTZr11LrEB8o6kkgD+daJrn/H3/ACK159E/9DWtK0nGm5LexlRipVIxfVnFnx1rJPDwgf8AXMVNp/jzUUu0N4ElhzhlRAG+ork6E++v1r5aOLrc3xM+reDoOPwo9X8Y69JodnGYk3TTkhCR8q4xkn864z/hO9b/AL0H/fsVs/FMkw2P+8/8lrgB0rrx2Jqwq8sJWOLAYWnOipTinc9A8IeLrzUdWWy1AI3nA+W0a42kAk5/AVP4z8VXGlXi2VggEgAd3YAjBHAArlfAnPiuz/7af+i2q18Rv+Rlf/rmn8q0+s1PqvPfW9iHhaf1vktpa9hv/Cc61/z0i/79iuv8FeI5dbhljukxPDgswGAwOccdjXlua7f4V/8AHxf/AO7H/wCzVlg8RVlWSlJtGmOwlGFFyjGzRH4g8a30WrTQ2AjWKFjH+8TJLAkE1Q/4TrWc53w/9+xWPrX/ACG7/wD6+Zf/AEI1SrGri6qm9WdFHB0ZQV4rY9m8OasNZ0qO7EZjY/KwPqOuPatP+GuZ+HH/ACLcf/XRv5109fSYduVKMn2Pmq0VCpKK2TE4xWN4q1f+w9Ja5RN7u3lp6BiCQT7cVtVyXxP/AOQBF/18L/6C1LEScKblHsGHip1YxezZy/8AwnWs/wB6D/v2K0PDvjW+n1aG21BUkiuGEY2KFKsTwfcetcP2rS8O/wDIf07/AK+I/wD0IV85RxVRzjq9z6WvhKMacrRWx7XRRQK+rPlBO9cH4s8X3djqz2enqqeTxI0gB3EgHj6Cu9rx7xr/AMjRe/Vf/QRXnZjUlSppwfU9HLqUKtW01fQuf8J1rf8Aeg/79iu28Ia42taZ50qbJoj5cgHQkDORXkQr0b4X/wDIGu/+u5/9BFcWCxFSdS0pXPQx+GpU6XNBWMW+8fam95I1n5UcGflVlDH8T61Enj3WFdWfyWXIyPLxkfWuY7miuN4us38R2rBUVHWKPXpPEEK+GP7aELlNm4JxnJbbj864c+PNab+KH/v2K2Zv+SWD/rmv/o0VwHTpXZjMRVioqLtdHFgcNSlz86vZnX6b481BLyL7cEkgJw4RAGx6ivTFz3rwVD86/UV70nSunLqs6ifO72OTM6EKUo8itcdRRRXqnknFeNfFlxpN2tnYIBKAGZnAIAPTiuc/4TvWs53W/wD37pPiP/yMr/8AXJf5VzQHtXzmIxNSFRq/U+nwuFpeyi3FNtHqngvxFLrdtNHdIPPtyNzqMBs5xx26Vg+IfG9/Fqs8FgEjihYx5kTcSwOCf8Kf8Kf9bqX0j/8AZ65PXP8AkNX3/XxJ/wChGuirXqKhGSerOejhqcsVKDWiNn/hOta/56Q/9+xXdaX4givdAbVXjdUhRmkQYJJUZOP6dK8gr0Hw5/yTi/8A+uU/8jU4KvUlKSk76FY/DU4QTira2MaTx9q5lcxrCkZJKqUztHYZpYPH2rLMrXHkvGDyiptJH1rlKM1z/Wat9zv+pUOX4T13xFr40/QVv4Yy7TgCMHsSCQT+Arif+E91z+/b/wDfsf41seNf+RK0v/ei/wDRbVwHaujGYipCSUX0OHAYWlODco31O48OeNb641aG21BUljuGEYMahSjE8H3FbHjbxRJoxjtrNB9okXcHblVX6d+lefeHP+Q9p3/X1H/6EK6P4of8hq3/AOvf/wBmNVCvU9g5X1Jq4WksXGFtGin/AMJ7rn9+D/v3XTeBvFFzrFxLaXqr5yqZFdFwNuQMH3ya8zrrPhdn/hIJMf8APs380rPDYipKqk2b43CUoUZSirWPUscUtFFe8fMDGOOa8vv/AB/qb3khshHHb5+RXTLY9/fvXp8v3G+leC15uYVZ00lF2uevllCFaT51ex1CePNZV1ZzAy5GR5eMj616VpN6uo6fBdopUSoGwe1eGnpXsvg//kXLD/riP61nga05ycZu5rmeHp0oRlCNtTYooor1zwznPGviF9CtYvJj3zTkhCR8q4xkn864n/hPNc/56Qf9+xWz8V/+Yf6Zk/8AZK8/4rxsXXqRqWi7H0eAwtKdBSnG7Z6H4O8YXepastlqAVzMD5bRqBtIBJz9QK72vHvAP/I2WX/bT/0W1ewCuvBTlOm3J31PNzGlClWSgraDhRRRXcecFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABQaKKBGR4j0SHXLQQyuUZDuRhzg+471y/8AwruT/oJD/vwP8a740tcdbBUK0uaa1OmliqtJcsXocn4e8GppN+LuW5NxIg+TEezbnqevNdXRS1rRowox5YKyIq1Z1Zc03diGiiitzI43WPA8d5fSXNrdmESnc6lN3zHqRzVL/hXT/wDQT/8AIH/2Vd/RmuCWX4eUnKUdWdccbWjHlUjL07RbTT9LawjQtFIpD7ictkYPTpx6Vy83w7y7GHUCseflVockD3O4Z/Ku8pMACrqYOjVSjKO2xEMVVpycovfc4OH4eHzFMuolowcsFiwT9Du4rptS0S2vtKXT+Y44wPLKnldvC9f61rdeaUDAop4KjSi4xWjCeKq1GpSe2xwH/Cu3/wCgl/5A/wDsqu6L4Fjsb+O5uLo3HlEMqiPZ8wOQTya7KlrOOX4eMlJR2Llja0lyuRg+KPDkOuxoTKYZo+FcDIx6EZFc7/wrl/8AoJD/AL8f/ZV6BSZrSrgaNWXNNak08XWpR5Yy0Ob8NeFYtDled5zcTsNofbtAX0xk1X8ReDYtXvzeQ3H2eRx+8GzeGI4B6jHFdZRVPB0XT9nbQSxNVT9pzanAf8K6k/6CY/78/wD2VdT4d0KHQ7TyYXZ3Y7pHP8R+nateilSwdGi+aC1HVxVWqrTdwFFFFdZylLVLKLUrCa0nB2SjBwcEe4rjD8PG7amMf9cP/sq6nxVeS6doV1c2+BKijaSM4JIGf1rys6xqZ6391/39avFzCpQjNe0jd2PVwNOvKDdOVlc7Cx+H8aTxvc3vmxKcsgj27vbO6u6AxXjll4g1S0uUlW9nfb1WSRmU+xBNexL0rXLqlKcX7JW7kY+FaMl7Z37DqKKK9U84Q0Z9689+Ier3sGpRWdvO8ESxiT90SrEnI5IPTjpXK/2tqX/QRvP+/wC3+NeRWzOFKbhZux6dHLp1YKae57Zxilrivhxqd1fQ3VtdytMIdrK7kljnOQSevSu1r0KFVVoKoupwVqTpTcH0CiiqmrXDWmm3VwgBaGF5BnpkAmtZS5VdmaVy1mjNeLS61q0sxc6hcgsSSFlYD8ADxSx61qsMqyJqFwSpyA0jMv4gnmvH/tWne1mev/ZVS17o9poqppM7XOnW0743SxI5x0yRmrdeyndXPJaswpKWuF+I2q3dm1va2srRCQFyyEhuD0yKxr1VRg5s1o0nWmoRO4peMV4l/a+p/wDQQuf+/wA3+NdX8O9XvrjUZrO6neeIxmQGQlipBHQ+nPT/AOvXDRzOnWmoJM7K2XVKUHNs1fEfgyLVb9rqG6Nu7/6wFNwbj6jFZv8Awrh84/tT/wAgf/ZVn+N9Z1Aa3Nbw3UsEcICqInK5yASTjqawf7W1PvqV3/3/AG/xrhr18KqjvC7ud1CjinTTjOyser+HNCg0Oy8iJi7ty7nqxrWzXJ+AtUutQ0yQXcgkaFwisRyRjPNcHea/ql5cyTtezx7znZHIyqPYAGu+WNp0KUWlo9jhWCq16sk3qtz2fPOc8VT1Wyh1Oxls7gHy5Rg4PIwcg/mK8gXV9TRgV1C649ZWP9a9X8M3kupaJa3VwB5siktgY5yR/StKGMhiW4WM8Rg54VKd+pyv/Ct37amP+/H/ANlUtl8O44p43ur0zRqcmNY9m76nca7kClq/qFC9+UTxte1uYxvEmgQ65aCKR2ikjJMcg52k9eOhrl/+Fcyf9BT/AMlx/wDFV6EKSrqYSlUlzSWpnTxVWkuWL0OS8N+DI9H1D7bLcm5kQER/JsC5GCevPHH+eJvE/hKLXJ1uEnNtOBgtt3bh9MiunPSvOfiFrV9Dqq2VtO8ESKHPlEqxz7isMRTo0KPK1pc2oTr1611LW25J/wAK4b/oJ/8AkD/7Kuj8K+HYtCgkCymaaX77kYGB0AGTjFeX/wBral/0ELv/AL/t/jXc/DjVry/W5t7uVpRDtZXbJbnPBJ+lcmEq4d1EoRszsxdLEqm3UldC6z4EjvtQlure8aASnc6lN3zZ5Ocjj2qr/wAK4k/6CY/8B/8A7Ku+Ipa75YKjKXM0cEcdXjFRUjP0fS4dJsVtLXO0ckscknua0O1LRXXGKiuVHLKTk7sTtWZr+kw63YNazsU53Kw/hbsa1KKJRUlZijJxalHoeen4cP8A9BIf9+P/ALKr2ieA47DUIrq4u/tHlHcqiPb8w6EnJ/KuzNFcscHRi+ZI65Y2tJcrYUUGiuw4wrkvEngqPVr83kFybd5P9YCm8NgYB6jFdbRWdWlCrHlmi6VWdGXNB2Z57/wreT/oJj/vx/8AZV1fhzQ4dDsfs8TtIzHdI7fxHGOnateisaeEpUneKNquLq1labODvPh0sly72t8YoicqjRbtvtndzUcfw5bcvmakWTIyBDg4+u6vQaKn6lRvexosdXStzGRLotm2hnStjLbFdvDHI5znPrnn0/CuT/4Vu2eNUB/7d/8A7KvQ6K0qYanUtzLYyp4qrSvyvc4Oy+HUcVykt1emeNTkosezd7feNd0OKUiuO+I2qXen2tvFaS+T55YMy8NgY6Ht1qOWnhYOUVoXzVcXNRk9TsM0teIf2vqX/QRvP+/7f410HgbW9RfX4bSa5kminDBhK5fGFJBBJ4PFc9PMITko23OqrllSnBzutDp/FXhGDWrhbhJzbzgbWbbuDDtxkVi/8K4k/wCgoP8Avx/9lUXxA1y/g1MWVvO0EaKJMxEqxJ9SD+lcv/a+pf8AQRvP+/7f41zYipQ9q1KOp04ahiZU04Tsj1Hwt4bh0C3dUkM8smPMcjAIGcADJx1rJ1nwDHfX8lzbXhgEpLspTf8AMTknORx7Unw01W8v4rq3u5TMsBUo7kl/mznJPXpXaiu+lTpVqS00PNqVK2HrP3tTz3/hW8ucf2mP+/H/ANlXW2WhWdjo7aZGrNA6FXyxy2Rg/TNa1Fa08NTpu8UZ1cVWrW5nsefT/Dgl2MepFY8narQ5I9MncM/lRB8NwJkafUS6A5ZVh2k/ju4r0Gk4qPqdHsa/X8Q1bmMbWdBtdU0pbCQMkcePKIyShAwD78cc1y5+Grf9BQf+A/8A9lXoVGKuph6dR3kjKniqtNWizitE8BxafqEd1c3ZufKIZFEez5h0JOea0vFPheDXRHL5phnjG1XxuGM5wRkZro64H4k6zf2lxBZWkpgjdPMZ0JDHk8ZHbis6sKVGk7rQ1pVK1esnzakH/CtpP+gov/gP/wDZVv8AhbwnHoUstw07XE7/AChsbQF44xnrkdf/AK+fM/7Y1P8A6CF3/wB/3/xrrvhvrF9dalLZXVw80flGUGRizAgqOp7c9P8A6+eLD1aEprljZnoYujio0m6kro9CzxS54ryzxvrmpDX57WO6khigAVRExTOQCScHk1g/2xqn/QSvf+/7f41tPHxjJxsc9LK6lSCmmtT2888EcGuDvfhyjXLvbX5ihY5VGj3FfbO78q0/h1qdzqWjv9sk8x4JPLDH7xGARk9zzXV9a6XCGIgpSRyKdXCVHGMtTz2L4bMrhn1LcueQIcH891dvp9rHYWcVrACI4VCqCcnFW+9Y3jG+m0zQLm6tiBKgAUkZAJYLn9acaUKCckgnXrYpqE3fU2A2RS14d/bGqHpqN4P+27D+tWdP8QatZ3aSi+mkA+8kshdW/A1yrMIN2aO55VUtfmR6Z4q0CHXrVEkdo5IiTG45xnGcjuOK5f8A4Vs//QUH/fj/AOyrR+JOrXenWltDZy+UbgsGYD5sADoe3WuA/tjVP+gjef8Af9/8azxNWgp++rsvB0sRKknTlZHonhjwVFo2oi8luTcyICI8Js25BB7nPBxXXDpXl/gTW9Rk1+G0nuZJ4pwwYSuXIwpIKknjp/nivUB0rtwsoSh7isjgxsKkKtqru7CiigUV1HGFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAgoqhrWrW2j2hnumwP4VHVj6CuF1Dx3fzTZso4oYhnhxuLc8H2rgr42jh3ab17I6qOFq1tYrQ9Kory3/hN9Y/vxf9+xR/wm+sf34v8Av2K5f7YodmdP9mV/I9R5ory7/hONY/vxf9+xR/wnGsf34v8Av2KP7Zw/mH9mV/I9RNJXl/8AwnGsf34v+/Yo/wCE41j+/F/37FP+2cP5h/ZlfyPUKK8v/wCE41j+/F/37FH/AAnGsf34v+/Yo/tnD+Yv7Mr+R6hRXl//AAnGsf34v+/Yo/4TjWP78X/fsUf2zh/MP7Mr+R6hTq8t/wCE41j+/F/37FIfHGsf34v+/Yo/tnD+Y/7Mr+R6lmivLP8AhN9Y/vxf9+xR/wAJvrH9+L/v2Kf9r4fzD+zK/kep0V5Z/wAJvrH9+L/v2KP+E41jP34iP+uYo/tfD+Yf2ZX8j1SiuR0Dxpb6lOlrdR/Zpn4XLZVj2GfU9v8AGutHQV6NGtCtHmg7nDVpTpS5ZqwtBooNbGRg+Of+RYvfon/oa15Ka9zmjWWNkkUMjDBB6EVzh8DaOf8AlnKP+2hrxsfgamIqc0H0PVwONjh4OEl1ueYp98V7ov3RXP2PhDS7G6juIoWMkZypdsjPrXQjgVpl+Elhk1J7mePxMcQ049BRRRRXqnnHl/xJ/wCRhX/rgn8zXL4r2TWdEstZjjW+jJMZypU4I9s1mf8ACDaL/wA85f8Av4a+dxWW1atVzg9Ge7hsxp0qShJO6MT4Wf8AHzf/AO6n/s1ehCs/SNJtNJt/Is02ISSe5JPqafdanZWbhLq7ghcjIWSQKSPxr1sLT9hRUZvY8vE1Pb1XKK3LtZviP/kBX/8A17Sf+gmm/wDCQaR/0ErP/v8Ar/jWkCrrkHINbtxqRaTMUnB3aPCelFepTeCdGlmeUxSKzEnCvgDPoKdbeCtIglSURyMVYMAzkivnf7Lq817nv/2nStazNPQP+QJYf9e8f/oIrRqJisaFmbAXkk8AVR/t/Sf+glZ/9/1/xr6NNQik2fPtOTbSNOvOPil/yEbL/rm3867q11Oxu2KWl1BOw5IjkDEflVfxBZafeWBXVCiQKQTI7hdn4np6VzYqH1ii4xZ0YWp7CqpyR4yRXV/DT/kPyf8AXu381rW/sPwb/wA/8H/gWv8AjW94asNLsYJP7HkSVXb53WQPyB0yPTPT3rysLgpU6qk2j1MVjoTpOKT1PO/G3/I03v8AvL/6CKxiBXq3iPTNEu7iKXV5Y4JOQrNIELY+vXr+tZI0TwiTzqEP/gUP8azxGXylVclJasujj4RppOL0Qnwx/wCQdef9dR/6DXAAYFe1aTa2lpYRR6fs8jaCrIchvfPfPrWXf+D9KvLqS6kjdXk+ZtjYGe5/HvXXXwM6lGEIvVHNQx0IVpzktGeUV654H/5Fiy/3W/8AQjVVPA2jhg2yU47F+K6SONYkWONQqKMADoBWmBwU6E3Ob6EY/GwrxUYIeKWkFLXrnlAKSo55ooI2kmdY0UZZmOAPqaof8JBpP/QSs/8Av+tS5xjuxqLeyNSvKfiJ/wAjM/8A1yT+Vel2Oo2d8WFpcwzlMbvLcNjPTpVXXNBsdaRBeRnKHIZThvpn0rkxdJ4inaDOvCVvq9XmkjxjvXc/Cn/j4v8A/dj/APZq2v8AhBNG/wCec3/f01saRpdrpNsILNNiZLEnkkn1NcGEwE6dVTk9jvxeYQrUnCK3NCk4qndarY2kix3V3BC5GdskgU49eaj/AOEg0j/oJ2f/AH+X/GvZc4rqeNyS7GlRSAgjIPBpaskKKKZNKkSM8jBUUElj0AFADqKzDr+kf9BK0/7/AC1Na6nYXbFLS7gmYDJWOQMQPwqFUi9inCSV7MvdqKB0oFWQFFFFAwooooAKKKKACiiigBK4H4r/AHNP+sn8lrvjVPVNOttTtWt7yMPG35g+oPY1z4im6tNwXU3w9VUqim+h4dW94D/5Guy/7af+i2rt/wDhA9F/55zf9/DWho3hvT9HkeSzjbe/BZzuIHoPSvKo5fONRSb0TPYr5lSqU5RindqxwPxH/wCRlf8A65J/KuZr1/xJp2kXkEZ1d44kVsJI0gTBPbJ/lWD/AGF4O/5/4f8AwKH+NGIwU3Uck1qVhsdCFJQaenYg+FGfN1HHpF/Jq9CFZXh200+z05U0oxtASTvVt2457nv6VrV6uGpulTUWeNiqvtarlawUUUV0HMJzRWdNrmlRSNHLqNrG6EhlaZQVPoRmiLW9MuJFih1C1kkY4CrKpJ/DNQ6kV1L9nLsaVFIOlLVkBXmPxSz/AGxa5/54/wBTXp1ZPiKx028siNWMaQqQfMdgmw5/vHpXLiqftKbidWEqqjVU2rni4rrfhj/yMUv/AF7N/wChLWp/Yng7/n/h/wDAtf8AGuh8MafpNlbyHRjHIjv80iSB+fTPtn9a8zDYRxqJuSPXxePhUouCT1POPHH/ACNN9/vL/wCgisOvY9Z8NadrM6zXsR8xRgMjYJHvVD/hAdFzjZP/AN/DVVcBUlNyT0YUcypwpxg09EU/hV/yCrv/AK+P/ZRXbdqqadYwafaJbWsYjjQYAHf3+pqO41nTbaVorm+toZFxuSSZVIz04Jr1KUfZU1B9Dxq0/bVHOK3Lxrn/AIgf8ine/wDbP/0YtaEeu6VI4SPUbRmYgKFnUkn86uzxRzwPFOgeOQFWUjgj0qp2nFxT3RFNunNSa2dzwY0sf+sX/eFeg/2H4P8A+ghB/wCBY/xq7omieGI79JLCeGe4T5lHnh8e+K8aOClzfEj6CWYx5X7rM34sdNO+sn/slcBXt+uWVje6fJHqWwW4GWZyAF98npXKHQfBn/P/AAf+BQ/xrbE4RznzJo58HjY06Sg09OxzPgDjxbZf8D/9FvXsHArnvDGlaFZyzS6PJFO5AV2WQOVHpkdM/wBK6E5rrwlJ06dn3ODHV1Xq8yVrKw6igUV2nEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAAaSlNJSewHj3iTU31TWJ595eIErH1xsHAwO3qfeswGmk56UV+d1qjqzc2fa0YqnBQQ6iiiszQSiiijlC4UUUVXKFwoooo5QuFFFFHKFwoooquULiUUUUcoXCiiilYAr1XwRqZ1HRY/Ml8yaL5H6k+xJ7kivKq9A+F3/Hnd/8AXUfyr2Mpm417LZo8zM4KVHmfQ7cUUDpRX1x8yFGKKKBBiiiigAooooGFFFFACV4t4gkaXXL3zXZ285xknsGIA/AcV7TXi/iOGSHXb0SoVbzmYZ9CSQfyNeJmzapK3c9bK7e0foZ2K9R+HMzyaAFkdn2SMq5OcAY4HtXmHevT/h3DLDoQEyFN0hdfdSBg1xZVze2d+x25ko+yVu51FFFFfUHzhynxKkkXQkWN2UPMFYA/eGCcH8hXmdenfEeKSXQ0MKF/LmV2x2XBGf1FeY18vmd/b6H0mWcvsnfuX/D0kkWu2LROUJnRTg4yCwBH4jiul+KEjm7s0Dts2MxXPGc4z9a5vw5BJPr9gsKFyJkJHooIJP4AV0vxOgkM1nMFPlhShbtknOKmg39UnbuFdx+uQt2OINdX8M3ddclQOQjQElc8Ehlwcfia5Wus+GcMj63NMEzFHAVLehLAgfoawwLl7eJ0423sJGd45kd/FF2rOWEe1VBOdo2g4H4msM1veO4ZI/E108iFVk2shJ6jaB/MVg1OIcvbS9S8Ny+xh6Hovwvllk065V3JVJQFBOcZGePSu1rjPhhbyxaXcSyqQssmUz3AGK7Ovp8Ff2MbnzOMt7eVgooorsOUKDRQaAOG+Kc8i2loiOQjM+5QeGwBjNefV6H8ULeSSztZVVikbtvI6DOBzXnlfL5hze3Z9Pl3L7BG/wCA3ePxRaLG7KrBw4B6jYTg+vIBr1qvJfAUUkvie2dVLLEHZz2AKkZ/MivWq9PK7+yd+55mZ29tp2FoPSig16h5Z4p4hd5dbvmdy7LPIASc4AYgD8BxWfmtDxDFJDr18kybGaZmA9QSSD+IrPr42rzc8k+59pRUVTi12PVPh9M8nhyMyszbXZRk5wB2FdNXNfD+3kh8ORLMm0szMvuD3rpa+rw9/ZRv2PksTb2srdwNcn8TJXj0BVV2UPMqtg4yME4/SusNcn8SoJJdAQxx7xHMrv7LgjP6ilib+ylbsVhbe2jfueZVoeG5JItfsWjcqWnRSc9iwBH4jis+tHwxBJPr1iI1LMs6scdlBBJ/ACvl6HN7WNu59XX5fZSfke0UUCivsT4sWiiigAooooAKKKKACiiigAoxRRQIKKKKQzyn4kSSN4h8tnYxpGpVCeFJ6kCuZrqPiVBKniDznQiOSNQre461y9fL4rm9rK59dg7exjY7v4USOTfxs5KKUZV7Andn+Qr0HtXAfCqGRV1CVlxGxRVb1I3Z/mK77tXu4K/sVc+ex9vrErB3rO8QyPHod/JExSRLeRlYHBUhTgg1o96z/EMLz6HfQxLukkgkVR6kqcCump8JyU/iPEsdeeP1JoyVwQ2D1zTiNpYMOR1zQFLFVRdzNwAK+T94+293lPbtGd30y1dyWZoUJY9SSOTV6qWjRtFpltHIMOkSKw9CFFXa+tjsfEz+JhXmnxUmc6laxeY3l+VuKZ4znGcetelnpXm3xSt5RqNtceWTCItm7/ayTiuTG39k7HZl7Xt1c4muv+FzumuzIGZY2gLFM8Ehhg/hk/nXIV2HwvhkOtTT7G8tYCpPYEkED9DXj4O/tkfQY7l9hI9PpKUUhr6Q+RI5D8r/AErwaV3nld5XZ2ZsszHJJ7kmveZB8rfSvCJYpLed4Z1aORGIYHqDXlZivhPbym15X8hn6CvSL24mHw0EnnP5hgRS2eTlwCM/TivOD0x3r0q/tLj/AIVr5HlHzlhQlO4w4J/QZrlwidp27HbjrXp+p5rUltLJBcRyRMUZWBDq2Cp9jUf1qazgkuLiOGBC7swAUd65I3vod8+XldzuvirM4gsIw7CN2csoPDEbcZ+mTXn1eg/FaCVrWxlVGaONnDEdATtxn8jXn1dOMv7Q4suUfYI6DwBI6eK7VUcqHEgYA8EbGOD68gGvXhXkXw/t5JPFVrIiErEJGc/3RsKjP4kCvXRXo4C/s9e55GaW9tp2FFFAor0TzAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKQ0tIamWwHhQFLRQa/OZbs+3Rc0ewbU9ShtEIUytyT2AGT+gr1PT/AA/ptnAsMdpE4HJZ13En15rzrwP/AMjPZ/V//QGr1nvX02TUYSpObWtzwc0qTVRQvpYqf2VYf8+Vt/36Wj+yrD/nytv+/S1co5r3vZx7Hj88u5T/ALKsP+fK2/79LR/ZVh/z5W3/AH6Wrn40fjS9nDsPml3Kf9lWH/Plbf8AfpaP7KsP+fK2/wC/S1c/Gj8aPZw7BzS7lP8Asqw/58rb/v0tH9laf/z5W3/fpaufjR+NHs4dg5pdyn/ZOn/8+Vv/AN+lo/snT/8Anyt/+/S1cop+yh2Dml3KX9k6f/z5W3/fpaP7J0//AJ8rb/v0tXeaKPZQ7IOaXc868e+HYbALf2YCRyNtkj7bjyCB+fH5Vx1el/En/kAj/rsv8q80r5HM6cadf3T6XLpynS95hXoHwu/487v/AK6j+Vef16B8Lv8Ajzu/+uo/lTyr/eEVmP8AAZ24oNAor7E+WK93cRWtvJPPII44xlmPQVzJ+IGlg48m6J/3F/xrQ8cf8ixe/Rf/AENa8l714mY42ph6ijDsergcHCvByl3PULLxxpl1cpAVmhLnAaQKFB9yDXT9K8JT74+te6r90Vtl2LniVLn6GWPwscO1y9R1FAor1TzwooooAK5PXvEehW96YLu2+1zRjBZYlcJ7ZOP0rqjXi2t/8hm+/wCviT/0I15eY4h0IKy3O/A0FXm03sdh/wAJT4a/6Bjf+A6f411+n3dteWyT2civE3Qj+XtXidemfDb/AJAL/wDXdq5suxcqtRxaWx047CRo0+ZNnViigdKDXuHjlPU722sbR575wsQHOe/tXI/8JX4a/wCgW3/gOn+NXfib/wAgKP8A67r/AOgmvNa8PH4udKpyxS2PZwODjWp8zbPTNC8R6FdXwhtIPsczj5S0Spv9sg9frWn4i1XT9MtQ2oqJAx4iADFvwNeW6H/yG7D/AK+Y/wD0IV0nxP8A+P2y/wBxv50qOMm8NKpZXuKpgoxxMaabsy1/wlfhr/oFN/4Dx/41u+GdZ0vU0kXTYfsxjOWiKqpOe+B19K8nxXU/DT/kPyf9e7fzWssLjZ1KqjJI3xWBhCk5pvQ6jxLr2j2NwkN/D9qkwTtCK+z65PH+fasn/hK/DWc/2U+P+veP/Guc8b/8jPe/7y/+gisaoxGOqKo4pLRl0MBCVOMrvVHs+i6jZajYpLYEeUFA24AKY7EdsVkXvjrSrW6khC3ExQ4LRKCpPsSRWf8ADLH9m3uf+eo/9Brz7r1rqr46pCjCUbXZy0MDCpWnBt2R6WvxB0xmCmG6XPcquB+tdRbzx3MCzQuHRxkMOhFeGV674HOfDNl/uH/0I1pl+NnXk4yIx2DhQipRN0dKKBRXsHlEUkSTIUkUOp6hhwfwqt/ZOnf8+Nt/36FXjSVEop7oak1sV7aztrUk28EcW7rsQLms3XvE1hohRblnkkfpHEAWA9TkjitqvKviN/yMh/65LXJi6zoU7wR14SisRV5Zs6f/AIWHpf8Azwu/++V/+Kra0PWrPW4DLZuflOGRxhlPuK8axXb/AAsx9ov8+kf82rz8Jj6lWooS6noYvL6dGk5xbujU1zxHoNremC7tTdTIAGZI1YJ/s5JHT2/nmqP/AAlvhn/oFt/35j/xrjtc/wCQzf8A/XzJ/wChGqYrCpj5qbskdFLL6coJts9w0+7gvbWO4tXDxOMqRVjvXM/Dj/kWk/66N/OunFe/Rm5wUn1R8/WgqdRxXRiimyIsilXUEHqDTqK1Myj/AGTp3/Plb/8Afpf8KfDY2lsxa3tooyRglECkj8Ks0VKhHsVzPuZWua/ZaLEr3bksfuxp98++Kxf+FiaX/wA+95/3wv8A8VWL8Uf+Qvbf9cf6muOrxcVj6tKo4Rtoe3hcBSq0lOTep7BoXiKy1veLUurxnlJAA2PUYPIrcry74Z/8jBL/ANezf+hLXqNelhK0q1PmkebjKMaNVwiFFFFdZyBRRRQBXu7mKzgkuLhwkUY3Mx7CuWPxD0kf8sbv/vlf/iq0PH3/ACKl7/wD/wBGLXkZxjpXlY3FzozUY9j1sDg4YiDlLuep2HjvS7y6SDbPCXOA0qqFz7kE11IrwaL76fWveE4ArTA4mVdPmMsfhY4drl6jqDRQa9A8453xNrek6aI49SQXDsciMKrEf7RBxisP/hLfDP8A0CH/AO/Ef+NY/wARv+Rkb/rkv8q5fFeDiMZOFRxSR7+GwMJ0lJtnsvhvVLDU7IvpqeWiNhotu0ofp0962a8++FH+s1H/ALZ/+zV6CK9bC1HUpKTPIxVNUqrigooorpOYoSaXYvIWktIHZuSxiUkn1JxSx6ZZRuHjtYFdejLGAR+NXqKnkj2L55DUXAp1FFUQFYfiXWNO0y2C6kFlV+kRUMW564PpW5XmfxS/5DNr/wBcD/M1zYqo6dNtHXg6SrVVBl7/AIS3wz/0CW/78R/41u+GtZ0rUkddNj8goctCUCn/AHsDg+n+RXkOK674Y/8AIwy/9erf+hLXnYfFSlUUWketi8BClSc03odjrfizTtHuRbTiSWQjJEYBx6Zyazv+FiaVn/UXeP8AcX/4quO8b/8AI03v1X/0EVicVNXHVYzcdNGOjltKdNTbd2j23StTttXskurR90b9QeqnuCOxqSXTbG4cvNaQyOerOgJNct8K/wDkEXX/AF3/APZRXaV6tF+0gpSPFrQ9lUcIvYoppOnxsGjsbdGHIZYlBH6VNdXENnbyT3LrHEg3Mx6AVPXP/ED/AJFO++if+hrTnanFyS2RFO9Sai3u7GGfFvhj/oGH/vxH/jVvR/FXh6S9jjhtPscjjCyvEqj6ZBP+FeZ05Pvr9RXjRx077I+jlltPlfvM95lhjmjKSqrq3BVhkGqn9kad/wA+Nt/35X/Cr1LXu2T3PmeZrYrW9nb22fs8EUW7rsQLn8qsCloppJA22FFFFMQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUABpD0pTSHpUvZgeF0Gig1+by3PuIm14H/AORns/q//oDV6yPvV5N4I/5Gez+r/wDoDV6yPvV9bkn8B+p85mv8b5C0nQU6uR+I97Lb6ZHHCzKJnKttOMjHSvWxFb2NNz7HnUaTqzUF1Nxtc0pHZX1K1VgcEGVeP1pv9v6T/wBBO0/7/L/jXj3U0V87/bc/5Uez/ZMf5j2L+3tJ/wCglaf9/l/xo/t7Sf8AoJWn/f5f8a8doo/tuf8AKg/smP8AMexf29pP/QStP+/y/wCNH9vaT/0ErT/v8v8AjXjtFH9tz/lQLKY/zHsX9u6T/wBBK0/7/r/jVqzvba8QvazxzKDgtGwYZ/CvE61PCt5NZ67aNCceZIsTDsQxAOf5/WtqOc881GUdyKuVqEHJS2PYaDSDpS19GeKcp8Sf+QAv/Xdf5GvNK9L+JP8AyAk/67r/ACNeaV8hm3+8fI+lyz+D8xK9A+F3/Hnd/wDXUfyrz+vQPhd/x53f/XUfyqcr/wB4RpmP8BnbiigUGvsD5YyvE1lJqOiXNtBgSuo25PUgg4/SvK/7D1Uk/wDEuuuP+mTV63q1/FpthNeTA7IhnjqTnAFcIfiDfdrW3x9TXiZjTw8pp1W07HrYCpXjBqlFNXMax8O6pc3ccP2OaIMeZJI2VVHqTivYFORxXn2n+Ppmu0W+ghW3JwzJnKj16mun8T67FoliJCu+aTIjT1Pv7U8C8PRhKVOV11uTjfb1ZxVSNn0sblFea/8ACwdR/wCfW3/X/Gtjwv4vk1S/FrdxJFI4JjKA4JHUGuuGY0KklGL1ZhLA1oRcmtEdlRQOlFegcQ1j1ryjxFoGpxaxctHaSzpK7SK0SlhhiTj2I9K9X6fhXC6542ktNSlt7GBJEiOxmkyCWB5xyOB0rzMxjSdNe1dtdDuwMqkZv2Sucj/Ymrf9A67/AO/Df4V6X4L0240vRhDd7RK7mQgHOMgcH3rlP+Fg6h/z62/6/wCNdlpet21/pD6kuUjjVjIGHK7Rk/pXHgIYeE3KDbZ1Y6eInBKpFJeRr0V51P8AEC885xDawGLJ2ls5x2zikg8f3azJ9otofLz823Ocd8Zrt/tKhe1zl+oV7XsdN4402fVdF8q1AZ45BJs7sACMD35rzb+xNV/6B13/AN+G/wAK9Q1nXYdO0ZNQ5dZgPKH94kZFcf8A8LB1H/n0t/1rkx0MPOalUk07dDqwMsTGDVOKauUfDnh7VJNZtnktZYI4ZFlZpkKjAIOBkcmuh+IejXt/9nurWMyiIFWRcljk9QB1qPQPG8t5qcVrfwxxpMdismch88Z9j0rueoq8Nh6FSjKEG7NkYivXp1lOokmjxf8AsTVP+gdd/wDfg11Xw90a+tb+a8u4Ht4xGY8SgqxJIPT046//AF67/FGK1oZbTpTU02TWzGpVg4NLU8y8b6FqD65Lcw28k8c+CPKQtjAAOcVhf2Jqv/QOvP8Avw1dx4o8YPpeoizsokkeMZlL5wMjgdqyP+Fg6hnP2S3/ADNedXpYX2j5pO9zuoVsV7NKEVax0HgXSrnS9LkN2ux53DhD1UYxz6GuEvfDuqWlzJB9jmm2HAeONmVh65xXpfhfXI9csPOC7ZUIWRewb2rYwK9J4OlXpRUXt1PPjjKtCrJtavc8WXRNVdgq6ddZJxzCwH54r1fw3YyabottaTEGSNSGx05JP9a0sClrXC4KGGbkndszxONniUoy0sLRRRXecQUVheKteXQrMSBfMnkJESHuR1rkf+Fh6j/z6W3/AI9XHWxlKjLlk9TrpYSrWjzQWh6XXnfxB0O/n1IXtrA88boEIiBZlI9QO3vWh4V8ZSapf/ZL2NIncExbM4JAJIOfb+VdkQDUyVPGU7J6Dj7TB1btani39i6r/wBA67/78t/hXb/DvSLuwjuLi7jMXnbQqMMMMZ6j8a7LFHFZUMvhRmpps2rZhUrQcGjybxJ4e1OHWrox2Us6TStKskSFhhieOOh9R/Ss7+xNV/6B13/34P8AhXX6944ms9Skt7CCN44SUZpM5LDrjpx2rP8A+Fh6jnP2W3/I/wCNebUp4VzfvPc9GlUxagrRWx2Hg7TptL0SO3udolyXIH8Oe1bdZNhrdve6KdSBKxohZxg5XAyR71yE/wAQ7ze/k2kPlZ+TdndjtnHevYeIo4emk3pbQ8hYerXnJpa31PRSRTq83tviFeecv2m0hEP8WwHd+Ga67Wtdh0/RRqCnesgXyhg/MWGR+nNVTxdKom4vbcmphKtOSjJb7G1Qa8z/AOFh6h/z6236/wCNaHh/xxLe6pDa3sEaJMQismchj0zz0qI46jKSinuXLA14xcmthfiJot7eyxXtpEZ0jTYyICW79h1HNcb/AGJq/wD0Dbv/AL8NXo/i3xKNECRRIJLmQbgrZ2hc4ycVzH/CwtQ/59bf/wAe/wAa8/FU8M6jc20z0MJUxSpJQSaLnw80W+tb+a8uoHt4xEYgJFKsSSDwPTjr/wDXr0GuS8H+KW1qWa2uYljmQb12Z2svAPXuDUHinxlJpWofY7KFJXQZkMgOBnkAYI7V3UalGhRvfQ4a1OtXrNNanaUV5l/wsHUP+fW3/X/Gu08Ma2ut6eLgIUkU7JF7BsdvataOMpVpcsWZVsJVox5po2aKBQa6zlMjxXYS6nodxa2+PNcAruOASGBx+OK8oOhasP8AmG3Z+sDf4V7YaMCuHEYONdqTdjuw+Nnh4uMUeN6f4c1W5vIojZTwAnl5Y2VQO5JxXsi9BRgelYXizX00G0V9u+aUkRr24xkn86dKjDCRbb0FWr1MbNRtqb9BrzL/AIWHqX/Prbfr/jW14U8Yvq2oizvYkjkcExlM4OASQefQURxtGclBPVhPA14RcmtEZnxA0LUJtUF7bQPcRuoTbEpZlIHcelcv/Ymr/wDQLu/+/B/wr0Dxh4tOizJa2sayT/efeDtVe34msD/hYeo/8+tt+v8AjXn4inh/aNylqejhqmKVJckU0bPw30m8sIbq4vImh88qFRxhuM5JHbrXZiue8H+IhrtrL5iCOeEjeq5xg524/KsPXfHc9pqU1tY28bxwHYzSf3s4OOld9OrSoUVZ6HnTpVq9Zq2p31FeZ/8ACw9Rzn7Lbfk3+Ndtp+u2t7op1JdyxIhaTI5XAyRWlLFU6rtFkVcJVo251ua1FeazfES8Ej+TaQ7Cx2785x2ziltviLdmZftNpD5X8WzduH0zUfXqN7XNP7Pr2vY9JorE17XodM0db9fnEgURDB+YsMj6cVx3/CxdQ/59LX8z/jV1MVTpuzMqWEq1leCPTK4L4jaLeXs8N7ZxGdETy2WMEv1znA6jmnaD47kvdQitb6CONZiEVo8/fJwM+xrU8XeJk0VY4okEly4yA2cAZ6ms6tSlWpN30NaVKtQrJJannH9iar/0DL3/AL8NXWfD3RL60v5r26heCPyzEBIpVmJKnIB7cdf/AK9VP+Fhah/z7W36/wCNdD4O8UNrc00FxEqToN42j5SnQ8+oJ/WuLD06HtFyvU9HFVcU6TU4pI5rxtoOpNrk11Day3EU4BBhXdjAAIOKwf7E1b/oGXn/AH4avbscUYrpnl8Jycrs5aWaVKcFBJHMfD7S7nTNJdbtPLkmk8wIeqjAAz6Hiunpp4rzvUfiFcLeSCxgheAHCGQNlh69q6JVIYWCi2ckadTFzcoo9G71k+LLCTU9AurW3IEkgUrnoSGBx+OMVxUfxGvg6+baW+zcA23Oce3Ndpca1bQ6CdWJYwbA4GOeTgD8+KSr060ZJPS2pTw1WhKLktb6HlJ0LVs/8gu8/wC/LVY07w3q9zdpH9hmgXPLyxlVA/Gtk/ETUO1pbY/4FVjS/iFKbpE1C2iSBjgvHnK15caeGUviZ7Mq2LUX7qPRBS1z/izxCug2iPt3zSkiNT046k/TIrkf+Fial/z62v8A49/jXq1MVTpPlkzxaWDq1lzQR6dRXF+FPGkmq6j9ivYUikkB8opnDEAkg59hmuzranUjUXNF6GNWlOjLlmtRaKKK0MgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooADSHpSmkPSpezA8LoNFBr83lufcRNrwR/yM9n9X/9AavWR96vJvBH/Iz2f1f/ANAavWR96vrck/gP1PnM0/jfIdXE/E//AI8rX/rqf5V21cT8T/8Ajytf+up/lXZmP+7SObA/x4nn9FFFfCn1gtFFFUAlFFFIYVc0L/kMWH/XzH/6EKp1c0L/AJDdh/18x/8AoQrah/Fj6mVb+HL0PaR0FKaB0oNfoh8Wcp8Sf+QCn/Xdf5GvNK9L+JP/ACAV/wCu6/yNeaV8hm/+8fI+lyz+D8xK9A+F3/Hnd/8AXUfyrz+vQPhd/wAed3/11H8qnK/94RpmP8Bnbig0Cg19gfLGD47/AORXvPov/oa15NivZ9asE1TTJ7J3KCVcbh1HOf6VwX/CA6qOk1mw/wB8/wDxNfP5phataopQV1Y9nLsRSpU3GbtqcqnDiu9+KAxDYf7z/wAhVGy8A3xuI/tk8CwA5bymJbHoMgCuo8WaB/blnGiS+XLCSVz9056g/lWWGwVZUJwa1drG2IxVGVanJPRXueUDrW54H/5Gmy+r/wDoDVd/4QDVs4860/76P/xNa/hbwdcabqa3t9NETECI1iYnJII5JA6D/PHPJhsDXVaLlFpJnRiMdRlSlFPdHbjpRSClr7E+YGnqa8V1n/kM3v8A18y/+hGvauK4HW/A93c6lLcWVxF5UzGTEpIZWJ5HAOR6f5NePmlCdemlTV7M9LLq0KM25u1ziK7vwt/yIepf7s3/AKBWd/wgWrf89bT/AL7b/Cux0rQI9P0OTTTM7iZWEjjAOWGDt9PxzXFgcLVhNuatodmOxVKpFKLvqeR0V1kvgDUxIwintmTJ2szEEj3GDj86WH4f6kZl864t1TI3FWJIHtkD+dcH1Gu38J3fXqNt0XvF/wDyIul/9sf/AEA1wtes634fj1HQo9OSRkMAXy2PPIGBn8K48+ANX/57Wn/fbf8AxNehjsJWqTTgrqxxYDFUacGpytqYOhf8huy/6+I//QxXtS9BXBaD4Gu7XU4bi+nh8uFhIBESSWByByBx6/5Nd6K7stozowfOranFmNaFaonAdRQKQ16p5p5D42/5GW+/3l/9BFYoFegeKfCFxf6m93YzR5l5dZWIGQMcYB4x/n0x/wDhA9WzjzrT/vtv/ia+VxOCqyqyaXU+nw+LowpJN9DZ+Fv/AB43n/XUfyrtqwvCmhf2FYmJ5TLNId0jDpn0HfFb1fQYOm6dFRkeBiZKpVcoi0UUV1HOJSnpSUUwOF+Kf+qsP96T+S1wIHNes+LvD7a7aRiKXyp4SWTP3TnGQfyrkP8AhANX/wCetp/30f8ACvncdhas6zlFXTPoMDiqVOioTdmUPA3/ACNVl/wP/wBAavXa4nwp4OudL1QXt/LETGCEWEk5JBBLEgdj2/pz2wr0MupTpUnGaszz8wrQq1eaDurC0hpRSV6JwHiWuf8AIYv/APr4k/8AQjVMdK7nXvAl3canLcWE0PlTMZCJSQwYnJHAOR/+r3NH/hX2r/8APWz/AO+2/wDia+Vq4Ks5uyPqKWPoRppNmt4d/wCSc33/AFyn/ka8+r1/TdBitNCbTGleRZEZJHHB+YYOPSuMl+H+prK4intmQE7SzEEj3GDj8668VhasowSWy1OTB4qlGc3J2u7nJ13njDjwLpn1i/8AQDVGH4famZV+0XNssWfmKsWIHsCB/Ous1rw8moaAmnRyFDAF8pm5yVGBu+velhsNVUJrltdaDxWKoznTlF3s9TySr/h7/kPWH/XzF/6EK3P+Ffatn/XWn/fZ/wDiav6B4Hu7XVYbm+nh8uFg4EJJLMDkDkcD/PvXNSwdZTjp1OurjqLhJKW6KvxP/wCQvb/9cP8A2Y1x9eoeMfC8mtvHPbThLiNdm2T7hXPqBkHn3rm/+Ff6x/z1s/8Avtv/AImtsXhqsqrlFXTOfB4ujCiozlZob8M/+Rik/wCvdv5rWf43/wCRovv95f8A0EV2Xg3wpPotzJdXkqtKy+WqxElQvBJJIBzkf/rzxU8U+DLnU9Te8sJowZR+8WYkcgADBAPBH+fTZ4Wr9WUbamUcVSWKc76WPPRXpHwu/wCQVc/9d/8A2UVhD4e6t/z2s/8Avs//ABNdr4R0M6FppgeTzJZG8xz2BxjA9uKnAYarTq801YeYYqlUpcsHc3BRQKK+gPBCiiigArgPit/zDvrJ/Ja7/Nc74y8OnXraLy5fLmgJKZ+6c4yD+Vc2Kg50nGJ1YSoqVaM5bHkmK3vAf/I02X/bT/0Bqvf8K/1fOPOs/wDvtv8A4mtjwp4NudM1Rb2+li3RAiNYiSCSCCTkDseg/P18KhhKqqxk1sz38TjqEqMop6tGD8R/+Rkb/rkn8q5oCvS/GPhGfWbtLuxljWUgKyynC4HcEAnNYH/CvtYzjzbT/v43/wATV4rC1XUbSumyMLjaEaMYylZpF74Vfe1H6Rf+zVyOvf8AIYvv+vmT/wBDNek+DPDcmhQTm4lDzTkFgg+UAZxjuTzz/knD17wNeXWozz2M8PlzOZCJSQwYnkcA8en+TW1bD1Hh4wS1Rz0cVSWJlNvRnC4r0Hw5/wAk6vv+uc/8jWR/wr/Vv+e9p/323/xNdtpmgRWWgtpXmvIkiMrv0J3DBx6frU4LDVYSbkraDx2KpTilB31PIOtFdZJ8PtTWVhFcWzxhiVLMwJHuMHH50sHw81JpFE9zarFn5irFiPoCP61yvCVebY7Vj6FtzR8bf8iTpf8Avxf+i2rgD0r13XdAXVNCj09JDH5G0xMeeQMDP4Ht/wDWrjv+Feav/wA/Fp/303+FdeLw1SU1yq+hxYHFUqUGpu2pheHf+RgsP+viL/0IV0HxR/5C9r/1w/qau+H/AALeWepxXN9cReXAwkAhYklhyAcgcev+TWr4w8KSa40c9tOsdxGNoEn3Cv4DINOnhqv1dxtrcVTF0niozT0SPLBXXfDH/kYpf+vZv/QkpP8AhXur/wDPaz/77b/4muj8F+FJtFuZbu8nV5XUxqsRyoXIJJJAJOR+HvnicNhqsKqclZGuMxlGdFxi7tnX0UUV7x84Ry/cb6V4J15Ne+uMqRXmt/8ADy/W6k+x3EDwZHl+azBsehwCOP19uleZj6MqluU9bLa9Oi5c7tc4s4xXo2of8ktX/rlF/wCjFrJj+HurF18y4tguRkhmJA9hgfzrs7jQYpPDn9jmVtgjCB8DOQQQcfUdKxw2HqQjPmW6OnGYqlNw5HezueO05Pvr9RXVn4e6sM/v7T/vtj/7LU+n/D29N5G17cW6wZyfJJLH2GQPz/SuSGEquWx2yx2H5fiLPxZ+7p/1k/8AZK4LFet+MfDba9bReVN5U8JJTcPlOcZB79q5H/hXmsf8/Fp/323/AMTXTisNVqVG4q6OXA4yjTpKE3ZlDwF/yNll/wBtP/RbV7DXC+EvBt1pWqC9v5o2aIERrCSQSQQS2QOgPQf/AK+5xXdgqcqdPlkup5uYVYVa3NB3VhaKBRXceeFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSN0paRulS9gPC6DRQa/Npbs+3jsbXgj/AJGez+r/APoDV6yPvV5N4I/5Gez+r/8AoDV6yPvV9dkn8B+p87mn8b5Dq4n4n/8AHla/9dT/ACrtq4n4n/8AHla/9dT/ACrszH/dpHNgf94icBRRRXwp9cJRRRTELRRRQAlXND/5Ddh/18x/+hCqlXND/wCQ3Yf9fEf/AKGK1ofxY+pnW/hy9D2gdBS0DpRX6KfFHKfEn/kAL/13X+RrzSvS/iT/AMi+v/Xdf5GvNK+Pzf8A3j5H0uWfwfmFegfC7/jyvP8ArqP5V5/XoHwu/wCPK8/66j+VTlX+8I0zP+AzthQaBQa+xPljL8RXz6Zo1xdxoHaJeFPckgD+deat4r1tv+X5l/7Zr/hXf+Of+RZvMei/+hrXk1fNZvXqU6qjFtK3Q97K6VOdNymk9ToLHxfq9vdI805uIwfmRlADD6gcV6qpyBXhifeX617mn3RXTlFWdRSUm3tuYZpThTkuRWHAUp6UUV7h5Bw3jjxDe2F7HZ2LeThBI7jBJzkAc9Olc1/wleuf8/7f98L/AIVf+JX/ACMK5/54L/M1y2a+PxuJqxrSUZPc+nweHpypJuK2PSvAWvXeqx3EN6Q7w4IkxgkHPUfhXXV598LP9dffRP5tXoPavocvnKdBSkzxMbCMKzUUFGKKK7zjCiiigAxRiiigBMVx/jvXrvSzBbWX7tpRuMnUgA9AK7HNed/FH/j/ALP/AK5t/OuHHzlToOUHqdmChGdZKSMT/hLda/5/5P8Av2v+FdN4D8RX+oXk1nfN5x2GVXOARggY4HI5FcAK6n4a5/t6XH/Pu3/oS14ODxNWVVJt7ntYzD0oUW4xRa8YeJtQttYktbObyI4cA4AJYkA9xWKfFmuZ4v2/79r/AIUeNf8AkZ73Pqn/AKCKxs1nisVVVVpN7l4fDUpUk2lseo+Ctcn1bTXa7AMsDCNmH8XGc4rjLzxjrE9y7xXPkxsfljVQdo+pHNdD8MP+Qfff9dh/6DXn9deIxFRUYO71uc+GoUnWqJxWljaTxbriuG+3FgP4Si8/pXpmg376lpdvduoRpVyVBzg5I/pXjNeueCP+Rasv9w/+hGtcqrVJ1GpNvTqRmdKnCmnCKTubvakpe1JX0J4ItFFFABRRRQAUUUUAFFGaKAKWqXX2LT7i52b/ACY2k25xnAzjNeXS+L9baZ3W9KA5IVUXA9uQa9J8TZ/sC/x/z7yf+gmvG68PM61SDXI2j28rpQqKXOkzch8Ya2kiO16ZApyUZFwfbgCvUtNuPtdjb3IXb50ayYznGRnFeI17R4f/AOQJY/8AXvH/AOgilllapNtTbZOaUadPl5FY0aKKK9w8YSloooAKKKKACkNLSGgDyS78ZazPcvJFdGCNj8sSqpCj0yRk0xPF2uq6sb4nBzgouPx4rD+71pc5r494mrzXuz7COFo2+FHqj69L/wAIf/a4hBlKA7N3fdt/+vj8K4T/AIS7XT11Bv8Avhf8K6WbP/CsB6bF/wDRorz+u/GVppRSb1VzhwNClLnvFOzZ0Wn+MdYhu43muPPjB+aJlABH1A4r1ZDkZNeEr/rF+or3hegrryypOcXzu5yZnThTkuRWuOFFFFeueOFFFBpDGnpXl3iLxbq/9s3EdpMLeKFzEAqg5wSMkkV6i1eI65/yGr//AK+ZP/QjXmZjUnTguR2PUyynGdR8yvoXv+Es17/oIN/3wv8AhXe6Rr8134Xl1SSIeZCjllBwGKjP4Z/GvJ816D4dz/wry+x/zyn/APQTXHgq1Ryak29Dtx9CnGEXGKWpzUvjHW3mYreeWpbOAi4HsMinQeMdcimVnuzIqnJRkXB9uBmsGiuP6xUbvdnovC0XD4Ue6WE4ubKCbbt81A+PTIzU9UtE/wCQPZf9cE/9BFXq+rg7xTPj2rNhXE+PvEd5pNxDaWJWJpF8wyHk4zjAB+ldtXmfxU/5DNr/ANcP/ZjXJjZyhSbizrwMIzrJSRlf8Jdrv/QQb/vhf/ia6bwF4k1DUL2a0v3EuIzIrnAIwQCOByORXn1dZ8Mf+Rhk/wCvVv5pXjYWtUlVV2z2sZQpQoycYo9RHSigUV9IfMBQaKKAErK8Tai+k6Lc3kaCR4wNoPTJYD+tatc78QP+RTvf+Af+hrWdWXLBtdjWjFSqRi+rPP28Xa7z/p5x7Iv+FT6d401mC6Rp7j7RHnBjZAM/jjg1zlPH3k/3hXzkMRUUt2fWSwtHl1ij3ocnJp1NXpTq+nPjgxRRRQAUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApG6UtI3SpewHhdBooNfm0t2fbx2NrwR/yM9n9X/wDQGr1kferybwR/yM9n9X/9AavWR96vrsk/gP1Pnc0/jfIdXE/E/wD48rX/AK6n+VdtXE/E/wD48rX/AK6n+VdmY/7tI5sD/vETgKKKK+FPrgooopgJRRRQIWrmif8AIasP+viP/wBCFU6uaJ/yGrD/AK+I/wD0IVrh/wCLH1Mq38OXoe0jpRQOlFfop8Wcp8Sf+RfX/ruv8jXmlel/En/kX1/67r/I15pXx+b/AO8fI+lyz+D8wr0D4Xf8eV5/11H8q8/r0D4Xf8eV5/11H8qnKv8AeEaZn/AZ2woNAor7FnyxWvbeK7tpIJ0DxyDDKehFckfAenDpd3C+wZR/StzxfcS2nh+7mgbZIqgBh1GWAryRyd5LtuLc9c14eZYilTmozhzOx6uAo1ZwbhKyuejWHgnS7e7jmklmuNhzskKlT9RjmuuHArxCynms7pJ7eRkkQ5yP5f8A1q9uXkVtltenVjL2cbWM8dRnTknOV7jqDQKK9Y84wvEXhyy1ko9wWilXgSJjJHoax28B6YP+X25/76X/AArK+JV5MdXitfMYQpGHCepJIz79K5LGTk9a+bxWKoRqyjKF2up72FwtedNOM7I9e0DRbTR4GjswWZ+Wkblm9Bn0rY7VwvwwuZnW8t3kJij2Mqn+EnOf5V3dezg6kalFOKsjysVCUKrjJ3YUUUV1nMFFFBoATjFR71/vCuc+Id3Pa6GPs8hjLyhGIOMqQSRnt0ry84JwOleXi8wWGnyWuejhcA8RHmvY91DqejCsrxDoNprkCLcgq6HKyL94e1eZeGbuaz1y0eBynmSrE2OhUsAQR/n1r2JelXhq8MbTfMvkZ16EsHUVmcd/wryx/wCfq5/Nf8K19A8N2Wibmt98s0nBlcAsB6D0H+fSt2krenhKNN80VYyniatRWlI53XfCVjrFyJ5C8MuMM0QA3jtnPes7/hXlh/z9XP8A47/hXZ80uKcsJRlJylHUI4mtBcsZGdo2k2ukWot7NMDux6sfUmsK98B6dc3TyxyzQK/Plx42j6ZHFdaRmlq54enNcsloiIV6kJOUXqzjF+Hunqyn7Vc8Hp8vP6V1tpbRWkCQ28axxoMKqjAAqSlp0sPTpfArBUrVKvxu4ppKWkrYyEY4HNN8xD/EPzrjvifdzw2NtDDIUjmZhIB/EBg4rzwc8n/9VeTisx9hU5ErnqYXL3Xh7Tmse6hlPQ06vKPAN5cQeIYYIXIjmDLKvZgFJH4gjr/jXq9deFxP1iHPaxyYmg6E+Ru4tFFBrrOYYzqOrCm+av8AeH51474kuprrWrtp5C7JK0a57AMQAP8APvWd/nrXh1M15ZNKJ7NPK3OKk5HuM0cc8DRyqHRwVZSMgj0IrlJvh/p0kjOs9zGp5ChgQPbkE1f8CXk97oEb3MhkdWKZPXA9a6KvSUaeJgpyVzzueph5yhB2OQt/h/pscyvJNcSqOqEgA/XAFdXDGkMaxxqFRRhVAwAOwp/NLWtOjTpfArEVKtSr8buLRRRWhkNY4603zF/vD868/wDidezi7htElIgaPeUHQncRz+VcSPfrXk4jMlRm4JXserh8tdaCqc1rnvAYHoc0m9R1YV5x8MrqZdVntd58hojIU7BsgZHpwfx/AVm+Pbua48SXMUkhZIMLGnZQQM/me9aSx6jRVa27tYmOXuVd0b7K9z1jzU/vD86d1FeC8+lemfDS6muNGkSeQuIZNiZ7LgHFLDY9V58jjYMVgHh4c6lcdf8AgLTbi5eaOSaAOclExtH0yKhT4e6crhmuLllyCQSuD7dM12XajFdLwdK97HKsZWStzMpPpto+mtYNCn2Ujb5eOAM/zzzn1rlz4B0wf8vtwPoV/wAK2/Gd1NaeG7ua1kMUqhQHHbLAf1ryEksTyQQa48bVpUnGM430O3AUatWLlCdtT0iw8D6Xa3aTvLLcbDkJIQVJ9wBz9K7EYrw2yuprK6jntpGjlRgQQf8AOR7V7ivIrTAVqdSL5FaxnmFGpTkvaSvcdRRRXpnmBRRRQMTrXMat4H03UL1rnfJAznLCIDBPc8g8muoorOpSjUVpq5pCrOm7wdji/wDhXenf8/V1/wCO/wCFdLa6ZaWll9jht0FuVKshGQ3rn1zV+iohh6dN3iip16lT43c42X4faa8jNHcXMYLEhAwIUenIpbb4fadFKryXFxKAclGIAb64FdhRUfVaV78qNFi66VuZjYYkhjWONQqKMADoKfRRXScoVjeIPD1nriqLlSsifdkT7w9q2aKmUFNWkXCcoPmi9Tiv+Fdaf/z9XP5r/hWv4d8NWWhGQ2+ZJZODI+NwX+6PQf57Ct6kOKyhh6UHeKNJ4irNcspDWYDqQKb5yf3h+deT+O7ueTxHPHLIzRwELGnZQVBPHua5/wDAVw1cx9nNwtsehSyt1IKfNue95yKWuQ+Gl3PcaI6TSeYsEuyMnsuAcfhmuvr0KU1Ugp9zzK1N0puD6BVa9tIb22e3uEEkcgwVNWaK2aTVjNNpnFP8O7DqLu5H/fP+FT2HgPS7S5SaSSacLyElxtJ9wAM/SuuoPSuZYSkndI6njKzVnJiHAFM85P7wri/ifdzw2lrbRSmOKbd5irxuxt4+nPSvOlPqPwrnxGN9jLkUbnThcudePO3Y97DqeQc04V5L8PrueHxNBBHIVjnDCRMcNhGI/EEdf8a9brow9f20ea1jmxWGeGnyN3AUUUV0nKFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSNS0jVL2A8MoNFBr81lufbx2NnwR/wAjPZ/V/wD0Bq9ZH3q8m8Ef8jPZ/V//AEBq9ZHWvrsj/gS9T53NP43yHVyHxJtZp9LiliTcsMm58dhjrXX1HJGsqFHUMrDBB716uIoqvTdNu1zz6NT2U1PseHUZr11vDekOxzYQ5Jyflo/4RrR/+fGL8jXzjyOr0kj3P7Wp/wArPIs0Zr13/hGtG/58Yv8Avk0f8I1o3/PjF/3yaX9iVv5kP+1qf8rPIs0ma9e/4RrRv+fGL/vk0f8ACMaP/wA+EP8A3zT/ALErfzIP7Wp/ys8izWn4ZtJbvXrNYVJ2SrIx7BVOTn8vzr0n/hGNH/58If8AvmrljplnYA/Y7aOHPXaK2w+T1IVFKUloZVs0hKDUYu5dFFAor6Y8I5T4k/8AIvr/ANd1/ka80r0v4k/8gBf+u6/yNeaV8fm/+8fI+lyz+D8wr0D4Xf8AHlef9dR/KvP69A+F3/Hlef8AXUfyrPKP94Rpmf8AAZ2wooFFfZnyxg+N1ZvDd4EUsdoOB6BgT+leTfpXujKrghhkGsk+GdHbrp8P4rXj4/L5YmanFpaWPTweNWHi4tHksKM7oqbmZmwFHJJNe4r0rMt9B0u1mWW3sYUkHRwvIq3fXkFjC091KI416k/5yTWmBwjwcX7SS1IxmK+tOPKti0KbzWCfGWhA/wDH7/5Cf/4mrel69p2qyOllceYyDJXYynH4gV3QxFKb5YyTOR0KiV5RaOF+JCN/wkEbfNtaBQDj5SQTmuXr1vxLPo0cER1ryyhYhA6ljnvwBWJ9s8Ef3If/AAHk/wDia+exmBjKtKXtEr9Ge3hcY4UlHkbsVvhcreZfPtbaQg6cZAPGa76s3QJdNksB/Yxj8gHGIwRg+4POfrUWoeJNK06YwXd0qSgZKhWYj64Br2cMoYehFSkrdzycQ5V6rcYu/Y16WufHjLQcc3//AJCf/wCJrbgnjniWWB1kjcZVlOQRXTGtTn8MkzCVKpD4otepNRWDN4v0SGR0e+UlCQdqOenoQOfwog8XaHPKkaXw3OQAGjdefqVqfrFL+ZFewq2vyv7jP+JiM+hJtUkLMpYjsNp5rzTFe33z2yW0jXhQQgfOX+7j3rkvtfgj+7B/35f/AArycwwqq1FLmS0PTwWJdKDjyt+hxmgIz69YKoLEToeBngMCT+Ar2he1c3oVz4Ze8K6R5K3JU9EZSR3xkfyrpMCurLqCowdpJ69Dlx1Z1Z3cWvUdRRRXqHAFFFFIY2nU2sS98VaPZ3T2896okjOGARmwfTIBqJ1I01eTsVGEpu0Vc3OKKwE8ZaGzhftwBY4GY3A/UVuxuJF3Kcg0oVYT+F3CdOUPiTQ+iiitSDhvikjtbWTKpIDtuI6DIGM1wGa9wu7WG7haK5jEkbDBU9DWd/wi+i/9A6D/AL5rxsVl0q1R1Ivc9fC5hCjTVOSeh574EVm8U2e1SQA5OF6DYRz+Jr1nvVKw0my05naytY4S4AYouMir1dmDwzw9Pkbvrc5MZiFiKnOlbQWg0UV2nIeJ64rLrV6rKUbz3OCMcbiR+YqjxXtN7omm38vm3dnFLJjG5hk4qt/wi+i/9A6H/vk189VyupKbknoe7TzSEYpOLKXw9Rl8ORblK7nYjIxkZ610ue2eaZGiQxKiAKqjAAHSsWXxfokUjRvegsuc7Y3YfgQuDXrxccPTUJSSseTJSr1HOEW7m9RWDb+L9EnlESXo3scDcjqM/UqBW4CDyK2jUjP4XcynTlT+JND6DRRVknm3xQR/7VtX2ttMWN2OM56Zrjia9j8Qy6XHZ51ry/IzwHBOT7Ac/lXPfbfA/wDch/78S/8AxNeBi8IpVXLnSue9hMY4UlDkbt2Mj4Zox1+VirbVgYE44BLLjn3xWd44Vk8U3m9Su4qRuGMjaBkV6L4el0aWCU6GIwoYbwqlTnHGQef8n3q3e6RYX7K97aRzMowCwzgVv9Sc8Oqaknre5z/XVTxDqOLWlrHimfevR/hehGjTsQ2HnJBIxn5RW1/wjGi/9A+H8jWnbW8VtEsMCBEQYAHQU8LgZ0Z80mhYvHQrw5Ypkw6UtAor2Dyjn/HiM/he8VFLEhTgDPAdSf0ryWvdLgxrE7TFRGBli3QD3rjvtngfH3bfP/XB/wD4mvHx+HVWak5Jep62BxLpQcVFvXoee26tLNGqqzMzAADkk5r3delcppF34Ta/iXTxAlwT8n7p159iRjNdYK2wFFUouzTv2M8fiHWkrxat3Fooor0jzQooooAKKKKACiikoAKK5+bxhoMcrRvfqWU7Ttjdhn2IXB/CnQeL9DuJUjjvlDOcDdG6jP1IwKw9vTvbmRt7Cra/K/uN+igGitjEKKKoalqdnpUJlvZ1iTOBnJJPsBkn8KTaSuxpOTsi/ScVz3/Cb6B/z/H/AL8yf/E1o6XrFhq8bvp1wJdhw3ylSPwIFRGtTk7KSLlSnFXlFo8v8cIyeKL7crfMVIz3G0cisPPvXq/ia48OwzwprXkmXnaCjMQPfA49s1mfbvA2f9VDj/rhJ/8AE14tbCKVRvnSPdw+NcaSXI3oS/C9GTRpyyna85IJHUYArsxVLSGsnsIW00obYqDHs4GPp/k1dr2KNNU6ainc8SvU9pUc2txaKBRW5gFFFFAHA/FVGMVg4Q7VdwWxwCduM/XFefcV7drsunxWLnVTH9n7iQZz9B1J+lct9u8C/wB2H/wHk/8Aia8fFYfnqc3Mlc93B4t06ajyN+hzXgFC/iq0IUsqBySF6DYwyfxOK9eFc94buPD0ssw0PyRIACwVGVsfiORXQD3rrwlJU4WvfU4MdWdWrdprTqOooFFdpxBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUjUtI1S9gPDKDRRX5rLc+3jsbPgj/kZ7P6v/AOgNXrVeM6Nff2bqcN0V3CNsEexGD+hr1rT9SttQtlnt5FZG9+h9K+qySpBU3C+tzwM0hL2ilboXaSmbl/vD86Xcv94fnXv3R49mOxRimbl/vD86N6/3h+dLnQ7MfijFM3r/AHh+dG9f7w/OjnQWY/FFM3r/AHh+dG9f7w/OjnQWY+imb1/vD86N6/3h+dPnQWZJQaj3r/eH50b1/vD86fMu4rM5f4k/8gJf+uy/yNea12nxC1qG5CafbMHKPukZedrDoP51xdfG5rVjOu3HorH0+XQlCjqgr0D4Xf8AHlef9dR/KvP69B+F/wDx5Xn/AF1H8qMo/wB5QZj/AAGdqKKBRX2Z8wFFFFABXD/FL/j3sf8Aff8AkK7iuP8AiTY3FzYQTW8e8QMxcDqAQOf0rhx8W8PJI6sG0q8Wzzk9a3PBBx4osueu/wD9AasUo3Hyt+Vb/gOynm1+C4WJhHBuLsegypAH15r5PCRl7aOnU+lxU4+xl6E3xHbOvoPSBf5muYzXW/EqymGqRXgUmF4xHuHqMnB/OuS2t/db8q1xyl7eWhGCcfYrXodp8MP+Pi//AN1P5tXL65/yHL7/AK+X/wDQjXX/AA0s5o47u5kUrHKVVM9TjPP61y/iexuLTXbsTRkB5GkQ9irEkH/PeumvGSwdPTqzmoyisXPXoZh6mu88L/8AIiX/APuzf+gVwhVsn5W/KvR/DelXUfhC4tZY/LmnWTYrcfeXAz6UsthJ1JK3QrMJR5I69TzalFSTwSwyNHLG6upwVK9DRBbTXEqxQxs0jkALjqa81wnzWseipw5b3O38W/8AIkab/wBsf/QDXB16N4n0m5k8I2sEUe+S2EZdQc/dUg49eTXnexv7rflXp5lGaqR06HnZc48ktepb0P8A5Ddh/wBfEf8AMV7QOleP+GLK4u9dsxDGSI5FkY9gqkE5/wA9a9hAxXpZPGSptvucOayTqK3YUUUUV7Z44UUUUDGOcKa8JY5JJJJPPPWvd26GvEbyxuLK7kt7hNsqHBH9R7HtXg5wnyxa8z2cpklKVyr9a9e8Ef8AIs2X+6f/AEI15KkMrOqqjMzHAGO9ew+FrWSy0K0t5xtkRDuHoSSf61hk8Ze0k32Ns0lH2cUu5qiikHSlr6Q8AKKKKACiiimAUUUUAFFFFAGX4lOPD+oH0tpf/QTXjVe1a3bvd6Td28WN80LouTgZIIrxiWCWGZoZY5FZSQQRyMV8/msJOSaPcyqSSkMr2jw//wAgOx/64R/+givHLe2muJ0hhid3c4AAr2fSYWt9MtYJPvRRIjfUACnlMWm2PNpJqNi7RRSHpXvnhHmvxQb/AIm1t/1x/wDZjXH13HxM0+5kuYLyOMvCqeW5Xnack5P51xWw/wB1v++a+Txyl7Z6H1eAlH2COo+GZ/4qKTn/AJdm/mtendq83+GljOdUmuyhWBYzFuPc5BwPwFekfw17WXpqgr9zw8yadd2FxS4oFFekcAUUUGgDn/HnHha8+i/+hrXkhr2DxhazX3h67t7dcylVIHrhgSP0ryIxsDgowI4PFfP5pBuomux9BlUl7OS8wjJV1I4II5Fe7L0FeI6fZXN7dx29vGXdmGB/U+wr25egrXKk0pXMM2aco2HUUUV7Z4wUUUUAFBoooASszxN/yL2o/wDXvJ/6Ca06pa3bvdaReW8WPMlhdFycDJBAqKivFoqm7STPEaKfNBLDI0csciuhKsCOQR1FOt7a4uZlhhhkeRzgAL1NfIOMuax9nzx5b3PadG/5BFn/ANcI/wCQq9VTTImg0+3hf70cSIfqBVuvr4fCj4uXxMK81+KLY1e2H/TD/wBmNelV538TtPuXu4LyOMvCkfluRztOc1yY1N0nY7cA0q6bOGrrPhi+PEMyk8G3b+a1y3lv/wA82/Kux+GFjOdUuLsoRAsRi3N3YlTgfgOfwrxMJGTrI93Hzj7F+hi+Nv8AkaL4erJ/6CKxSeK6Hx7ZXEHiOeZ4z5U+GR+xwAD+Vc/tb+635VOIi1Ud+5thZRdKPoek/Cz/AJA9yPSb/wBlFdlXKfDaymtNEd5l2ieTzEHfbjAP6V1Yr6HC39krny+LadeTQtFFFdRyhQaKDQBwHxYJC6ePeT/2WuAzivR/ihY3F1aWtxbxmRIC/mAdQCBz+lec7H/uP/3zXzuOjL2zZ9Rlso+wSN3wEf8Aiq7P38z/ANFtXr9eUfD6wnl8RQXCxkQwBi7EYAypAH1JNerivQy+6pa9zzM0adfTsKKKKK9I8sKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACkbpS0jdKl7MEeGUGtDxBpzaVqs1sVPlhiYz0yp5HPfj9azz0r84qwdObjLc+1pyUoKS6i5JHJzSDgYGcexo7UVkahRRRVcz7i5Qoooo5pdw5RKKKKOZ9w5Qooop8z7hyhRRRT5pdw5Qoooo5n3DlEJJOTyaKKKLgFeg/C/8A48rz/rqP5V59XqfgfTG07RUaQFZZv3jA9vTjA7V7GUQcsQpLZHl5nJRpcvc6MUGig19ifNFTULyGws5bq4bbHEMmuP8A+FiruwNOYj/rr/8AY1u+OP8AkWbv6L/6GteT/SvBzPGVaNRRpu2lz18vwlOtBymup6DYePoJ7uOK5tGgRzgv5m4L7nit/wAQ63b6LZiefLM3CIDy59K8fTvXdfE85hsf99/5Cs6GOrSoVJt6r9TXEYOlGvCEVZMP+FhjOf7Nb/v9/wDY1qeHfFsOr3xtmtzbyEZTL7t3qOg5rzHNbfgf/kabP/ef/wBAauTDZjXlVjGTvd2N8RgaMKblFbI9ZApaKK+tVt2fOCcAVyGs+N4bC+kt4bU3Hl8M3mbQD3HQ12BrxXXP+Q1ff9d5P5mvKzTETw9NOnu2ejl9CFabUzrv+FiD/oGn/v8A/wD2NdZp2rWt9pn2+J8QhSWJ/hwMnP0rxmu78L/8iFqP+7N/6BXBgcdVqzam+h143B0qcU4aai3HxAiWVxFZNIgOAxkwT7428U62+IcTSostgyR5w7CXO33xt5rgu34UgrieZ1273Ov+zqLie5wypNEskbBkcBlI7g96fWfoH/IFsv8ArhH/AOgitCvr4u8Uz5lqzaDFYniPxDBokKM6maWT7sYOMj1zg1t1518UP+P+z/3GrlxlV0aLlHc6cJSVaqoS2LX/AAsUf9A1v+//AP8AY1teGfFEGutLGITBPFz5ZfdkeoOBXlVdT8Nf+Rgk/wCvdv5rXiYTH151oxk7pnrYrAUadJzitUenUUUGvqD58Q9K4m+8fwQ3UkVvaGdEO0SeZt3e4+XpXaS/cNeFHtXkZnialBLk6np5fh4V5Pn6HeR/ERNw3aeQM8nzs4/8drqn1a1GknUfN/0cLu3D8sfXPH1rxmu+kH/FsVP+wv8A6NFcmDxtWalzO9lc6cXgqUHDl6uw1viKo+7pzEf9df8A7GprD4g2892kVxatAjnBk8zcF+vFefUJ98fWuSOY177nZLLqFtEe70UCivrEfLhRRRTAKKKKACg0UUAQ3EsdvC8srBI4wWYnsB1NcVN8Q41mcRWDOgJ2sZcEj1xt4rqPE3/Iv6h/17Sf+gmvGK8bMcTUoSSg9z1cuw1OtzOaO+g+IsMkypLYvHGfvOJM7fw2jNdRqesW2m6X9ukbdEwBTb1cnkAfWvGa77xbz4F0z28n/wBANZYbGVZQm5O7SujfFYOlCpBR0Teo3/hY65/5Bp/7/wD/ANjV7RPHMGpaglrNbG3MnCsZNwLdh0Fea4rQ8Pf8h+w/6+I//QhXLSzCvKaTZ01svoRpuSWtj07xH4kttDjXfGZZn6Rg449Se1c9/wALFX/oHn/v+P8A4mqPxP8A+Qrbf9cf6muPrXF42tCq4xehjhMFRnSU5LVnrHhrxTb65JJF5Rgmj58tmzuX1Bx61B4g8ZwaRefZY7c3MoGXw+0J7dDXMfDb/kYZP+vZv/QlrP8AG3/I0X/+8v8A6CK1eMqrC+0W97GUcHSeJdN7WOj/AOFkD/oGt/3+H/xNdT4f1mHWrIXEHyno6HqjeleMcV6P8L/+QRdf9dz/AOgipwOMq1anLN3Lx2DpUqfNBajL34hQQ3Lx21o1xGvAk8zaG9wMHiooviMhkUSaeyoSMkS5IH0281wPuaK5pZhWb3OtZdQ5dUe52N1DfWqXEDB43GQfWpu2Kw/BBx4Zsv8AcP8A6Ea3a+kpS54KT6o+bqRUJuC6MQCsjxHrkGiWomnBdmOERTgsa2K4L4q/d0/6yf8AstZYmo6NJzjua4amqtVQlsw/4WOP+gcf+/3/ANjWr4b8Yw6zeG1eA20pGUBfdv746DnHNeWdq3vAn/I1WX/bT/0W1eLQx1aVRRk7ps9vEYChClKUVZpHr1FFBr6Q+bErjtZ8dwaffSW0FqbnyuGcSbRuHUdD0rsTXiOu/wDIavv+viX/ANCNebmFedGCcD0cvoQrzamdf/wskf8AQNP/AH/H/wATXX2GrWt5pn2+OQCAKWYn+HHJz9K8Tr0Pw3/yTm+/65T/AMjXJhMZUqOSn2OvG4OlSgnBW1sMm+IkYlcQ6ezxg4VjLgkeuNpx+dOt/iLA0yrPYPGhPzOJM4HrjbzXn9Fcv16tzbnb/Z1Dl2PdoZFliWSM7kcBgR3Hapao6J/yCLP/AK4J/wCgirwr6VbHy7VmwrA8TeJLfQo08xDLNJ92IHHH1rfNeZ/FD/kMW3/XD/2Y1zYuo6dNyidOEpKrVUZFz/hZA/6Bh/7/AP8A9jW74Y8T2+vPKiwtbzxc7GOcj1BwP84ryaur+GP/ACMM3/Xu3/oSV5mFxlWdRRb0Z6+LwVKnSc4KzR03iPxpBo199ljgN1IB8+19oX26Hmsv/hZH/UKb/v8Af/Y1zfjf/kab76p/6CKxR1rOtjasKjiu5pQwFCVKMpK7aPavD+sQa1YLcwZU9HQ9Ub0rSri/hb/yCbn/AK7/APsortK9uhN1Kak+p4OIgqdVwXQD1qrqd9Dp9lJdXDbY4hkn19B9SeKtVz3xA/5FS8/4B/6MWrqycYOS6EUoqU1F9WYh+JK5wNNb/v8AD/4mptO+IFvcXaQ3Nq1ujnHmeZuA+vArzmnp/rE/3hXgRxta+59JLLqCWiPYfEWu22hWqzTgu7khIwcFjXMf8LJX/oFt/wB/x/8AE0fFj7mnf70n8lrga3xeLqU6nLE5cFg6VWkpz3PVPDnjC31q8Nq0DW0pGUDPuDdyOg5A5rqRXkHgL/kbLL/tp/6LavXxXdgqsqtPml3ODH0I0KvLDawooooruOAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigDJ8QaJb6zaGKUbZB9yQdVP+FcLfeCtXglK20aXMZz8wYLx2yCRz9M/WvTjilrz8Vl9HEPmktTroYypRVo7Hk/8AwiGuf8+J/wC/0f8A8VR/wiGuf8+J/wC/0f8A8VXrFLzXF/YlDuzq/tSv5Hk3/CIa5/z4n/v9H/8AFUf8Ihrn/Pif+/0f/wAVXrPNHNH9iUO7D+1a/keTf8Ihrn/Pif8Av9H/APFUf8Ihrn/Pif8Av9H/APFV6zzRzR/YlDuw/tWv5Hk3/CIa5/z4n/v9H/8AFUf8Ihrn/Pif+/0f/wAVXrPNHNH9iUO7D+1a/keTf8Ihrn/Pif8Av9H/APFUf8Ihrn/Pif8Av9H/APFV6zzRzR/YlDuw/tWv5Hk3/CIa5/z4n/v9H/8AFUf8Ihrn/Pif+/0f/wAVXrPNHNH9iUO7D+1a/keTf8Ifrn/Pgf8Av9H/APFUf8Ihrn/Pif8Av9H/APFV6zzRR/YtHu/w/wAg/tWv5Hkv/CIa7/z4/wDkaP8A+Ko/4RDXT/y44/7bR/8AxVes0U1kuHXV/wBfIP7UreRxfhzwSbS5W61GSOVk5WJRlQexJ4z9MfjXaAYGB0oor1KGHp0I8sEefVrTrS5psWiiitzIzPEOnnVdKns1cI0gGCegIII/lXnJ8Ha5nAss/wDbVB/7NXrGKTFeficDTxLUpNpo66GLqYdOMDy6x8F6xJcxpcW6wRZ5cujYH0B5NdZ4z0K41i0jNsy+ZASwRuN+ccZ7dK6WjFKnl1KlBwV7Pcc8bVnNTdro8n/4Q/Xv+fD/AMix/wDxVbXhDwvqVnrCXl8gt0hyQNysZCQR2PAGe/8A+rvqWs6eVUaU1NXNamYVakXF21CiiivWPOA15pr3hDU21Wea0jFxHLIZFbcqkZPIIJ7f59K9LorkxOFhiUlPob0MROhLmgeTf8Ihr3/Pj/5Fj/xrtdE0CWz8Pz6bNKu+4VwzqMhCy449cfhXSfypMVhh8uo0G3G+uhvWxtSsrSseUy+DNcjkaOO1EiDIDiVAPqMkH8xRB4N1x5VWS0Eak8s0qEAfgSf0r1alxmsf7HoXvdmv9qV7W0K2n25tLKC3LbvKjVM+uBirVJ0or14xUVZHmt31A1yXjvw/dat5VxZEPJGCvlHAznvkmutorKtRjWg4S2NKVWVKanHdHkn/AAh+vf8APj/5GT/Guk8C+HL7Tb2W8vkERKGNU3BiQSDnIOB0/wA9+3oripZbSpTU1e511sxq1YOEraijpRRRXpnnjW5BBryu98GaxDcyRwW/2iIHKyh0Ut+BOQfWvVKK5MVhaeISU76djpw+Jnh23DqeTJ4P11mANiFB7mZOPyau6l0CRvCn9kCdd+wAORxndu/nxW//ACo+nSsaGX0qN7X1VtTStjatW17aankzeDtdGcWOf+20f+NS2XgrWJbhFuIBbRn70hdWwPoGyTXqtJj2rFZTSTvqbPM67VtBwooor1zzAooooAKKKKACiiigCpqtr9t0+4tg2zzo2j3YzjIx0ry+XwZrqTOi2gkAOA4lQAj1GSD+Yr1qkrixGDp4i3NfQ68Pi6mHuoW1PJ4fBetyTKj2yxKTy7SoQB64BJ/Su01/QJrzw1DYQSAy24QqWGN5UYx7ZrpRRUUsBTpxcVfUqrjalWSlK2h5J/whuu/8+P8A5GT/AOKq/wCHfCGqJqtvPexC3igcSsS6sWYHIAAPf/PpXplFZxyyjGSkr6G0szrSi4u2pxnjvw9earJFd2YDyRrs8skLkZ65J965b/hDte/58R/39T/4qvXKKutl1KtNzbZFLMKtKChGxw/gfw1f6deSXl8ohcoY1jyGJBIJJIJA6f571PGHhXU7vVnvLGIXCTkFgXVShAAxyec+3/6/Q6Kt4Km6SpdDP65UVT2vU8i/4Q3Xv+fEf9/k/wAa7vwXpE2j6W0dyR5sz+Yyj+EkAYz36V0VBGaVHAUqMuaJVfHVa8eWVjye98Fa1FcMkEH2iNT8knmIu4e4JyDUcfgvXXcKbMIpIBLTKQPfhia9cAorF5XRve7NVmle1tDP0HT20zSoLR38xo1wWxjJyT/WtAUUV6UYqKUV0PNlJybk92Fcx460K41i0ha0KmW3LEIeN4OOATwDx3rp6KmrTjVi4S2ZdKo6U1OO6PIf+EN17/nwH/f2P/4qtzwb4V1Gy1mO9v1FukCnau5WMhII7HgDP+e3oVFcVPLqVOSkm9Dsq5jVqRcHbUWg0UV6R54hrzHxD4P1ZtYuJbSEXEMzmUMHVcbiSQQT2r0+iubEYeNdJS6G9CvOhLmgeQ/8Ibr/APz4D/v7H/jXeaR4fe08MSaXNMpeZHDMoyFLDnHrj8K6Hp9KMVlRwVOi21rfubV8dVrpKVtDySXwXrscjKtkHAOA6zIAR6jLA/mKW38Fa7JKqSWqxKTy7SoQB64BJr1qisf7NpXvdm/9qV7W0ILCD7NaQwbt3lRqmcYzgYzVikor0krKx5jdxTXG+OvDd5qzx3VlteSNdnlkgEjJ5BJx3712NFZ1aSqx5JGlKrKjNTjueQ/8Ibr/APz4/wDkaP8A+KrpfAvhvUNNvJby/wARHYYljyGLAkHcSDgdMf557miuSnl9KnJTVzrq5jVqwcJWPOfGHhPU7rWJbyyjFwk+CRuVdhAAwcnnPtWP/wAIZ4g/58B/3+T/AOKr18UUTy+nOXM2x08yq04qKtoc54J0WfRtKMd0w82Z/MZQc7OAMZ79K6KloruhBU4qKOCpN1JOb3YlZXibTn1XRp7KOQRNKBhj0BDA8/lWrRTlFTi4vqKMnCSkt0eQf8IZr/axB/7bJ/jVjT/BGtS3aLdQrbxA5LmRW6egBr1eiuBZdSTvdnoyzSu1bQ5Xx1oF1rVrA1oVMtuWYIcfPnHAPQHjvXF/8Idr/wDz4/8AkaP/ABr17mjmrq4OnVlzSuZ0cfVox5Y2seeeCvCmo2WsR3t/GLdbfdtTerFyVK9icAZ/z29EFJS10UaUaUeWJz1q8q8ueQUUUVsYhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFJQAtFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFJQAtFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUlAC0UUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUlAC0UUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAF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zbQGG6Un1PXP8qkGnxnVGvXZnfACqei/T/PrVV9E+0XLS31zNOu4lY84AHp/+rFAGI91JAbqHTnkaxduZApPl564P+c102jpax2UaWLq8a9WHc9yfep44IoY1iijCRj+FRgVnT6FEZDNZyPZy/3ozx+X+BoA1HcIu5uNoJJ9hWX/AG02z7Q9nKlmTgTEj8yvXFaKxbrbyZWL5TaxPU8cmso6ReNaiyluka0BHRfnKg8CgDcooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAMUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/2b0gDYoAAAAApepYfsP1MObkDhM4Cpzq2g==" alt="作者微信二维码" />
          <span>扫码添加微信，备注 <code>AI Zero Token</code>。</span>
        </div>
      </div>
    </section>
  </div>

  <script>
    const RUNTIME_AUTO_REFRESH_MS = 5 * 60 * 1000;
    const ACTIVE_PROFILE_REFRESH_MS = 15 * 1000;

    const state = {
      config: null,
      recentRequests: [],
      showEmails: false,
      filters: {
        search: "",
        status: "all",
        sort: "quota-desc",
      },
      selectedProfileIds: {},
      expandedProfileIds: {},
      testerResultTab: "response",
      settingsDirty: false,
    };

    const endpointMeta = {
      "/v1/models": {
        method: "GET",
        tab: "Models",
        description: "列出当前网关支持的模型。",
      },
      "/v1/responses": {
        method: "POST",
        tab: "Responses",
        description: "兼容 OpenAI responses 接口。",
      },
      "/v1/chat/completions": {
        method: "POST",
        tab: "Chat",
        description: "兼容 OpenAI chat.completions 接口。",
      },
      "/v1/images/generations": {
        method: "POST",
        tab: "Images",
        description: "兼容 OpenAI images.generations 接口。",
      },
      "/v1/images/edits": {
        method: "POST",
        tab: "Edits",
        description: "兼容 OpenAI images.edits JSON 接口。",
      },
    };

    const endpointSelect = document.getElementById("endpointSelect");
    const requestBody = document.getElementById("requestBody");
    const responseBody = document.getElementById("responseBody");
    const responsePreview = document.getElementById("responsePreview");
    const responsePreviewEmpty = document.getElementById("responsePreviewEmpty");
    const timingBody = document.getElementById("timingBody");
    const testerMeta = document.getElementById("testerMeta");
    const authStatus = document.getElementById("authStatus");
    const imageCapabilityHint = document.getElementById("imageCapabilityHint");
    const runTestBtn = document.getElementById("runTestBtn");
    const toggleEmailBtn = document.getElementById("toggleEmailBtn");
    const accountModal = document.getElementById("accountModal");
    const contactModal = document.getElementById("contactModal");
    const imagePreviewModal = document.getElementById("imagePreviewModal");
    const settingsDrawerBackdrop = document.getElementById("settingsDrawerBackdrop");
    const contactBtn = document.getElementById("contactBtn");
    const previewModalImage = document.getElementById("previewModalImage");
    const previewModalMeta = document.getElementById("previewModalMeta");
    const downloadPreviewBtn = document.getElementById("downloadPreviewBtn");
    const profileSearch = document.getElementById("profileSearch");
    const profileStatusFilter = document.getElementById("profileStatusFilter");
    const profileSort = document.getElementById("profileSort");
    const profileImportJson = document.getElementById("profileImportJson");
    const importProfileBtn = document.getElementById("importProfileBtn");
    const oauthLoginBtn = document.getElementById("oauthLoginBtn");
    const loadImportTemplateBtn = document.getElementById("loadImportTemplateBtn");
    const exportSelectedProfilesBtn = document.getElementById("exportSelectedProfilesBtn");
    const selectedProfileCount = document.getElementById("selectedProfileCount");
    const proxyEnabled = document.getElementById("proxyEnabled");
    const proxyUrl = document.getElementById("proxyUrl");
    const proxyNoProxy = document.getElementById("proxyNoProxy");
    const testProxyBtn = document.getElementById("testProxyBtn");
    const autoSwitchEnabled = document.getElementById("autoSwitchEnabled");
    const settingsStatus = document.getElementById("settingsStatus");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");

    function setBusy(button, busy) {
      if (button) {
        button.disabled = busy;
      }
    }

    function formatJson(value) {
      return JSON.stringify(value, null, 2);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function formatTime(value) {
      if (!value) {
        return "未登录";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "未知";
      }
      return date.toLocaleString("zh-CN", { hour12: false });
    }

    function timestampToMillis(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return null;
      }
      return value < 1000000000000 ? value * 1000 : value;
    }

    function formatShortTime(value) {
      if (!value) {
        return "--:--";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "--:--";
      }
      return date.toLocaleTimeString("zh-CN", { hour12: false });
    }

    function roundDuration(value) {
      return Math.round(value * 100) / 100;
    }

    function formatRequestSeconds(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return "--";
      }
      return value.toFixed(2) + "s";
    }

    function formatLatencyMs(value) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return "0 ms";
      }
      return roundDuration(value).toFixed(2) + " ms";
    }

    function formatCompactDuration(seconds) {
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
        return "未知";
      }
      const totalMinutes = Math.ceil(seconds / 60);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      const parts = [];
      if (days > 0) {
        parts.push(days + "天");
      }
      if (hours > 0) {
        parts.push(hours + "小时");
      }
      if (minutes > 0 || parts.length === 0) {
        parts.push(minutes + "分钟");
      }
      return parts.join(" ");
    }

    function formatWindowLabel(minutes) {
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
        return "额度";
      }
      if (minutes === 60) {
        return "主额度";
      }
      if (minutes === 60 * 24) {
        return "日额度";
      }
      if (minutes === 60 * 5) {
        return "5 小时额度";
      }
      if (minutes === 60 * 24 * 7) {
        return "周额度";
      }
      return minutes + " 分钟额度";
    }

    function getPlanType(profile) {
      return profile && profile.quota && typeof profile.quota.planType === "string"
        ? profile.quota.planType
        : "unknown";
    }

    function getPlanRank(profile) {
      const plan = getPlanType(profile).toLowerCase();
      if (plan.indexOf("enterprise") !== -1 || plan.indexOf("business") !== -1) {
        return 60;
      }
      if (plan.indexOf("team") !== -1) {
        return 50;
      }
      if (plan.indexOf("pro") !== -1 || plan.indexOf("premium") !== -1) {
        return 40;
      }
      if (plan.indexOf("plus") !== -1) {
        return 30;
      }
      if (plan.indexOf("free") !== -1) {
        return 10;
      }
      return 0;
    }

    function getPlanKey(profile) {
      const plan = getPlanType(profile).toLowerCase();
      if (plan.indexOf("enterprise") !== -1 || plan.indexOf("business") !== -1) {
        return "enterprise";
      }
      if (plan.indexOf("team") !== -1) {
        return "team";
      }
      if (plan.indexOf("pro") !== -1 || plan.indexOf("premium") !== -1) {
        return plan.indexOf("premium") !== -1 ? "premium" : "pro";
      }
      if (plan.indexOf("plus") !== -1) {
        return "plus";
      }
      if (plan.indexOf("free") !== -1) {
        return "free";
      }
      return "unknown";
    }

    function getUsageCorner(profile, isCodexActive) {
      if (profile.isActive && isCodexActive) {
        return {
          className: "dual",
          label: "API + Codex",
        };
      }
      if (profile.isActive) {
        return {
          className: "api-only",
          label: "API",
        };
      }
      if (isCodexActive) {
        return {
          className: "codex-only",
          label: "Codex",
        };
      }
      return null;
    }

    function getQuotaSnapshotTime(profile) {
      return profile && profile.quota && typeof profile.quota.capturedAt === "number"
        ? profile.quota.capturedAt
        : 0;
    }

    function describeQuotaSnapshot(profile) {
      const capturedAt = getQuotaSnapshotTime(profile);
      return capturedAt > 0 ? formatTime(capturedAt) : "未同步";
    }

    function describeQuotaLimit(profile) {
      const quota = profile && profile.quota ? profile.quota : null;
      if (!quota) {
        return "等待刷新额度";
      }

      const parts = [];
      if (typeof quota.activeLimit === "string" && quota.activeLimit) {
        parts.push(quota.activeLimit);
      }
      if (typeof quota.creditsBalance === "string" && quota.creditsBalance) {
        parts.push("余额 " + quota.creditsBalance);
      }
      if (typeof quota.primaryOverSecondaryLimitPercent === "number") {
        parts.push("共享上限 " + Math.round(quota.primaryOverSecondaryLimitPercent) + "%");
      }

      return parts.length > 0 ? parts.join(" · ") : "来自 Codex 响应头";
    }

    function getVersionValue(config) {
      if (!config || !config.versionStatus) {
        return "--";
      }

      return config.versionStatus.currentVersion || "--";
    }

    function getVersionDetail(config) {
      if (!config || !config.versionStatus) {
        return "版本状态未知";
      }

      const versionStatus = config.versionStatus;
      if (versionStatus.status === "update-available" && versionStatus.latestVersion) {
        return "可更新到 " + versionStatus.latestVersion;
      }
      if (versionStatus.status === "ok" && versionStatus.latestVersion) {
        return "已检查，当前已是最新版本";
      }
      return versionStatus.error
        ? "版本检查失败: " + versionStatus.error
        : "暂未拿到远端版本信息";
    }

    function renderUpdatePanel(config) {
      const panel = document.getElementById("updatePanel");
      const title = document.getElementById("updatePanelTitle");
      const detail = document.getElementById("updatePanelDetail");
      const command = document.getElementById("updatePanelCommand");
      const versionStatus = config && config.versionStatus ? config.versionStatus : null;

      if (!versionStatus || !versionStatus.needsUpdate || !versionStatus.latestVersion) {
        panel.classList.remove("is-visible");
        return;
      }

      title.textContent = "发现新版本可更新";
      detail.textContent = "当前版本 " + versionStatus.currentVersion + "，最新版本 "
        + versionStatus.latestVersion + "。更新后可获得最新模型列表逻辑、管理页体验和接口修复。";
      command.textContent = "npm install -g " + versionStatus.packageName;
      panel.classList.add("is-visible");
    }

    function supportsImageGeneration(profile) {
      return Boolean(profile);
    }

    function getImageCapability(profile) {
      if (!profile) {
        return {
          supported: false,
          label: "未登录",
          detail: "请先完成登录后再使用图片生成。",
          badgeClass: "orange",
        };
      }

      if (profile.authStatus && (profile.authStatus.state === "token_invalidated" || profile.authStatus.state === "auth_error")) {
        return {
          supported: false,
          label: "认证失效",
          detail: "账号认证已失效，请重新登录后再使用图片生成。",
          badgeClass: "red",
        };
      }

      const planType = getPlanType(profile);
      if (planType === "free") {
        return {
          supported: true,
          label: "可尝试生图",
          detail: "free 账号可尝试图片生成，额度和可用性以上游返回为准。",
          badgeClass: "orange",
        };
      }

      return {
        supported: true,
        label: "支持生图",
        detail: "当前账号可使用图片生成接口。",
        badgeClass: "green",
      };
    }

    function describeAuthStatus(profile) {
      const authStatus = profile && profile.authStatus ? profile.authStatus : null;
      if (!authStatus || authStatus.state === "ok") {
        return authStatus && authStatus.checkedAt ? "正常 · " + formatTime(authStatus.checkedAt) : "正常";
      }

      const prefix = authStatus.state === "token_invalidated" ? "登录失效" : "认证异常";
      const detail = authStatus.code || authStatus.httpStatus ? " (" + (authStatus.code || authStatus.httpStatus) + ")" : "";
      return prefix + detail + " · " + formatTime(authStatus.checkedAt);
    }

    function maskEmail(email) {
      if (typeof email !== "string" || email.indexOf("@") === -1) {
        return email || "";
      }

      const parts = email.split("@");
      const local = parts[0] || "";
      const domain = parts.slice(1).join("@");
      if (!domain) {
        return email;
      }

      if (local.length <= 2) {
        return local.charAt(0) + "***@" + domain;
      }

      return local.slice(0, 2) + "***" + local.slice(-1) + "@" + domain;
    }

    function maskIdentifier(value) {
      if (typeof value !== "string" || !value.trim()) {
        return value || "";
      }

      const trimmed = value.trim();
      const parts = trimmed.split(":");
      const suffix = parts.length > 1 ? parts.pop() || "" : trimmed;
      const prefix = parts.length > 0 ? parts.join(":") + ":" : "";

      if (suffix.length <= 10) {
        return prefix + suffix.slice(0, 2) + "****";
      }

      return prefix + suffix.slice(0, 5) + "****" + suffix.slice(-5);
    }

    function getProfileDisplayLabel(profile) {
      if (!profile) {
        return "未登录";
      }
      if (profile.email) {
        return state.showEmails ? profile.email : maskEmail(profile.email);
      }
      const fallback = profile.accountId || profile.profileId || "未命名账号";
      return state.showEmails ? fallback : maskIdentifier(fallback);
    }

    function updateEmailToggleButton() {
      toggleEmailBtn.textContent = state.showEmails ? "明文模式" : "脱敏模式";
    }

    function getProfileInitial(profile) {
      const label = profile && profile.email ? profile.email : getProfileDisplayLabel(profile);
      return label.charAt(0).toUpperCase();
    }

    function getLogAccountLabel(item) {
      if (!item) {
        return "未登录";
      }
      if (item.accountEmail) {
        return state.showEmails ? item.accountEmail : maskEmail(item.accountEmail);
      }
      const fallback = item.accountFallback || item.account || "未登录";
      return state.showEmails ? fallback : maskIdentifier(fallback);
    }

    function getPrimaryUsage(profile) {
      const value = profile && profile.quota && typeof profile.quota.primaryUsedPercent === "number"
        ? profile.quota.primaryUsedPercent
        : 0;
      return Math.max(0, Math.min(100, value));
    }

    function getPrimaryRemaining(profile) {
      return 100 - getPrimaryUsage(profile);
    }

    function getSecondaryUsage(profile) {
      const value = profile && profile.quota && typeof profile.quota.secondaryUsedPercent === "number"
        ? profile.quota.secondaryUsedPercent
        : 0;
      return Math.max(0, Math.min(100, value));
    }

    function isProfileQuotaExhausted(profile) {
      if (!profile || !profile.quota) {
        return false;
      }

      return getPrimaryUsage(profile) >= 100 || getSecondaryUsage(profile) >= 100;
    }

    function findProfileById(profileId) {
      const profiles = state.config && Array.isArray(state.config.profiles) ? state.config.profiles : [];
      return profiles.find(function (profile) {
        return profile.profileId === profileId;
      }) || null;
    }

    function confirmQuotaSwitch(action, profileId) {
      if (action !== "activate" && action !== "apply-codex") {
        return true;
      }

      const profile = findProfileById(profileId);
      if (!isProfileQuotaExhausted(profile)) {
        return true;
      }

      const target = action === "activate" ? "网关" : "Codex";
      const label = getProfileDisplayLabel(profile);
      const message = "账号 “" + label + "” 的额度快照显示已耗尽。\\n\\n仍要应用到 " + target + " 吗？";
      const confirmed = window.confirm(message);
      if (!confirmed) {
        authStatus.textContent = "已取消应用到 " + target + "。";
      }
      return confirmed;
    }

    function getProfileHealth(profile) {
      const now = Date.now();
      if (profile && profile.authStatus && profile.authStatus.state === "token_invalidated") {
        return {
          key: "invalid",
          label: "登录失效",
          badgeClass: "red",
          barClass: "red",
        };
      }
      if (profile && profile.authStatus && profile.authStatus.state === "auth_error") {
        return {
          key: "invalid",
          label: "认证异常",
          badgeClass: "red",
          barClass: "red",
        };
      }
      if (profile && profile.expiresAt && profile.expiresAt <= now) {
        return {
          key: "expired",
          label: "已过期",
          badgeClass: "red",
          barClass: "red",
        };
      }

      const primary = getPrimaryUsage(profile);
      if (primary >= 95) {
        return {
          key: "warning",
          label: "即将耗尽",
          badgeClass: "orange",
          barClass: "red",
        };
      }

      if (primary >= 75) {
        return {
          key: "warning",
          label: "负载偏高",
          badgeClass: "orange",
          barClass: "orange",
        };
      }

      return {
        key: "healthy",
        label: "健康",
        badgeClass: "green",
        barClass: "blue",
      };
    }

    function isProfileUnavailable(profile) {
      const health = getProfileHealth(profile);
      return health.key === "invalid" || health.key === "expired";
    }

    function getProfileSortGroup(profile, codexAccountId) {
      const isCodexActive = Boolean(codexAccountId && profile.accountId === codexAccountId);
      if (profile.isActive || isCodexActive) {
        return 0;
      }
      if (isProfileUnavailable(profile)) {
        return 2;
      }
      return 1;
    }

    function describeReset(profile, slot) {
      if (!profile || !profile.quota) {
        return "暂无数据";
      }

      const quota = profile.quota;
      const resetAt = slot === "primary" ? quota.primaryResetAt : quota.secondaryResetAt;
      const resetAfter = slot === "primary" ? quota.primaryResetAfterSeconds : quota.secondaryResetAfterSeconds;
      const resetAtMillis = timestampToMillis(resetAt);
      if (resetAtMillis) {
        return formatTime(resetAtMillis);
      }
      if (typeof resetAfter === "number" && resetAfter > 0) {
        return formatCompactDuration(resetAfter) + "后";
      }
      return "未知";
    }

    function formatCompactDateTime(value) {
      if (!value) {
        return "暂无数据";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "未知";
      }
      const month = String(date.getMonth() + 1);
      const day = String(date.getDate());
      const time = date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
      return month + "/" + day + " " + time;
    }

    function describeCompactReset(profile, slot) {
      if (!profile || !profile.quota) {
        return "暂无数据";
      }

      const quota = profile.quota;
      const resetAt = slot === "primary" ? quota.primaryResetAt : quota.secondaryResetAt;
      const resetAfter = slot === "primary" ? quota.primaryResetAfterSeconds : quota.secondaryResetAfterSeconds;
      const resetAtMillis = timestampToMillis(resetAt);
      if (resetAtMillis) {
        return formatCompactDateTime(resetAtMillis);
      }
      if (typeof resetAfter === "number" && resetAfter > 0) {
        const capturedAt = timestampToMillis(quota.capturedAt);
        return capturedAt ? formatCompactDateTime(capturedAt + resetAfter * 1000) : formatCompactDuration(resetAfter) + "后";
      }
      return "未知";
    }

    function getQuotaWindowLabel(profile, slot) {
      const quota = profile && profile.quota ? profile.quota : null;
      if (!quota) {
        return "未同步额度";
      }
      const field = slot === "primary" ? "primaryWindowMinutes" : "secondaryWindowMinutes";
      return formatWindowLabel(quota && quota[field]);
    }

    function getResetLabel(profile, slot) {
      const label = getQuotaWindowLabel(profile, slot);
      if (label === "5 小时额度") {
        return "5小时重置";
      }
      if (label === "周额度") {
        return "周重置";
      }
      return label.replace("额度", "") + "重置";
    }

    function formatQuotaUsage(percent, profile, slot) {
      if (!profile || !profile.quota) {
        return "等待刷新";
      }

      const used = Math.round(percent);
      const remaining = Math.max(0, 100 - used);
      return getQuotaWindowLabel(profile, slot) + " · 已用 " + used + "% / 剩余 " + remaining + "%";
    }

    function formatQuotaRemaining(percent, profile) {
      if (!profile || !profile.quota) {
        return "--";
      }

      return "剩余 " + String(Math.max(0, 100 - Math.round(percent))) + "%";
    }

    function createTimingTracker() {
      return {
        startedAt: performance.now(),
        phases: [],
      };
    }

    async function measureTimingPhase(tracker, label, task) {
      const startedAt = performance.now();
      try {
        return await task();
      } finally {
        tracker.phases.push({
          label: label,
          durationMs: performance.now() - startedAt,
        });
      }
    }

    function renderTimingReport(title, tracker, extraLines) {
      const totalMs = performance.now() - tracker.startedAt;
      const lines = [title];
      tracker.phases.forEach(function (phase, index) {
        lines.push(String(index + 1) + ". " + phase.label + ": " + formatLatencyMs(phase.durationMs));
      });
      if (Array.isArray(extraLines)) {
        extraLines.filter(Boolean).forEach(function (line) {
          lines.push(line);
        });
      }
      lines.push("总耗时: " + formatLatencyMs(totalMs));
      return lines.join("\\n");
    }

    function summarizeJson(value, depth) {
      if (depth > 5) {
        return value;
      }

      if (Array.isArray(value)) {
        return value.map(function (item) {
          return summarizeJson(item, depth + 1);
        });
      }

      if (!value || typeof value !== "object") {
        return value;
      }

      const result = {};
      Object.keys(value).forEach(function (key) {
        const item = value[key];
        if (key === "b64_json" && typeof item === "string") {
          result[key] = "[base64 omitted in admin page, length=" + item.length + "]";
          return;
        }
        result[key] = summarizeJson(item, depth + 1);
      });
      return result;
    }

    function setTesterResultTab(tab) {
      state.testerResultTab = tab;
      document.querySelectorAll("[data-result-tab]").forEach(function (button) {
        button.classList.toggle("is-active", button.getAttribute("data-result-tab") === tab);
      });
      document.querySelectorAll("[data-result-panel]").forEach(function (panel) {
        panel.classList.toggle("is-active", panel.getAttribute("data-result-panel") === tab);
      });
    }

    function openImagePreviewModal(src, meta, filename) {
      previewModalImage.src = src;
      previewModalMeta.textContent = meta || "图片预览";
      downloadPreviewBtn.href = src;
      downloadPreviewBtn.download = filename || "generated-image.png";
      imagePreviewModal.classList.add("is-open");
      imagePreviewModal.setAttribute("aria-hidden", "false");
    }

    function closeImagePreviewModal() {
      imagePreviewModal.classList.remove("is-open");
      imagePreviewModal.setAttribute("aria-hidden", "true");
      previewModalImage.src = "";
      previewModalMeta.textContent = "等待图片结果…";
      downloadPreviewBtn.href = "#";
      downloadPreviewBtn.download = "generated-image.png";
    }

    function clearPreview() {
      responsePreview.innerHTML = "";
      responsePreviewEmpty.hidden = false;
    }

    function renderPreview(payload) {
      clearPreview();
      if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
        return;
      }

      const images = payload.data.filter(function (item) {
        return item && typeof item.b64_json === "string" && item.b64_json.length > 0;
      });

      if (images.length === 0) {
        return;
      }

      const format = payload.output_format === "jpeg"
        ? "jpeg"
        : payload.output_format === "webp"
          ? "webp"
          : "png";
      const mime = format === "jpeg" ? "image/jpeg" : "image/" + format;

      images.slice(0, 4).forEach(function (item, index) {
        const card = document.createElement("figure");
        card.className = "preview-card";

        const image = document.createElement("img");
        image.alt = "生成图片 " + String(index + 1);
        image.src = "data:" + mime + ";base64," + item.b64_json;
        const lines = [
          "图片 " + String(index + 1),
          payload.size ? "尺寸: " + payload.size : "",
          payload.quality ? "质量: " + payload.quality : "",
          item.b64_json ? "base64 长度: " + String(item.b64_json.length) : "",
          item.revised_prompt ? "重写提示词: " + item.revised_prompt : "",
        ].filter(Boolean);
        const captionText = lines.join(" | ");
        image.addEventListener("click", function () {
          openImagePreviewModal(
            image.src,
            captionText,
            "generated-image-" + String(index + 1) + "." + format,
          );
        });
        card.appendChild(image);

        const caption = document.createElement("figcaption");
        caption.textContent = captionText;
        card.appendChild(caption);

        const actions = document.createElement("div");
        actions.className = "preview-actions";

        const view = document.createElement("button");
        view.type = "button";
        view.className = "btn-secondary";
        view.textContent = "查看大图";
        view.addEventListener("click", function () {
          openImagePreviewModal(
            image.src,
            captionText,
            "generated-image-" + String(index + 1) + "." + format,
          );
        });
        actions.appendChild(view);

        const download = document.createElement("a");
        download.href = image.src;
        download.download = "generated-image-" + String(index + 1) + "." + format;
        download.textContent = "下载图片";
        actions.appendChild(download);

        card.appendChild(actions);
        responsePreview.appendChild(card);
      });

      responsePreviewEmpty.hidden = true;
    }

    function buildExample(endpoint) {
      const model = document.getElementById("defaultModel").value || "gpt-5.4";
      if (endpoint === "/v1/models") {
        return "";
      }

      if (endpoint === "/v1/chat/completions") {
        return formatJson({
          model: model,
          messages: [
            {
              role: "user",
              content: "请只回复 OK",
            },
          ],
        });
      }

      if (endpoint === "/v1/images/generations") {
        return formatJson({
          model: "gpt-image-2",
          prompt: "生成一张简洁的产品海报，白色工作台上放着银色笔记本电脑和玻璃水杯，整体光线柔和，风格接近科技品牌广告。",
          size: "1024x1024",
          quality: "low",
          response_format: "b64_json",
        });
      }

      if (endpoint === "/v1/images/edits") {
        return formatJson({
          model: "gpt-image-2",
          prompt: "参考这张图片，生成一张更适合科技产品广告的版本，保留主体构图，增强光线和质感。",
          images: [
            {
              image_url: "data:image/png;base64,替换为你的图片base64",
            },
          ],
          size: "1024x1024",
          quality: "low",
          response_format: "b64_json",
        });
      }

      return formatJson({
        model: model,
        input: "请只回复 OK",
      });
    }

    function getOverviewCards(config) {
      const requests = state.recentRequests.slice(0, 24);
      const avg = requests.length
        ? requests.reduce(function (sum, item) { return sum + (item.durationMs || 0); }, 0) / requests.length
        : 0;
      const codexAccountId = config.codex && config.codex.accountId ? config.codex.accountId : "";
      const codexProfile = codexAccountId && Array.isArray(config.profiles)
        ? config.profiles.find(function (profile) { return profile.accountId === codexAccountId; })
        : null;
      const gatewayLabel = config.profile ? getProfileDisplayLabel(config.profile) : "未激活账号";
      const codexLabel = codexProfile
        ? getProfileDisplayLabel(codexProfile)
        : (codexAccountId ? maskIdentifier(codexAccountId) : "未检测到");

      return [
        {
          icon: "users",
          iconClass: "blue",
          label: "账号总数",
          value: String(config.status.profileCount || 0),
          detail: "已保存到本地账号池",
        },
        {
          kind: "account-status",
          label: "当前账号状态",
          gatewayLabel: gatewayLabel,
          codexLabel: codexLabel,
        },
        {
          icon: "model",
          iconClass: "brand",
          label: "默认模型",
          value: config.settings.defaultModel || "-",
          detail: "未显式指定 model 时生效",
          compact: true,
        },
        {
          icon: "version",
          iconClass: config.versionStatus && config.versionStatus.needsUpdate ? "orange" : "green",
          label: "当前版本",
          value: getVersionValue(config),
          detail: getVersionDetail(config),
          compact: true,
        },
        {
          icon: "requests",
          iconClass: "blue",
          label: "今日请求数",
          value: String(requests.length),
          detail: "基于本页最近测试记录",
        },
        {
          icon: "latency",
          iconClass: "orange",
          label: "平均耗时",
          value: requests.length ? (avg / 1000).toFixed(2) + " s" : "--",
          detail: requests.length ? "统计最近 " + String(requests.length) + " 次" : "等待请求样本",
        },
        {
          icon: "service",
          iconClass: config.status.loggedIn ? "green" : "orange",
          label: "服务状态",
          value: config.status.loggedIn ? "运行中" : "待登录",
          detail: config.status.loggedIn ? "网关可转发请求" : "请先完成 OAuth 登录",
          compact: true,
        },
      ];
    }

    function getSummaryIcon(name) {
      if (name === "users") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
      }
      if (name === "model") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 9h6v6H9z"></path><path d="M9 1v3"></path><path d="M15 1v3"></path><path d="M9 20v3"></path><path d="M15 20v3"></path><path d="M20 9h3"></path><path d="M20 15h3"></path><path d="M1 9h3"></path><path d="M1 15h3"></path></svg>';
      }
      if (name === "version") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"></path></svg>';
      }
      if (name === "requests") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"></path><path d="m15 6 6 6-6 6"></path></svg>';
      }
      if (name === "latency") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6v6l4 2"></path><circle cx="12" cy="12" r="9"></circle></svg>';
      }
      if (name === "service") {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 7v6c0 5 3.4 7.7 8 8 4.6-.3 8-3 8-8V7l-8-4Z"></path><path d="m9 12 2 2 4-4"></path></svg>';
      }
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle></svg>';
    }

    function renderOverview(config) {
      const container = document.getElementById("summaryGrid");
      const cards = getOverviewCards(config);
      container.innerHTML = cards.map(function (card) {
        if (card.kind === "account-status") {
          return ""
            + '<article class="summary-card account-status-summary">'
            +   '<div class="summary-card-head">'
            +     '<span class="summary-icon green">'
            +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17 10 11 4 5"></path><path d="M12 19h8"></path></svg>'
            +     "</span>"
            +     "<label>" + escapeHtml(card.label) + "</label>"
            +   "</div>"
            +   '<div class="account-status-list">'
            +     '<div class="account-status-line gateway">'
            +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21"></path><path d="M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9"></path></svg>'
            +       "<span>网关：</span>"
            +       "<strong>" + escapeHtml(card.gatewayLabel) + "</strong>"
            +     "</div>"
            +     '<div class="account-status-line codex">'
            +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17 10 11 4 5"></path><path d="M12 19h8"></path></svg>'
            +       "<span>Codex：</span>"
            +       "<strong>" + escapeHtml(card.codexLabel) + "</strong>"
            +     "</div>"
            +   "</div>"
            + "</article>";
        }
        const valueClass = card.compact ? "summary-value-sm" : "";
        const iconClass = card.iconClass ? " " + card.iconClass : "";
        return ""
          + '<article class="summary-card">'
          +   '<div class="summary-card-head">'
          +     '<span class="summary-icon' + iconClass + '">' + getSummaryIcon(card.icon) + "</span>"
          +     "<label>" + escapeHtml(card.label) + "</label>"
          +   "</div>"
          +   '<strong class="' + valueClass + '">' + escapeHtml(card.value) + "</strong>"
          +   "<span>" + escapeHtml(card.detail) + "</span>"
          + "</article>";
      }).join("");
    }

    function getFilteredProfiles(config) {
      const profiles = Array.isArray(config.profiles) ? config.profiles.slice() : [];
      const search = state.filters.search.trim().toLowerCase();
      const status = state.filters.status;
      const sort = state.filters.sort;
      const codexAccountId = config.codex && config.codex.accountId ? config.codex.accountId : "";

      const filtered = profiles.filter(function (profile) {
        const label = getProfileDisplayLabel(profile).toLowerCase();
        const haystack = [
          label,
          profile.profileId || "",
          profile.accountId || "",
          profile.email || "",
        ].join(" ").toLowerCase();
        if (search && haystack.indexOf(search) === -1) {
          return false;
        }

        const health = getProfileHealth(profile);
        const isCodexActive = Boolean(codexAccountId && profile.accountId === codexAccountId);
        if (status === "active" && !profile.isActive && !isCodexActive) {
          return false;
        }
        if (status === "healthy" && health.key !== "healthy") {
          return false;
        }
        if (status === "warning" && health.key !== "warning") {
          return false;
        }
        if (status === "invalid" && health.key !== "invalid") {
          return false;
        }
        if (status === "expired" && health.key !== "expired") {
          return false;
        }
        return true;
      });

      filtered.sort(function (a, b) {
        const groupDiff = getProfileSortGroup(a, codexAccountId) - getProfileSortGroup(b, codexAccountId);
        if (groupDiff !== 0) {
          return groupDiff;
        }
        const planDiff = getPlanRank(b) - getPlanRank(a);
        if (planDiff !== 0) {
          return planDiff;
        }
        const primaryRemainingDiff = getPrimaryRemaining(b) - getPrimaryRemaining(a);
        if (primaryRemainingDiff !== 0) {
          return primaryRemainingDiff;
        }
        if (sort === "latency-asc") {
          const aCapturedAt = getQuotaSnapshotTime(a) || 0;
          const bCapturedAt = getQuotaSnapshotTime(b) || 0;
          return bCapturedAt - aCapturedAt;
        }
        if (sort === "expiry-asc") {
          const aExpiry = a.expiresAt || Number.MAX_SAFE_INTEGER;
          const bExpiry = b.expiresAt || Number.MAX_SAFE_INTEGER;
          return aExpiry - bExpiry;
        }
        if (sort === "name-asc") {
          return getProfileDisplayLabel(a).localeCompare(getProfileDisplayLabel(b), "zh-CN");
        }
        return getPrimaryUsage(b) - getPrimaryUsage(a);
      });

      return filtered;
    }

    function getSelectedProfileIds() {
      return Object.keys(state.selectedProfileIds).filter(function (profileId) {
        return !!state.selectedProfileIds[profileId];
      });
    }

    function syncSelectedProfiles(config) {
      const profiles = Array.isArray(config.profiles) ? config.profiles : [];
      const availableIds = profiles.reduce(function (result, profile) {
        result[profile.profileId] = true;
        return result;
      }, {});
      getSelectedProfileIds().forEach(function (profileId) {
        if (!availableIds[profileId]) {
          delete state.selectedProfileIds[profileId];
        }
      });
      Object.keys(state.expandedProfileIds).forEach(function (profileId) {
        if (!availableIds[profileId]) {
          delete state.expandedProfileIds[profileId];
        }
      });
    }

    function updateSelectedProfileControls() {
      const count = getSelectedProfileIds().length;
      selectedProfileCount.textContent = "已选择 " + String(count) + " 个";
      exportSelectedProfilesBtn.disabled = count === 0;
    }

    function renderProfiles(config) {
      const container = document.getElementById("profileList");
      syncSelectedProfiles(config);
      updateSelectedProfileControls();
      const profiles = getFilteredProfiles(config);
      const codexAccountId = config.codex && config.codex.accountId ? config.codex.accountId : "";
      const gridClass = profiles.length <= 0
        ? ""
        : profiles.length === 1
          ? "profile-count-1"
          : profiles.length === 2
            ? "profile-count-2"
            : profiles.length === 3
              ? "profile-count-3"
              : "profile-count-many";
      container.className = gridClass ? "account-grid " + gridClass : "account-grid";

      if (profiles.length === 0) {
        container.innerHTML = '<div class="empty-state">当前筛选条件下没有匹配账号。你可以清空筛选，或者先新增一个账号。</div>';
        return;
      }

      container.innerHTML = profiles.map(function (profile) {
        const selected = !!state.selectedProfileIds[profile.profileId];
        const expanded = !!state.expandedProfileIds[profile.profileId];
        const health = getProfileHealth(profile);
        const planType = getPlanType(profile);
        const planKey = getPlanKey(profile);
        const imageCapability = getImageCapability(profile);
        const primary = getPrimaryUsage(profile);
        const secondary = getSecondaryUsage(profile);
        const primaryClass = health.barClass || "blue";
        const secondaryClass = secondary >= 85 ? "orange" : "blue";
        const isCodexActive = Boolean(codexAccountId && profile.accountId === codexAccountId);
        const usageCorner = getUsageCorner(profile, isCodexActive);
        const apiUsageClass = profile.isActive ? " is-active" : "";
        const codexUsageClass = isCodexActive ? " is-active" : "";
        const actionButton = profile.isActive
          ? '<button class="btn-secondary is-current" type="button" disabled>网关使用中</button>'
          : '<button class="btn-secondary" type="button" data-profile-action="activate" data-profile-id="' + escapeHtml(profile.profileId) + '">应用网关</button>';
        const codexButton = isCodexActive
          ? '<button class="btn-secondary is-current codex" type="button" disabled>Codex 使用中</button>'
          : '<button class="btn-secondary" type="button" data-profile-action="apply-codex" data-profile-id="' + escapeHtml(profile.profileId) + '">应用 Codex</button>';

        return ""
          + '<article class="account-card plan-' + escapeHtml(planKey) + '" data-profile-card="' + escapeHtml(profile.profileId) + '">'
          +   (usageCorner ? '<span class="usage-corner ' + escapeHtml(usageCorner.className) + '"><span>' + escapeHtml(usageCorner.label) + "</span></span>" : "")
          +   '<div class="account-head">'
          +     '<div class="account-title">'
          +       '<div class="account-name">'
          +         '<span class="avatar">' + escapeHtml(getProfileInitial(profile)) + "</span>"
          +         "<strong>" + escapeHtml(getProfileDisplayLabel(profile)) + "</strong>"
          +       "</div>"
          +       '<div class="badge-row">'
          +         '<span class="badge brand">' + escapeHtml(planType) + "</span>"
          +         '<span class="badge ' + escapeHtml(health.badgeClass) + '">' + escapeHtml(health.label) + "</span>"
          +         '<span class="badge ' + escapeHtml(imageCapability.badgeClass) + '">' + escapeHtml(imageCapability.label) + "</span>"
          +       "</div>"
          +     "</div>"
          +     '<label class="account-select"><input type="checkbox" data-profile-select data-profile-id="' + escapeHtml(profile.profileId) + '"' + (selected ? " checked" : "") + " /><span>选择</span></label>"
          +   "</div>"
          +   '<div class="account-metrics">'
          +     '<div class="quota-row">'
          +       '<div class="quota-line"><span>' + escapeHtml(formatQuotaUsage(primary, profile, "primary")) + '</span><strong>' + escapeHtml(formatQuotaRemaining(primary, profile)) + "</strong></div>"
          +       '<div class="progress-track"><div class="progress-bar ' + escapeHtml(primaryClass) + '" style="width:' + escapeHtml(String(primary)) + '%"></div></div>'
          +     "</div>"
          +     '<div class="quota-row">'
          +       '<div class="quota-line"><span>' + escapeHtml(formatQuotaUsage(secondary, profile, "secondary")) + '</span><strong>' + escapeHtml(formatQuotaRemaining(secondary, profile)) + "</strong></div>"
          +       '<div class="progress-track"><div class="progress-bar ' + escapeHtml(secondaryClass) + '" style="width:' + escapeHtml(String(secondary)) + '%"></div></div>'
          +     "</div>"
          +   "</div>"
          +   '<div class="usage-status-row">'
          +     '<span class="usage-status' + apiUsageClass + '">'
          +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21"></path><path d="M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9"></path></svg>'
          +       "<span>API</span>"
          +       '<span class="usage-dot' + (profile.isActive ? " active" : "") + '"></span>'
          +       '<span class="usage-state-text">' + (profile.isActive ? "使用中" : "未使用") + "</span>"
          +     "</span>"
          +     '<span class="usage-status' + codexUsageClass + '">'
          +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17 10 11 4 5"></path><path d="M12 19h8"></path></svg>'
          +       "<span>Codex</span>"
          +       '<span class="usage-dot' + (isCodexActive ? " active" : "") + '"></span>'
          +       '<span class="usage-state-text">' + (isCodexActive ? "使用中" : "未使用") + "</span>"
          +     "</span>"
          +   "</div>"
          +   '<div class="compact-meta-row">'
          +     '<div class="compact-reset-list">'
          +       '<div class="compact-meta-item"><label>' + escapeHtml(getResetLabel(profile, "primary")) + '</label><strong>' + escapeHtml(describeCompactReset(profile, "primary")) + "</strong></div>"
          +       '<div class="compact-meta-item"><label>' + escapeHtml(getResetLabel(profile, "secondary")) + '</label><strong>' + escapeHtml(describeCompactReset(profile, "secondary")) + "</strong></div>"
          +     "</div>"
          +     '<div class="compact-meta-actions">'
          +       '<button class="details-toggle' + (expanded ? " is-expanded" : "") + '" type="button" data-profile-action="toggle-details" data-profile-id="' + escapeHtml(profile.profileId) + '">'
          +         "<span>" + (expanded ? "收起详情" : "查看详情") + "</span>"
          +         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"></path></svg>'
          +       "</button>"
          +     "</div>"
          +   "</div>"
          +   (expanded
            ? '<div class="meta-grid">'
              + '<div class="meta-item"><label>套餐</label><strong>' + escapeHtml(planType) + "</strong></div>"
              + '<div class="meta-item"><label>生图能力</label><strong>' + escapeHtml(imageCapability.detail) + "</strong></div>"
              + '<div class="meta-item"><label>认证状态</label><strong>' + escapeHtml(describeAuthStatus(profile)) + "</strong></div>"
              + '<div class="meta-item"><label>额度快照</label><strong>' + escapeHtml(describeQuotaSnapshot(profile)) + "</strong></div>"
              + '<div class="meta-item"><label>额度限制</label><strong>' + escapeHtml(describeQuotaLimit(profile)) + "</strong></div>"
              + '<div class="meta-item"><label>Account ID</label><code>' + escapeHtml(state.showEmails ? (profile.accountId || "未提供") : maskIdentifier(profile.accountId || "未提供")) + "</code></div>"
              + '<div class="meta-item"><label>过期时间</label><span>' + escapeHtml(formatTime(profile.expiresAt)) + "</span></div>"
              + "</div>"
            : "")
          +   '<div class="account-actions">'
          +     actionButton
          +     codexButton
          +     '<button class="btn-secondary" type="button" data-profile-action="sync-quota" data-profile-id="' + escapeHtml(profile.profileId) + '">刷新额度</button>'
          +     '<button class="btn-secondary" type="button" data-profile-action="export" data-profile-id="' + escapeHtml(profile.profileId) + '">导出</button>'
          +     '<button class="btn-danger" type="button" data-profile-action="remove" data-profile-id="' + escapeHtml(profile.profileId) + '">删除</button>'
          +   "</div>"
          + "</article>";
      }).join("");
    }

    function buildSeedRequests(config) {
      const profiles = Array.isArray(config.profiles) ? config.profiles : [];
      const now = Date.now();
      const seeds = profiles.slice(0, 5).map(function (profile, index) {
        const endpoint = index % 5 === 0
          ? "/v1/chat/completions"
          : index % 5 === 1
            ? "/v1/responses"
            : index % 5 === 2
              ? "/v1/models"
              : index % 5 === 3
                ? "/v1/images/generations"
                : "/v1/images/edits";
        const method = endpointMeta[endpoint].method;
        return {
          time: now - index * 15 * 60 * 1000,
          method: method,
          endpoint: endpoint,
          accountEmail: profile.email || "",
          accountFallback: profile.accountId || profile.profileId || "未命名账号",
          model: endpoint.indexOf("/v1/images/") === 0 ? "gpt-image-2" : config.settings.defaultModel,
          statusCode: 200,
          durationMs: 860 + index * 230 + getPrimaryUsage(profile) * 8,
          source: index % 2 === 0 ? "管理页" : "CLI",
        };
      });

      if (seeds.length === 0) {
        return [];
      }
      return seeds;
    }

    function ensureRequestHistory(config) {
      if (state.recentRequests.length === 0) {
        state.recentRequests = buildSeedRequests(config);
      }
    }

    function upsertRequestLog(entry) {
      state.recentRequests.unshift(entry);
      state.recentRequests = state.recentRequests.slice(0, 24);
    }

    function renderRequestLogs() {
      const body = document.getElementById("requestLogBody");
      const footer = document.getElementById("requestLogFooter");
      if (state.recentRequests.length === 0) {
        body.innerHTML = '<tr><td colspan="8">暂无请求记录</td></tr>';
        footer.textContent = "等待请求样本。";
        return;
      }

      body.innerHTML = state.recentRequests.map(function (item) {
        const badgeClass = item.statusCode >= 400 ? "red" : "green";
        return ""
          + "<tr>"
          +   "<td>" + escapeHtml(formatShortTime(item.time)) + "</td>"
          +   "<td><code>" + escapeHtml(item.method) + "</code></td>"
          +   "<td><code>" + escapeHtml(item.endpoint) + "</code></td>"
          +   "<td>" + escapeHtml(getLogAccountLabel(item)) + "</td>"
          +   "<td>" + escapeHtml(item.model || "-") + "</td>"
          +   '<td><span class="badge ' + badgeClass + '">' + escapeHtml(String(item.statusCode)) + "</span></td>"
          +   "<td>" + escapeHtml((item.durationMs / 1000).toFixed(2) + " s") + "</td>"
          +   "<td>" + escapeHtml(item.source || "管理页") + "</td>"
          + "</tr>";
      }).join("");

      footer.textContent = "当前展示最近 " + String(state.recentRequests.length) + " 条请求记录。";
    }

    function buildTrendSeries(config, offset, spanMinutes) {
      const profiles = Array.isArray(config.profiles) ? config.profiles : [];
      const activeUsage = config.profile ? getPrimaryUsage(config.profile) : 42;
      const base = 620 + activeUsage * 7 + offset * 90;
      const profileMix = profiles.reduce(function (sum, profile, index) {
        return sum + getPrimaryUsage(profile) * (index + 1);
      }, 0);
      const spanFactor = Math.max(1, spanMinutes / 60);

      const points = [];
      for (let index = 0; index < 12; index += 1) {
        const wave = Math.sin((index + 1 + offset) * (0.65 + spanFactor * 0.08)) * (120 + spanFactor * 18);
        const secondaryWave = Math.cos((index + 1) * (1.05 + spanFactor * 0.06) + offset) * (72 + spanFactor * 10);
        const requestImpact = state.recentRequests[index] ? state.recentRequests[index].durationMs * (offset === 0 ? 0.24 : 0.12) : 0;
        const derived = base + wave + secondaryWave + requestImpact + (profileMix % 280);
        points.push(Math.max(220, Math.min(2200, Math.round(derived))));
      }
      return points;
    }

    function makeLinePath(points, width, height, maxValue) {
      return points.map(function (value, index) {
        const x = width / (points.length - 1) * index;
        const y = height - (value / maxValue) * (height - 16) - 8;
        return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
      }).join(" ");
    }

    function renderTrend(config) {
      const svg = document.getElementById("trendSvg");
      const labels = document.getElementById("trendLabels");
      const width = 720;
      const height = 210;
      const spanMinutes = Number(document.getElementById("trendWindow").value || 60);
      const upperSeries = buildTrendSeries(config, 0, spanMinutes);
      const lowerSeries = buildTrendSeries(config, 1, spanMinutes).map(function (item) {
        return Math.max(180, item - 260);
      });
      const maxValue = Math.max.apply(null, upperSeries.concat(lowerSeries).concat([2000]));
      const pathUpper = makeLinePath(upperSeries, width, height, maxValue);
      const pathLower = makeLinePath(lowerSeries, width, height, maxValue);

      let grid = "";
      for (let i = 1; i <= 4; i += 1) {
        const y = i * 42;
        grid += '<line x1="0" y1="' + String(y) + '" x2="720" y2="' + String(y) + '" stroke="#e2e8f0" stroke-width="1" />';
      }

      svg.innerHTML = ""
        + '<defs>'
        +   '<linearGradient id="areaA" x1="0" y1="0" x2="0" y2="1">'
        +     '<stop offset="0%" stop-color="rgba(99,91,255,0.18)" />'
        +     '<stop offset="100%" stop-color="rgba(99,91,255,0.02)" />'
        +   '</linearGradient>'
        +   '<linearGradient id="areaB" x1="0" y1="0" x2="0" y2="1">'
        +     '<stop offset="0%" stop-color="rgba(59,130,246,0.16)" />'
        +     '<stop offset="100%" stop-color="rgba(59,130,246,0.02)" />'
        +   '</linearGradient>'
        + '</defs>'
        + grid
        + '<path d="' + escapeHtml(pathUpper + ' L 720 210 L 0 210 Z') + '" fill="url(#areaA)" stroke="none"></path>'
        + '<path d="' + escapeHtml(pathLower + ' L 720 210 L 0 210 Z') + '" fill="url(#areaB)" stroke="none"></path>'
        + '<path d="' + escapeHtml(pathUpper) + '" fill="none" stroke="#635bff" stroke-width="2.4" stroke-linecap="round"></path>'
        + '<path d="' + escapeHtml(pathLower) + '" fill="none" stroke="#3b82f6" stroke-width="2.4" stroke-linecap="round"></path>';

      const now = Date.now();
      labels.innerHTML = Array.from({ length: 6 }).map(function (_, index) {
        const step = Math.max(10, Math.round(spanMinutes / 6));
        const time = new Date(now - (5 - index) * step * 60 * 1000);
        return "<span>" + escapeHtml(time.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })) + "</span>";
      }).join("");
    }

    function renderServiceInfo(config) {
      const sidebar = document.getElementById("serviceInfo");
      const endpointInfo = document.getElementById("endpointInfo");
      const loggedIn = !!config.status.loggedIn;
      document.getElementById("serviceLabel").textContent = loggedIn ? "服务运行中" : "等待登录";
      document.getElementById("serviceDot").className = loggedIn ? "status-dot" : "status-dot offline";

      const rows = [
        ["管理页", config.adminUrl],
        ["Base URL", config.baseUrl],
        ["Provider", config.status.activeProvider || "openai-codex"],
        ["默认模型", config.settings.defaultModel],
        ["上游代理", config.settings.networkProxy && config.settings.networkProxy.enabled ? "已启用" : "未启用"],
        ["自动切换", config.settings.autoSwitch && config.settings.autoSwitch.enabled ? "已启用" : "未启用"],
        ["当前版本", getVersionValue(config)],
        ["当前套餐", config.profile ? getPlanType(config.profile) : "未登录"],
        ["生图能力", getImageCapability(config.profile).detail],
        ["账号状态", loggedIn ? "已登录" : "未登录"],
      ];

      sidebar.innerHTML = rows.map(function (row) {
        return ""
          + '<div class="service-row">'
          +   "<label>" + escapeHtml(row[0]) + "</label>"
          +   "<strong>" + escapeHtml(row[1]) + "</strong>"
          + "</div>";
      }).join("");

      const endpointRows = [
        ["API Base URL", config.baseUrl],
        ["当前账号", getProfileDisplayLabel(config.profile)],
        ["默认模型", config.settings.defaultModel],
        ["上游代理", config.settings.networkProxy && config.settings.networkProxy.enabled ? config.settings.networkProxy.url : "未启用"],
        ["自动切换", config.settings.autoSwitch && config.settings.autoSwitch.enabled ? "已启用" : "未启用"],
        ["版本状态", getVersionDetail(config)],
        ["当前套餐", config.profile ? getPlanType(config.profile) : "未登录"],
        ["生图能力", getImageCapability(config.profile).detail],
        ["兼容接口", config.supportedEndpoints.map(function (item) { return item.path; }).join("，")],
        ["令牌预览", config.profile ? config.profile.accessTokenPreview : "未登录"],
      ];

      endpointInfo.innerHTML = endpointRows.map(function (row) {
        return ""
          + '<div class="service-row compact">'
          +   "<label>" + escapeHtml(row[0]) + "</label>"
          +   '<code class="mono">' + escapeHtml(row[1]) + "</code>"
          + "</div>";
      }).join("");
    }

    function renderEndpoints(config) {
      endpointSelect.innerHTML = config.supportedEndpoints.map(function (item) {
        return '<option value="' + escapeHtml(item.path) + '">' + escapeHtml(item.method + " " + item.path) + "</option>";
      }).join("");

      if (!endpointSelect.value) {
        endpointSelect.value = "/v1/chat/completions";
      }

      syncTesterTabs();
    }

    function renderModelOptions(config) {
      const select = document.getElementById("defaultModel");
      select.innerHTML = config.models.map(function (model) {
        const selected = model.id === config.settings.defaultModel ? " selected" : "";
        return '<option value="' + escapeHtml(model.id) + '"' + selected + ">" + escapeHtml(model.name + " (" + model.id + ")") + "</option>";
      }).join("");
    }

    function renderModelCatalogStatus(config) {
      const hint = document.getElementById("modelCatalogHint");
      if (!config || !config.modelCatalog) {
        hint.textContent = "模型目录状态未知。";
        return;
      }

      const parts = [
        config.modelCatalog.source === "codex-cache" ? "当前读取 Codex 本地模型缓存" : "当前使用项目内置模型回退列表",
        "共 " + String(config.modelCatalog.modelCount) + " 个模型",
      ];

      if (config.modelCatalog.fetchedAt) {
        parts.push("Codex 更新时间 " + new Date(config.modelCatalog.fetchedAt).toLocaleString("zh-CN", { hour12: false }));
      }

      hint.textContent = parts.join("，") + "。";
    }

    function renderProxySettings(config) {
      const proxy = config.settings.networkProxy || {
        enabled: false,
        url: "",
        noProxy: "localhost,127.0.0.1,::1",
      };
      proxyEnabled.checked = !!proxy.enabled;
      proxyUrl.value = proxy.url || "";
      proxyNoProxy.value = proxy.noProxy || "localhost,127.0.0.1,::1";
    }

    function renderAutoSwitchSettings(config) {
      const autoSwitch = config.settings.autoSwitch || {
        enabled: false,
      };
      autoSwitchEnabled.checked = !!autoSwitch.enabled;
    }

    function isSettingsDrawerOpen() {
      return settingsDrawerBackdrop.classList.contains("is-open");
    }

    function renderSettingsFields(config, options) {
      if (!config) {
        return;
      }

      if (!(options && options.force) && state.settingsDirty && isSettingsDrawerOpen()) {
        return;
      }

      renderModelOptions(config);
      renderModelCatalogStatus(config);
      renderProxySettings(config);
      renderAutoSwitchSettings(config);
      state.settingsDirty = false;
    }

    function markSettingsDirty() {
      state.settingsDirty = true;
    }

    function resetSettingsDraft() {
      state.settingsDirty = false;
      if (state.config) {
        renderSettingsFields(state.config, {
          force: true,
        });
      }
      settingsStatus.textContent = "";
    }

    function syncHero(config) {
      const profileText = config.profile
        ? "当前账号为 " + getProfileDisplayLabel(config.profile) + "，套餐 " + getPlanType(config.profile) + "，可在右侧完成模型切换和接口调试。"
        : "尚未登录账号，请先点击右上角“新增账号”完成 OAuth 登录。";
      document.getElementById("heroDescription").textContent = profileText;
    }

    function syncImageCapabilityHint(config) {
      const capability = getImageCapability(config ? config.profile : null);
      const isImageEndpoint = endpointSelect.value === "/v1/images/generations" || endpointSelect.value === "/v1/images/edits";
      imageCapabilityHint.textContent = capability.detail;
      imageCapabilityHint.className = capability.supported && !isImageEndpoint ? "hint" : "hint warn";
      runTestBtn.disabled = isImageEndpoint && !config.profile;
      if (isImageEndpoint && !capability.supported) {
        testerMeta.textContent = capability.label;
      } else if (testerMeta.textContent === capability.label || testerMeta.textContent === "生图受限" || testerMeta.textContent === "可尝试生图") {
        testerMeta.textContent = "准备就绪";
      }
    }

    function syncTesterTabs() {
      document.querySelectorAll("[data-endpoint]").forEach(function (button) {
        const active = button.getAttribute("data-endpoint") === endpointSelect.value;
        button.classList.toggle("is-active", active);
      });
    }

    function renderConfig(config) {
      state.config = config;
      ensureRequestHistory(config);
      updateEmailToggleButton();
      syncHero(config);
      renderOverview(config);
      renderProfiles(config);
      renderSettingsFields(config);
      renderUpdatePanel(config);
      renderEndpoints(config);
      renderServiceInfo(config);
      renderTrend(config);
      renderRequestLogs();
      syncImageCapabilityHint(config);
      authStatus.textContent = config.status.loggedIn
        ? (supportsImageGeneration(config.profile)
          ? "网关已可直接转发请求，可以在下方切换默认模型并发送测试请求。"
          : "当前账号未就绪，请重新登录后再测试接口。")
        : "请先点击“新增账号”，完成 OAuth 后再测试接口。";
      if (!requestBody.value) {
        requestBody.value = buildExample(endpointSelect.value || "/v1/chat/completions");
      }
    }

    async function fetchJson(url, options) {
      const tracker = createTimingTracker();
      const response = await measureTimingPhase(tracker, "等待响应头", function () {
        return fetch(url, options);
      });
      const text = await measureTimingPhase(tracker, "读取响应体", function () {
        return response.text();
      });
      const body = await measureTimingPhase(tracker, "解析响应体", function () {
        try {
          return Promise.resolve(text ? JSON.parse(text) : null);
        } catch (_error) {
          return Promise.resolve({ raw: text });
        }
      });

      console.info("[admin:http] request timing", {
        method: options && options.method ? options.method : "GET",
        url: url,
        phasesMs: tracker.phases.reduce(function (result, phase) {
          result[phase.label] = roundDuration(phase.durationMs);
          return result;
        }, {}),
        totalMs: roundDuration(performance.now() - tracker.startedAt),
      });

      if (!response.ok) {
        const message = body && body.error && body.error.message
          ? body.error.message
          : response.status + " " + response.statusText;
        throw new Error(message);
      }

      return body;
    }

    async function refreshConfig(options) {
      const syncRuntime = !!(options && options.syncRuntime);
      const silent = !!(options && options.silent);
      const url = syncRuntime ? "/_gateway/admin/runtime-refresh" : "/_gateway/admin/config";
      const requestOptions = syncRuntime ? { method: "POST" } : undefined;
      const previousProfileId = state.config && state.config.profile ? state.config.profile.profileId : "";
      const previousStatus = authStatus.textContent;

      if (!silent) {
        testerMeta.textContent = syncRuntime ? "同步额度与版本状态" : "刷新管理状态";
      }

      const config = await fetchJson(url, requestOptions);
      renderConfig(config);
      const nextProfileId = config && config.profile ? config.profile.profileId : "";

      if (!silent) {
        testerMeta.textContent = "准备就绪";
      } else if (previousProfileId && nextProfileId && previousProfileId !== nextProfileId) {
        authStatus.textContent = "检测到额度耗尽，网关已自动切换到: " + getProfileDisplayLabel(config.profile);
      } else {
        authStatus.textContent = previousStatus;
      }

      return config;
    }

    function scheduleRuntimeRefresh() {
      window.setInterval(function () {
        if (document.hidden) {
          return;
        }

        refreshConfig({
          syncRuntime: true,
          silent: true,
        }).catch(function (error) {
          console.warn("[admin] auto runtime refresh failed", error && error.message ? error.message : String(error));
        });
      }, RUNTIME_AUTO_REFRESH_MS);
    }

    function scheduleActiveProfileRefresh() {
      window.setInterval(function () {
        if (document.hidden || !state.config || !state.config.settings || !state.config.settings.autoSwitch || !state.config.settings.autoSwitch.enabled) {
          return;
        }

        refreshConfig({
          silent: true,
        }).catch(function (error) {
          console.warn("[admin] active profile refresh failed", error && error.message ? error.message : String(error));
        });
      }, ACTIVE_PROFILE_REFRESH_MS);
    }

    async function syncQuotaAfterProfileChange(config, sourceLabel) {
      if (!config || !config.profile || config.profile.quota) {
        return config;
      }

      authStatus.textContent = "正在同步新账号的额度信息...";
      try {
        const refreshedConfig = await fetchJson("/_gateway/admin/profiles/sync-quota", {
          method: "POST",
        });
        renderConfig(refreshedConfig);
        authStatus.textContent = refreshedConfig.profile && refreshedConfig.profile.quota
          ? sourceLabel + "，额度信息已同步。"
          : sourceLabel + "，但暂未获取到额度头信息。";
        return refreshedConfig;
      } catch (error) {
        authStatus.textContent = sourceLabel + "，但额度同步失败: " + (error && error.message ? error.message : String(error));
        return config;
      }
    }

    async function login() {
      const button = oauthLoginBtn;
      setBusy(button, true);
      authStatus.textContent = "正在新增账号、等待 OAuth 完成，并同步额度信息...";
      try {
        let config = await fetchJson("/_gateway/admin/login", {
          method: "POST",
        });
        renderConfig(config);
        const baseMessage = "账号已保存，并已切换为当前使用账号: " + getProfileDisplayLabel(config.profile);
        config = await syncQuotaAfterProfileChange(config, baseMessage);
        if (config.profile && config.profile.quota) {
          authStatus.textContent = "账号已保存，已切换为当前使用账号并同步额度信息: " + getProfileDisplayLabel(config.profile);
        }
        closeAccountModal();
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    }

    async function logout() {
      const button = document.getElementById("logoutBtn");
      setBusy(button, true);
      authStatus.textContent = "正在清空全部本地账号...";
      try {
        state.recentRequests = [];
        const config = await fetchJson("/_gateway/admin/logout", {
          method: "POST",
        });
        renderConfig(config);
        authStatus.textContent = "全部本地账号已清空。";
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    }

    async function runProfileAction(action, profileId, button) {
      if (!confirmQuotaSwitch(action, profileId)) {
        return;
      }

      if (action === "export") {
        await exportProfile(profileId, button);
        return;
      }
      if (action === "apply-codex") {
        await applyProfileToCodex(profileId, button);
        return;
      }
      if (action === "sync-quota") {
        setBusy(button, true);
        authStatus.textContent = "正在刷新账号额度...";
        try {
          const config = await fetchJson("/_gateway/admin/profiles/sync-quota", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: formatJson({
              profileId: profileId,
            }),
          });
          renderConfig(config);
          authStatus.textContent = "额度信息已同步。";
        } catch (error) {
          authStatus.textContent = error.message;
        } finally {
          setBusy(button, false);
        }
        return;
      }

      setBusy(button, true);
      authStatus.textContent = action === "activate" ? "正在切换当前账号..." : "正在删除账号...";
      try {
        let config = await fetchJson(
          action === "activate" ? "/_gateway/admin/profiles/activate" : "/_gateway/admin/profiles/remove",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: formatJson({
              profileId: profileId,
            }),
          },
        );
        renderConfig(config);
        if (action === "activate") {
          const baseMessage = "当前账号已切换为: " + getProfileDisplayLabel(config.profile);
          config = await syncQuotaAfterProfileChange(config, baseMessage);
          if (config.profile && config.profile.quota) {
            authStatus.textContent = baseMessage + "，额度信息已同步。";
          }
        } else {
          authStatus.textContent = "账号已删除。";
        }
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    }

    async function applyProfileToCodex(profileId, button) {
      setBusy(button, true);
      authStatus.textContent = "正在应用账号到 Codex...";
      try {
        const result = await fetchJson("/_gateway/admin/codex/apply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: formatJson({
            profileId: profileId,
          }),
        });
        const config = result.config || await fetchJson("/_gateway/admin/config");
        renderConfig(config);
        const codex = result.codex || config.codex || {};
        authStatus.textContent = "已应用到 Codex。请关闭 Codex 应用并重新打开后生效。"
          + (codex.backupPath ? " 已备份原 auth.json。" : "");
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    }

    function downloadJsonFile(fileName, value) {
      const blob = new Blob([formatJson(value) + "\\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    async function importProfile() {
      const raw = profileImportJson.value.trim();
      if (!raw) {
        authStatus.textContent = "请先粘贴要导入的账号 JSON。";
        return;
      }

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (_error) {
        authStatus.textContent = "导入失败: JSON 格式不正确。";
        return;
      }

      setBusy(importProfileBtn, true);
      authStatus.textContent = "正在导入账号并同步额度信息...";
      try {
        let config = await fetchJson("/_gateway/admin/profiles/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: formatJson({
            profile: payload,
          }),
        });
        renderConfig(config);
        const count = config.importedProfileCount || 1;
        const baseMessage = "已导入 " + String(count) + " 个账号，并已切换为当前使用账号: " + getProfileDisplayLabel(config.profile);
        config = await syncQuotaAfterProfileChange(config, baseMessage);
        if (config.profile && config.profile.quota) {
          authStatus.textContent = "已导入 " + String(count) + " 个账号，额度信息已同步: " + getProfileDisplayLabel(config.profile);
        }
        profileImportJson.value = "";
        closeAccountModal();
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(importProfileBtn, false);
      }
    }

    async function loadImportTemplate() {
      setBusy(loadImportTemplateBtn, true);
      authStatus.textContent = "正在读取导入参考格式...";
      try {
        const result = await fetchJson("/_gateway/admin/profiles/import-template");
        profileImportJson.value = formatJson(result.profile);
        authStatus.textContent = "已填入参考格式，可替换其中的 token 后导入。";
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(loadImportTemplateBtn, false);
      }
    }

    async function exportProfile(profileId, button, options) {
      setBusy(button, true);
      authStatus.textContent = "正在导出账号配置...";
      try {
        const exportAll = !!(options && options.all);
        const profileIds = options && Array.isArray(options.profileIds) ? options.profileIds : null;
        const result = await fetchJson("/_gateway/admin/profiles/export", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: formatJson(profileIds ? { profileIds: profileIds } : exportAll ? { all: true } : { profileId: profileId }),
        });
        const profile = result.profile;
        const isBundle = profile && Array.isArray(profile.profiles);
        const suffix = isBundle
          ? "profiles-" + String(profile.profiles.length)
          : profile && profile.account_id ? profile.account_id : "active";
        downloadJsonFile("ai-zero-token-" + suffix + ".json", profile);
        authStatus.textContent = isBundle
          ? "已批量导出 " + String(profile.profiles.length) + " 个账号。请妥善保管导出的 refresh token。"
          : "账号配置已导出。请妥善保管导出的 refresh token。";
      } catch (error) {
        authStatus.textContent = error.message;
      } finally {
        setBusy(button, false);
      }
    }

    async function exportSelectedProfiles() {
      const profileIds = getSelectedProfileIds();
      if (profileIds.length === 0) {
        authStatus.textContent = "请先勾选要导出的账号。";
        return;
      }

      await exportProfile(null, exportSelectedProfilesBtn, {
        profileIds: profileIds,
      });
    }

    async function saveSettings() {
      const select = document.getElementById("defaultModel");
      const savedProxy = state.config && state.config.settings && state.config.settings.networkProxy
        ? state.config.settings.networkProxy
        : { url: "", noProxy: "localhost,127.0.0.1,::1" };
      const nextProxyUrl = proxyUrl.value.trim() || (!proxyEnabled.checked ? savedProxy.url || "" : "");
      setBusy(saveSettingsBtn, true);
      settingsStatus.textContent = "正在保存设置...";
      authStatus.textContent = "正在保存设置...";
      try {
        const config = await fetchJson("/_gateway/admin/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: formatJson({
            defaultModel: select.value,
            networkProxy: {
              enabled: proxyEnabled.checked,
              url: nextProxyUrl,
              noProxy: proxyNoProxy.value,
            },
            autoSwitch: {
              enabled: autoSwitchEnabled.checked,
            },
          }),
        });
        state.settingsDirty = false;
        renderConfig(config);
        settingsStatus.textContent = "设置已保存。";
        authStatus.textContent = "设置已保存。";
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        settingsStatus.textContent = message;
        authStatus.textContent = message;
      } finally {
        setBusy(saveSettingsBtn, false);
      }
    }

    async function testProxy() {
      setBusy(testProxyBtn, true);
      settingsStatus.textContent = "正在测试代理连接...";
      authStatus.textContent = "正在测试代理连接...";
      try {
        const result = await fetchJson("/_gateway/admin/settings/proxy-test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: formatJson({
            networkProxy: {
              enabled: proxyEnabled.checked,
              url: proxyUrl.value,
              noProxy: proxyNoProxy.value,
            },
          }),
        });
        const message = "代理测试通过: HTTP " + String(result.status)
          + "，耗时 " + String(result.elapsedMs) + " ms。";
        settingsStatus.textContent = message;
        authStatus.textContent = message;
      } catch (error) {
        const message = "代理测试失败: " + (error && error.message ? error.message : String(error));
        settingsStatus.textContent = message;
        authStatus.textContent = message;
      } finally {
        setBusy(testProxyBtn, false);
      }
    }

    async function refreshModels() {
      const button = document.getElementById("refreshModelsBtn");
      setBusy(button, true);
      settingsStatus.textContent = "正在同步 Codex 模型列表...";
      authStatus.textContent = "正在同步 Codex 模型列表...";
      try {
        await fetchJson("/_gateway/models/refresh", {
          method: "POST",
        });
        const config = await fetchJson("/_gateway/admin/config");
        renderConfig(config);
        settingsStatus.textContent = "Codex 模型列表已同步。";
        authStatus.textContent = "Codex 模型列表已同步。";
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        settingsStatus.textContent = message;
        authStatus.textContent = message;
      } finally {
        setBusy(button, false);
      }
    }

    function extractModelFromPayload(payload) {
      if (!payload || typeof payload !== "object") {
        return state.config ? state.config.settings.defaultModel : "-";
      }
      if (typeof payload.model === "string" && payload.model) {
        return payload.model;
      }
      return state.config ? state.config.settings.defaultModel : "-";
    }

    async function runTest() {
      const endpoint = endpointSelect.value;
      const meta = endpointMeta[endpoint];
      const button = document.getElementById("runTestBtn");
      const tracker = createTimingTracker();
      const initialProfileId = state.config && state.config.profile ? state.config.profile.profileId : "";
      setBusy(button, true);
      setTesterResultTab("response");
      testerMeta.textContent = "请求中: " + meta.method + " " + endpoint;
      responseBody.textContent = "请求发送中...";
      timingBody.textContent = "请求发送中...";
      clearPreview();

      try {
        const options = {
          method: meta.method,
          headers: {},
        };
        let payload = null;

        if (meta.method !== "GET") {
          const raw = requestBody.value.trim();
          payload = await measureTimingPhase(tracker, "解析请求体", function () {
            return Promise.resolve(raw ? JSON.parse(raw) : {});
          });
          options.headers["Content-Type"] = "application/json";
          options.body = await measureTimingPhase(tracker, "序列化请求体", function () {
            return Promise.resolve(formatJson(payload));
          });
        }

        const response = await measureTimingPhase(tracker, "等待响应头", function () {
          return fetch(endpoint, options);
        });
        const text = await measureTimingPhase(tracker, "读取响应体", function () {
          return response.text();
        });
        const parsed = await measureTimingPhase(tracker, "解析响应体", function () {
          try {
            return Promise.resolve(text ? JSON.parse(text) : null);
          } catch (_error) {
            return Promise.resolve(text);
          }
        });

        renderPreview(typeof parsed === "string" ? null : parsed);
        responseBody.textContent = typeof parsed === "string" ? parsed : formatJson(summarizeJson(parsed, 0));
        timingBody.textContent = renderTimingReport(
          meta.method + " " + endpoint,
          tracker,
          ["HTTP 状态: " + response.status + " " + response.statusText],
        );
        if (typeof parsed !== "string" && parsed && Array.isArray(parsed.data)
          && parsed.data.some(function (item) { return item && typeof item.b64_json === "string" && item.b64_json.length > 0; })) {
          setTesterResultTab("preview");
        }
        testerMeta.textContent = (response.ok ? "成功" : "失败") + ": HTTP " + response.status + " " + meta.method + " " + endpoint;

        upsertRequestLog({
          time: Date.now(),
          method: meta.method,
          endpoint: endpoint,
          accountEmail: state.config && state.config.profile ? state.config.profile.email || "" : "",
          accountFallback: state.config && state.config.profile
            ? state.config.profile.accountId || state.config.profile.profileId || "未登录"
            : "未登录",
          model: extractModelFromPayload(payload),
          statusCode: response.status,
          durationMs: performance.now() - tracker.startedAt,
          source: "管理页",
        });
        if (state.config) {
          renderOverview(state.config);
          renderTrend(state.config);
        }
        renderRequestLogs();
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        responseBody.textContent = message;
        timingBody.textContent = renderTimingReport(
          meta.method + " " + endpoint + "（失败）",
          tracker,
          ["错误: " + message],
        );
        testerMeta.textContent = "请求失败";
        clearPreview();
      } finally {
        if (initialProfileId) {
          await refreshConfig({
            silent: true,
          }).catch(function (error) {
            console.warn("[admin] refresh after gateway request failed", error && error.message ? error.message : String(error));
          });
        }
        setBusy(button, false);
      }
    }

    function syncFilterState() {
      state.filters.search = profileSearch.value || "";
      state.filters.status = profileStatusFilter.value || "all";
      state.filters.sort = profileSort.value || "quota-desc";
      if (state.config) {
        renderProfiles(state.config);
      }
    }

    function openAccountModal() {
      accountModal.classList.add("is-open");
      accountModal.setAttribute("aria-hidden", "false");
    }

    function closeAccountModal() {
      accountModal.classList.remove("is-open");
      accountModal.setAttribute("aria-hidden", "true");
    }

    function openContactModal() {
      contactModal.classList.add("is-open");
      contactModal.setAttribute("aria-hidden", "false");
    }

    function closeContactModal() {
      contactModal.classList.remove("is-open");
      contactModal.setAttribute("aria-hidden", "true");
    }

    function openSettingsDrawer() {
      if (state.config && !state.settingsDirty) {
        renderSettingsFields(state.config, {
          force: true,
        });
      }
      settingsDrawerBackdrop.classList.add("is-open");
      settingsDrawerBackdrop.setAttribute("aria-hidden", "false");
    }

    function closeSettingsDrawer() {
      resetSettingsDraft();
      settingsDrawerBackdrop.classList.remove("is-open");
      settingsDrawerBackdrop.setAttribute("aria-hidden", "true");
    }

    document.getElementById("loginBtn").addEventListener("click", openAccountModal);
    document.getElementById("openSettingsBtn").addEventListener("click", openSettingsDrawer);
    document.querySelectorAll("[data-open-settings]").forEach(function (button) {
      button.addEventListener("click", openSettingsDrawer);
    });
    document.getElementById("refreshBtn").addEventListener("click", function () {
      authStatus.textContent = "正在同步额度与版本状态...";
      refreshConfig({
        syncRuntime: true,
      }).then(function (config) {
        if (config && config.quotaSync) {
          const sync = config.quotaSync;
          authStatus.textContent = "额度与版本状态已刷新: " + String(sync.synced) + "/" + String(sync.total) + " 个账号成功" + (sync.failed ? "，" + String(sync.failed) + " 个失败" : "") + (sync.skipped ? "，" + String(sync.skipped) + " 个登录失效已跳过" : "") + "。";
          return;
        }
        authStatus.textContent = "额度与版本状态已刷新。";
      }).catch(function (error) {
        authStatus.textContent = error && error.message ? error.message : String(error);
      });
    });
    document.getElementById("logoutBtn").addEventListener("click", logout);
    oauthLoginBtn.addEventListener("click", login);
    importProfileBtn.addEventListener("click", importProfile);
    loadImportTemplateBtn.addEventListener("click", loadImportTemplate);
    exportSelectedProfilesBtn.addEventListener("click", exportSelectedProfiles);
    document.getElementById("closeAccountModalBtn").addEventListener("click", closeAccountModal);
    contactBtn.addEventListener("click", openContactModal);
    document.getElementById("closeContactBtn").addEventListener("click", closeContactModal);
    document.getElementById("closeImagePreviewBtn").addEventListener("click", closeImagePreviewModal);
    document.getElementById("closeSettingsDrawerBtn").addEventListener("click", closeSettingsDrawer);
    document.getElementById("refreshModelsBtn").addEventListener("click", refreshModels);
    testProxyBtn.addEventListener("click", testProxy);
    saveSettingsBtn.addEventListener("click", saveSettings);
    [document.getElementById("defaultModel"), proxyEnabled, proxyUrl, proxyNoProxy, autoSwitchEnabled].forEach(function (element) {
      element.addEventListener("input", markSettingsDirty);
      element.addEventListener("change", markSettingsDirty);
    });
    runTestBtn.addEventListener("click", runTest);
    document.querySelectorAll("[data-result-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        setTesterResultTab(button.getAttribute("data-result-tab"));
      });
    });
    toggleEmailBtn.addEventListener("click", function () {
      state.showEmails = !state.showEmails;
      updateEmailToggleButton();
      if (state.config) {
        renderConfig(state.config);
      }
    });

    document.getElementById("profileList").addEventListener("click", function (event) {
      if (event.target.closest("[data-profile-select]")) {
        return;
      }

      const button = event.target.closest("[data-profile-action]");
      if (!button) {
        return;
      }

      const action = button.getAttribute("data-profile-action");
      const profileId = button.getAttribute("data-profile-id");
      if (!action || !profileId) {
        return;
      }

      if (action === "toggle-details") {
        if (state.expandedProfileIds[profileId]) {
          delete state.expandedProfileIds[profileId];
        } else {
          state.expandedProfileIds[profileId] = true;
        }
        if (state.config) {
          renderProfiles(state.config);
        }
        return;
      }

      runProfileAction(action, profileId, button);
    });

    document.getElementById("profileList").addEventListener("change", function (event) {
      const checkbox = event.target.closest("[data-profile-select]");
      if (!checkbox) {
        return;
      }

      const profileId = checkbox.getAttribute("data-profile-id");
      if (!profileId) {
        return;
      }

      if (checkbox.checked) {
        state.selectedProfileIds[profileId] = true;
      } else {
        delete state.selectedProfileIds[profileId];
      }
      updateSelectedProfileControls();
    });

    document.getElementById("activateCurrentBtn").addEventListener("click", function () {
      if (!state.config || !state.config.profile || !state.config.profile.profileId) {
        return;
      }
      const card = document.querySelector('[data-profile-card="' + state.config.profile.profileId + '"]');
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    endpointSelect.addEventListener("change", function () {
      requestBody.value = buildExample(endpointSelect.value);
      syncTesterTabs();
      if (state.config) {
        syncImageCapabilityHint(state.config);
      }
    });

    document.querySelectorAll("[data-example]").forEach(function (button) {
      button.addEventListener("click", function () {
        const endpoint = button.getAttribute("data-example");
        endpointSelect.value = endpoint;
        requestBody.value = buildExample(endpoint);
        syncTesterTabs();
        if (state.config) {
          syncImageCapabilityHint(state.config);
        }
      });
    });

    document.querySelectorAll("[data-endpoint]").forEach(function (button) {
      button.addEventListener("click", function () {
        const endpoint = button.getAttribute("data-endpoint");
        endpointSelect.value = endpoint;
        requestBody.value = buildExample(endpoint);
        syncTesterTabs();
        if (state.config) {
          syncImageCapabilityHint(state.config);
        }
      });
    });

    document.querySelectorAll("[data-nav-target]").forEach(function (button) {
      button.addEventListener("click", function () {
        const target = button.getAttribute("data-nav-target");
        const section = document.getElementById(target);
        document.querySelectorAll("[data-nav-target]").forEach(function (item) {
          item.classList.toggle("is-active", item === button);
        });
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    profileSearch.addEventListener("input", syncFilterState);
    profileStatusFilter.addEventListener("change", syncFilterState);
    profileSort.addEventListener("change", syncFilterState);

    document.getElementById("trendWindow").addEventListener("change", function () {
      if (state.config) {
        renderTrend(state.config);
      }
    });

    contactModal.addEventListener("click", function (event) {
      if (event.target === contactModal) {
        closeContactModal();
      }
    });

    accountModal.addEventListener("click", function (event) {
      if (event.target === accountModal) {
        closeAccountModal();
      }
    });

    settingsDrawerBackdrop.addEventListener("click", function (event) {
      if (event.target === settingsDrawerBackdrop) {
        closeSettingsDrawer();
      }
    });

    imagePreviewModal.addEventListener("click", function (event) {
      if (event.target === imagePreviewModal) {
        closeImagePreviewModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && imagePreviewModal.classList.contains("is-open")) {
        closeImagePreviewModal();
      }
      if (event.key === "Escape" && contactModal.classList.contains("is-open")) {
        closeContactModal();
      }
      if (event.key === "Escape" && accountModal.classList.contains("is-open")) {
        closeAccountModal();
      }
      if (event.key === "Escape" && settingsDrawerBackdrop.classList.contains("is-open")) {
        closeSettingsDrawer();
      }
    });

    setTesterResultTab(state.testerResultTab);
    scheduleRuntimeRefresh();
    scheduleActiveProfileRefresh();
    refreshConfig().catch(function (error) {
      authStatus.textContent = error && error.message ? error.message : String(error);
      testerMeta.textContent = "加载失败";
      responseBody.textContent = authStatus.textContent;
    });
  </script>
</body>
</html>`;
}
