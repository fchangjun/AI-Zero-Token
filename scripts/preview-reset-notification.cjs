// Visual review only: isolated profile, no gateway, account reads, or native notification.
// Run after build:server: node_modules/.bin/electron scripts/preview-reset-notification.cjs
const { app } = require("electron");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = mkdtempSync(path.join(os.tmpdir(), "azt-reset-card-preview-"));
app.setPath("userData", root);
app.setName("AI Zero Token · 提醒样式预览");
app.on("window-all-closed", () => app.quit());
app.whenReady().then(async () => {
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  const load = (relative) => import(pathToFileURL(path.resolve(__dirname, "..", relative)).href);
  const { ResetCalendarService } = await load("dist/core/services/reset-calendar-service.js");
  const { showResetNotificationCard } = await load("dist/desktop/reset-notification-card.js");
  const calendar = new ResetCalendarService({
    statePath: path.join(root, "unused-calendar.json"),
    notificationsSupported: true,
    // Use the same service entry point/copy as AZT's test button. Do not start sync.
    notify: async (event) => {
      await showResetNotificationCard(event, () => {
        // This isolated design script does not start a gateway or open account data.
        console.log("Preview card selected; calendar navigation is not connected.");
      });
      console.log("Reset-calendar card preview is visible; close it with ×.");
      return true;
    },
  });
  await calendar.testNotification();
}).catch((error) => { console.error(error); app.quit(); process.exitCode = 1; });
