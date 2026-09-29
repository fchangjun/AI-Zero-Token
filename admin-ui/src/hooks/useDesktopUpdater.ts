import { useEffect, useState } from "react";
import type { DesktopUpdateState } from "../../../src/desktop/update-types";

export function useDesktopUpdater(workspaceReady: boolean) {
  const bridge = window.desktopUpdater;
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let receivedEvent = false;
    const unsubscribe = bridge.onState((next) => {
      receivedEvent = true;
      if (active) { setState(next); setBridgeError(false); }
    });
    bridge.getState().then((next) => {
      if (active && !receivedEvent) setState(next);
    }).catch(() => { if (active) setBridgeError(true); });
    return () => { active = false; unsubscribe(); };
  }, [bridge]);

  useEffect(() => {
    if (bridge && workspaceReady) {
      void bridge.ready().catch(() => setBridgeError(true));
    }
  }, [bridge, workspaceReady]);

  async function action(name: "check" | "download" | "cancel" | "install" | "openDetails" | "closeDetails" | "dismissNotice") {
    if (!bridge) return;
    setBridgeError(false);
    // State events are authoritative; an older in-flight command must not overwrite newer progress.
    try { await bridge[name](); } catch { setBridgeError(true); }
  }
  return { state, bridgeError, action, supported: Boolean(bridge && state?.phase !== "unsupported") };
}
