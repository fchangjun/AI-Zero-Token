import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { UseAdminWorkspaceResult } from "@/hooks/useAdminWorkspace";
import { ProvidersPage } from "./index";
import { GatewayServicePage } from "./components/GatewayServicePage";
import "./providers.css";

export type GatewayTab = "overview" | "accounts" | "models" | "rotation";
export function readServicesView(hash: string): { section: "external" | "gateway"; tab: GatewayTab } {
  const parts = hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "accounts") return { section: "gateway", tab: "accounts" };
  const tab = ["overview", "accounts", "models", "rotation"].includes(parts[2]) ? parts[2] as GatewayTab : "overview";
  return { section: parts[1] === "gateway" ? "gateway" : "external", tab };
}

export function ModelServicesPage({ workspace }: { workspace: UseAdminWorkspaceResult }) {
  const [view, setView] = useState(() => readServicesView(window.location.hash));
  useEffect(() => {
    function update() {
      const next = readServicesView(window.location.hash);
      setView(next);
      if (/^#\/?accounts$/.test(window.location.hash)) window.history.replaceState(null, "", "#providers/gateway/accounts");
    }
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <section className="model-services-page">
    <nav className="model-services-directions" aria-label="API 服务方向">
      <a href="#providers/external" className={view.section === "external" ? "is-active" : ""} aria-current={view.section === "external" ? "page" : undefined}><ArrowDownToLine size={21} /><span><strong>接入外部 API</strong><small>使用外部模型服务</small></span></a>
      <a href="#providers/gateway/overview" className={view.section === "gateway" ? "is-active" : ""} aria-current={view.section === "gateway" ? "page" : undefined}><ArrowUpFromLine size={21} /><span><strong>对外提供 API</strong><small>通过账号池提供统一接口</small></span><span className="gateway-nav-count">{workspace.config?.profiles.length ?? "—"} 个账号</span></a>
    </nav>
    {view.section === "external" ? <ProvidersPage config={workspace.config} onConfigUpdate={workspace.setConfig} onStatus={workspace.setStatus} onConfigChange={() => workspace.refreshConfig({ silent: true })} /> : <GatewayServicePage workspace={workspace} tab={view.tab} />}
  </section>;
}
