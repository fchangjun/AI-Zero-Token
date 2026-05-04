import type { AdminConfig } from "@/shared/types";
import { InfoRow } from "./InfoRow";

export function GatewayInfoCard(props: { config: AdminConfig | null }) {
  return (
    <section className="card service-card endpoint-card">
      <div className="section-head compact">
        <div>
          <h3>网关信息</h3>
          <p>桌面端与 CLI 共享同一套本地服务。</p>
        </div>
      </div>
      <div className="service-list compact-grid">
        <InfoRow label="管理页" value={props.config?.adminUrl || "-"} code />
        <InfoRow label="Base URL" value={props.config?.baseUrl || "-"} code />
        <InfoRow label="默认模型" value={props.config?.settings.defaultModel || "-"} />
        <InfoRow label="生图模型" value="gpt-image-2" />
        <InfoRow label="兼容接口" value={props.config?.supportedEndpoints.map((item) => item.path).join("，") || "-"} />
        <InfoRow label="令牌预览" value={props.config?.profile?.accessTokenPreview || "未登录"} code />
        <InfoRow label="模型来源" value={props.config?.modelCatalog.source || "-"} />
      </div>
    </section>
  );
}
