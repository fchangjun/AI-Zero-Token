import type { DesktopUpdateBridge } from "../../src/desktop/update-types";

declare global {
  interface Window { desktopUpdater?: DesktopUpdateBridge; }
}
