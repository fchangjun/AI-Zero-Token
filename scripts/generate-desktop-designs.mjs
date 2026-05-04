import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const outDir = join(process.cwd(), "design", "desktop-pages");
const W = 1440;
const H = 960;

const colors = {
  bg: "#F8FAFC",
  panel: "#FFFFFF",
  panelSoft: "#F1F5F9",
  line: "#E2E8F0",
  lineStrong: "#CBD5E1",
  text: "#0F172A",
  soft: "#334155",
  muted: "#64748B",
  brand: "#635BFF",
  brandSoft: "#EEF2FF",
  blue: "#3B82F6",
  green: "#22C55E",
  orange: "#F59E0B",
  red: "#EF4444",
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function text(x, y, value, size = 14, fill = colors.text, weight = 500, extra = "") {
  return `<text x="${x}" y="${y}" font-family="Inter, PingFang SC, Arial, sans-serif" font-size="${size}" fill="${fill}" font-weight="${weight}" letter-spacing="0" ${extra}>${esc(value)}</text>`;
}

function rect(x, y, w, h, r = 12, fill = colors.panel, stroke = colors.line, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
}

function line(x1, y1, x2, y2, stroke = colors.line, width = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
}

function pill(x, y, label, tone = "brand", w = undefined) {
  const palette = {
    brand: [colors.brand, "#EEF2FF"],
    green: ["#15803D", "#DCFCE7"],
    blue: ["#1D4ED8", "#DBEAFE"],
    orange: ["#B45309", "#FEF3C7"],
    red: ["#DC2626", "#FEE2E2"],
    muted: [colors.muted, "#F1F5F9"],
  }[tone];
  const width = w || Math.max(56, label.length * 11 + 22);
  return `${rect(x, y, width, 24, 999, palette[1], "none")}${text(x + 12, y + 16, label, 12, palette[0], 700)}`;
}

function iconBox(x, y, tone = "brand") {
  const map = {
    brand: [colors.brand, "#EEF2FF"],
    blue: [colors.blue, "#DBEAFE"],
    green: ["#15803D", "#DCFCE7"],
    orange: ["#B45309", "#FEF3C7"],
    red: ["#DC2626", "#FEE2E2"],
  }[tone];
  return `<g>${rect(x, y, 34, 34, 10, map[1], "none")}<path d="M${x + 11} ${y + 18}h12M${x + 17} ${y + 12}v12" stroke="${map[0]}" stroke-width="2.2" stroke-linecap="round"/></g>`;
}

function button(x, y, label, primary = false, w = 108) {
  return `${rect(x, y, w, 38, 10, primary ? colors.brand : colors.panel, primary ? colors.brand : colors.line)}${text(x + 18, y + 24, label, 13, primary ? "#FFFFFF" : colors.soft, 750)}`;
}

function sidebar(active) {
  const items = [
    ["launch", "启动页"],
    ["overview", "概览"],
    ["accounts", "账号管理"],
    ["tester", "接口测试"],
    ["logs", "请求日志"],
  ];
  let y = 150;
  const nav = items
    .map(([key, label]) => {
      const activeItem = key === active;
      const row = `${rect(24, y, 216, 44, 12, activeItem ? colors.brandSoft : "#FFFFFF", activeItem ? "#DFE3FF" : "#FFFFFF")}
        <circle cx="45" cy="${y + 22}" r="6" fill="${activeItem ? colors.brand : colors.lineStrong}"/>
        ${text(60, y + 28, label, 15, activeItem ? colors.brand : colors.soft, activeItem ? 800 : 650)}`;
      y += 54;
      return row;
    })
    .join("");
  return `
    ${rect(12, 12, 252, 936, 24, colors.panel, colors.line, 'filter="url(#shadow)"')}
    <g>
      ${rect(30, 34, 42, 42, 12, "#111827", "none")}
      <path d="M42 48h15M42 58h22M42 68h16" stroke="#F8FAFC" stroke-width="3" stroke-linecap="round"/>
      <path d="M62 45l6 8-6 8-6-8 6-8Z" fill="${colors.blue}"/>
      ${text(84, 56, "AI Zero Token", 18, colors.text, 850)}
      ${text(84, 78, "桌面端本地网关工作台", 12, colors.muted, 600)}
    </g>
    ${nav}
    ${rect(24, 748, 216, 170, 18, colors.panel, colors.line)}
    ${text(42, 780, "服务状态", 17, colors.text, 850)}
    ${pill(144, 760, "运行中", "green", 76)}
    ${text(42, 812, "Base URL", 12, colors.muted, 650)}
    ${text(42, 834, "127.0.0.1:8799/v1", 13, colors.text, 750)}
    ${text(42, 864, "默认模型", 12, colors.muted, 650)}
    ${text(42, 886, "gpt-5.4", 13, colors.text, 750)}
  `;
}

function topbar(title, desc) {
  return `
    ${text(296, 44, title, 32, colors.text, 850)}
    ${text(296, 72, desc, 14, colors.muted, 550)}
    ${button(1058, 36, "复制 URL", false, 92)}
    ${button(1162, 36, "设置", false, 78)}
    ${button(1252, 36, "新增账号", true, 110)}
  `;
}

function statCards() {
  const stats = [
    ["账号总数", "15", "本地账号池", "blue"],
    ["当前账号", "ci*****@asd.ilidc.cf", "API + Codex", "green"],
    ["默认模型", "gpt-5.4", "全局默认", "brand"],
    ["今日请求", "128", "最近 24 小时", "blue"],
    ["平均耗时", "1.24s", "近 20 次", "orange"],
    ["服务状态", "运行中", "可转发请求", "green"],
  ];
  return stats
    .map(([label, value, sub, tone], i) => {
      const x = 296 + i * 174;
      return `${rect(x, 110, 158, 104, 14, colors.panel, colors.line)}
        ${iconBox(x + 16, 128, tone)}
        ${text(x + 16, 180, label, 12, colors.muted, 800)}
        ${text(x + 16, 202, value, value.length > 12 ? 14 : 24, colors.text, 850)}
        ${text(x + 16, 228, sub, 12, colors.muted, 600)}`;
    })
    .join("");
}

function chart(x, y, w, h) {
  const pointsA = [
    [x + 28, y + h - 48],
    [x + 130, y + h - 88],
    [x + 238, y + h - 70],
    [x + 350, y + h - 132],
    [x + 458, y + h - 106],
    [x + 570, y + h - 160],
  ];
  const pointsB = pointsA.map(([px, py], i) => [px, py + 34 + (i % 2) * 15]);
  const path = (pts) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" ");
  return `${rect(x, y, w, h, 18, colors.panel, colors.line)}
    ${text(x + 24, y + 36, "请求耗时趋势", 20, colors.text, 850)}
    ${text(x + 24, y + 60, "网关响应与上游响应的桌面监控视图", 13, colors.muted, 550)}
    ${pill(x + w - 132, y + 26, "近 1 小时", "muted", 92)}
    ${line(x + 24, y + 104, x + w - 24, y + 104)}
    ${line(x + 24, y + 154, x + w - 24, y + 154)}
    ${line(x + 24, y + 204, x + w - 24, y + 204)}
    <path d="${path(pointsB)}" fill="none" stroke="${colors.blue}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${path(pointsA)}" fill="none" stroke="${colors.brand}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${pill(x + 24, y + h - 40, "网关响应", "brand", 86)}
    ${pill(x + 122, y + h - 40, "上游响应", "blue", 86)}`;
}

function accountCard(x, y, email, plan, health, used, tone = "green", active = false) {
  return `${rect(x, y, 330, 210, 16, colors.panel, active ? colors.brand : colors.line)}
    ${active ? `<rect x="${x}" y="${y}" width="330" height="4" rx="2" fill="${colors.brand}"/>` : ""}
    <circle cx="${x + 30}" cy="${y + 34}" r="15" fill="${tone === "orange" ? "#FEF3C7" : "#EEF2FF"}"/>
    ${text(x + 54, y + 38, email, 14, colors.text, 800)}
    ${pill(x + 54, y + 52, plan, "brand", 58)}
    ${pill(x + 120, y + 52, health, tone, 74)}
    ${text(x + 20, y + 96, "主额度 · 已用 " + used + "%", 12, colors.soft, 700)}
    ${text(x + 254, y + 96, "剩余 " + (100 - used) + "%", 12, colors.text, 800)}
    ${rect(x + 20, y + 110, 290, 8, 999, colors.panelSoft, "none")}
    <rect x="${x + 20}" y="${y + 110}" width="${Math.round(290 * used / 100)}" height="8" rx="999" fill="${tone === "orange" ? colors.orange : colors.blue}"/>
    ${text(x + 20, y + 148, "API", 12, colors.muted, 750)}
    ${pill(x + 52, y + 132, active ? "使用中" : "未使用", active ? "green" : "muted", 68)}
    ${text(x + 132, y + 148, "Codex", 12, colors.muted, 750)}
    ${pill(x + 180, y + 132, active ? "使用中" : "未使用", active ? "blue" : "muted", 68)}
    ${button(x + 20, y + 162, active ? "网关使用中" : "应用网关", false, 130)}
    ${button(x + 166, y + 162, "导出", false, 70)}
    ${button(x + 248, y + 162, "删除", false, 62)}`;
}

function table(x, y, w, h) {
  const rows = [
    ["03:55", "POST", "/v1/chat/completions", "gpt-5.4", "200", "868ms"],
    ["03:40", "POST", "/v1/images/generations", "gpt-image-2", "200", "1.10s"],
    ["03:25", "POST", "/v1/images/edits", "gpt-image-2", "200", "1.33s"],
    ["03:10", "POST", "/v1/responses", "gpt-5.4", "200", "2.35s"],
    ["02:55", "GET", "/v1/models", "gpt-5.4", "200", "2.30s"],
  ];
  let out = `${rect(x, y, w, h, 18, colors.panel, colors.line)}
    ${text(x + 24, y + 38, "请求日志", 20, colors.text, 850)}
    ${text(x + 24, y + 62, "最近请求的接口、模型、状态与耗时", 13, colors.muted, 550)}
    ${line(x + 24, y + 88, x + w - 24, y + 88)}
    ${text(x + 24, y + 118, "时间", 12, colors.muted, 800)}
    ${text(x + 112, y + 118, "方法", 12, colors.muted, 800)}
    ${text(x + 214, y + 118, "接口", 12, colors.muted, 800)}
    ${text(x + 520, y + 118, "模型", 12, colors.muted, 800)}
    ${text(x + 720, y + 118, "状态", 12, colors.muted, 800)}
    ${text(x + 810, y + 118, "耗时", 12, colors.muted, 800)}`;
  rows.forEach((row, i) => {
    const ry = y + 154 + i * 46;
    out += `${line(x + 24, ry - 28, x + w - 24, ry - 28)}
      ${text(x + 24, ry, row[0], 13, colors.soft, 650)}
      ${pill(x + 104, ry - 18, row[1], row[1] === "GET" ? "muted" : "blue", 62)}
      ${text(x + 214, ry, row[2], 13, colors.text, 650)}
      ${text(x + 520, ry, row[3], 13, colors.soft, 650)}
      ${pill(x + 714, ry - 18, row[4], "green", 52)}
      ${text(x + 810, ry, row[5], 13, colors.soft, 650)}`;
  });
  return out;
}

function testerPanel(x, y, w, h) {
  return `${rect(x, y, w, h, 18, colors.panel, colors.line)}
    ${text(x + 24, y + 38, "快速测试", 20, colors.text, 850)}
    ${pill(x + w - 106, y + 20, "准备就绪", "brand", 82)}
    ${rect(x + 24, y + 70, w - 48, 46, 12, colors.panelSoft, "none")}
    ${pill(x + 34, y + 81, "Chat", "brand", 64)}
    ${pill(x + 106, y + 81, "Images", "muted", 76)}
    ${pill(x + 190, y + 81, "Edits", "muted", 64)}
    ${pill(x + 262, y + 81, "Responses", "muted", 98)}
    ${pill(x + 368, y + 81, "Models", "muted", 76)}
    ${text(x + 24, y + 150, "请求体 JSON", 13, colors.soft, 750)}
    ${rect(x + 24, y + 166, w - 48, 224, 12, "#0F172A", "#0F172A")}
    ${text(x + 44, y + 198, '{', 14, "#E2E8F0", 650)}
    ${text(x + 64, y + 226, '"model": "gpt-5.4",', 14, "#E2E8F0", 650)}
    ${text(x + 64, y + 254, '"messages": [{"role":"user","content":"请只回复 OK"}]', 14, "#E2E8F0", 650)}
    ${text(x + 44, y + 282, '}', 14, "#E2E8F0", 650)}
    ${button(x + w - 156, y + 410, "发送请求", true, 126)}
    ${text(x + 24, y + 448, "响应 JSON", 13, colors.soft, 750)}
    ${rect(x + 24, y + 466, w - 48, h - 492, 12, "#0F172A", "#0F172A")}
    ${text(x + 44, y + 500, "等待请求...", 14, "#CBD5E1", 650)}`;
}

function shell(active, title, desc, body, overlay = "") {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0F172A" flood-opacity=".06"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${colors.bg}"/>
    ${sidebar(active)}
    ${topbar(title, desc)}
    ${body}
    ${overlay}
  </svg>`;
}

const pages = {
  "01-launch": shell(
    "launch",
    "启动页",
    "面向桌面端的启动入口，聚合服务状态、快捷操作和产品视觉。",
    `${rect(296, 110, 470, 760, 22, colors.panel, colors.line, 'filter="url(#shadow)"')}
      ${pill(328, 158, "Desktop Gateway", "brand", 128)}
      ${text(328, 220, "本地网关桌面工作台", 36, colors.text, 850)}
      ${text(328, 262, "账号池、接口测试、请求日志和系统设置拆分为独立路由，左侧导航固定，右侧按任务切换。", 15, colors.muted, 550)}
      ${button(328, 310, "新增账号", true, 112)}
      ${button(452, 310, "管理账号", false, 112)}
      ${button(576, 310, "测试接口", false, 112)}
      ${rect(328, 380, 382, 170, 16, colors.panelSoft, colors.line)}
      ${text(352, 418, "当前账号", 12, colors.muted, 700)}${text(352, 442, "ci*****@asd.ilidc.cf", 16, colors.text, 850)}
      ${text(352, 484, "服务状态", 12, colors.muted, 700)}${pill(352, 502, "已登录并运行", "green", 106)}
      ${text(352, 548, "Base URL", 12, colors.muted, 700)}${text(352, 572, "127.0.0.1:8799/v1", 14, colors.text, 750)}
      ${rect(800, 110, 530, 760, 22, colors.panel, colors.line, 'filter="url(#shadow)"')}
      ${rect(846, 170, 438, 300, 24, "#F8FAFC", colors.line)}
      ${rect(884, 220, 120, 78, 16, "#EFF6FF", "#BFDBFE")}${rect(1030, 220, 120, 78, 16, "#F0FDF4", "#BBF7D0")}
      ${chart(846, 510, 438, 270)}
      ${text(884, 264, "账号池", 20, colors.text, 850)}${text(1030, 264, "接口状态", 20, colors.text, 850)}`
  ),
  "02-overview": shell(
    "overview",
    "概览",
    "全局状态、运行摘要与网关信息集中呈现。",
    `${statCards()}${chart(296, 246, 674, 330)}
      ${rect(994, 246, 344, 330, 18, colors.panel, colors.line)}
      ${text(1018, 284, "网关信息", 20, colors.text, 850)}
      ${text(1018, 326, "管理页", 12, colors.muted, 700)}${text(1018, 350, "127.0.0.1:8799", 14, colors.text, 750)}
      ${text(1018, 394, "Base URL", 12, colors.muted, 700)}${text(1018, 418, "127.0.0.1:8799/v1", 14, colors.text, 750)}
      ${text(1018, 462, "兼容接口", 12, colors.muted, 700)}${text(1018, 486, "Chat / Images / Responses / Models", 14, colors.text, 750)}
      ${table(296, 606, 1042, 286)}`
  ),
  "03-accounts": shell(
    "accounts",
    "账号管理",
    "以卡片方式横向比较账号套餐、额度和应用状态。",
    `${rect(296, 110, 1042, 76, 18, colors.panel, colors.line)}
      ${text(320, 156, "搜索邮箱、账号 ID 或 Profile ID", 14, colors.muted, 600)}
      ${pill(760, 136, "全部状态", "muted", 92)}${pill(866, 136, "默认排序", "muted", 92)}
      ${button(1184, 129, "导出所选", false, 112)}
      ${accountCard(296, 218, "ci*****@asd.ilidc.cf", "plus", "健康", 1, "green", true)}
      ${accountCard(650, 218, "fa*****@gmail.com", "free", "健康", 3, "green")}
      ${accountCard(1004, 218, "35*****@qq.com", "free", "额度耗尽", 100, "orange")}
      ${accountCard(296, 462, "yi*****@gmail.com", "free", "健康", 19, "green")}
      ${accountCard(650, 462, "ed*****@hotmail.com", "plus", "即将耗尽", 78, "orange")}
      ${accountCard(1004, 462, "al*****@hotmail.com", "team", "健康", 22, "green")}`
  ),
  "04-tester": shell(
    "tester",
    "接口测试",
    "独立接口测试工作区，支持文本、模型列表和图片接口。",
    `${testerPanel(296, 110, 700, 760)}
      ${rect(1024, 110, 314, 760, 18, colors.panel, colors.line)}
      ${text(1048, 148, "接口说明", 20, colors.text, 850)}
      ${text(1048, 184, "当前 Endpoint", 12, colors.muted, 700)}${text(1048, 210, "POST /v1/chat/completions", 14, colors.text, 800)}
      ${text(1048, 258, "默认模型", 12, colors.muted, 700)}${text(1048, 284, "gpt-5.4", 14, colors.text, 800)}
      ${text(1048, 332, "图片能力", 12, colors.muted, 700)}${pill(1048, 350, "gpt-image-2 可用", "green", 126)}
      ${rect(1048, 414, 242, 180, 16, "#F8FAFC", colors.line)}
      ${text(1072, 456, "响应会进入右侧预览区", 14, colors.soft, 750)}
      ${text(1072, 486, "图片接口返回缩略图，点击可打开大图。", 13, colors.muted, 550)}
      ${button(1048, 632, "复制 Base URL", false, 132)}`
  ),
  "05-logs": shell(
    "logs",
    "请求日志",
    "最近请求的接口、账号、模型、状态和耗时。",
    `${table(296, 110, 1042, 620)}
      ${rect(296, 764, 1042, 108, 18, colors.panel, colors.line)}
      ${text(320, 804, "日志策略", 18, colors.text, 850)}
      ${text(320, 834, "桌面端默认展示最近 20 条调试请求。服务端持久日志可以在后续版本增加过滤、导出和保留周期设置。", 14, colors.muted, 550)}`
  ),
  "06-settings": shell(
    "overview",
    "系统设置",
    "设置以抽屉形态出现，不打断当前工作流。",
    `${statCards()}${chart(296, 246, 674, 330)}`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#0F172A" opacity=".22"/>
      ${rect(930, 0, 510, 960, 0, colors.panel, colors.line, 'filter="url(#shadow)"')}
      ${text(966, 54, "系统设置", 24, colors.text, 850)}
      ${text(966, 80, "CLI、桌面端和本地服务共享这些设置。", 13, colors.muted, 550)}
      ${line(966, 112, 1396, 112)}
      ${text(966, 156, "模型", 18, colors.text, 850)}
      ${text(966, 194, "默认文本模型", 13, colors.soft, 750)}${rect(966, 212, 378, 42, 10, colors.panel, colors.line)}${text(984, 239, "gpt-5.4", 14, colors.text, 700)}
      ${button(966, 276, "同步 Codex 模型", false, 150)}
      ${line(966, 334, 1396, 334)}
      ${text(966, 378, "上游代理", 18, colors.text, 850)}
      ${pill(966, 402, "未启用", "muted", 72)}
      ${text(966, 458, "代理地址", 13, colors.soft, 750)}${rect(966, 476, 378, 42, 10, colors.panel, colors.line)}${text(984, 503, "http://127.0.0.1:7890", 14, colors.muted, 600)}
      ${text(966, 552, "No Proxy", 13, colors.soft, 750)}${rect(966, 570, 378, 42, 10, colors.panel, colors.line)}${text(984, 597, "localhost,127.0.0.1,::1", 14, colors.text, 600)}
      ${line(966, 650, 1396, 650)}
      ${text(966, 694, "账号自动切换", 18, colors.text, 850)}
      ${text(966, 726, "当前 API 账号额度耗尽后自动切换。", 14, colors.muted, 550)}
      ${button(1234, 882, "保存设置", true, 110)}`
  ),
};

await mkdir(outDir, { recursive: true });

for (const [name, svg] of Object.entries(pages)) {
  const svgPath = join(outDir, `${name}.svg`);
  const pngPath = join(outDir, `${name}.png`);
  await writeFile(svgPath, svg, "utf8");
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", pngPath, svgPath]);
}

console.log(`Generated ${Object.keys(pages).length} desktop design pages in ${outDir}`);
