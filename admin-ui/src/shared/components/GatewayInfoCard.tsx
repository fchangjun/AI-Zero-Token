import type { AdminConfig } from "@/shared/types";
import { InfoRow } from "./InfoRow";
import { useT } from "@/i18n";

export function GatewayInfoCard(props: { config: AdminConfig | null }) {
  const t = useT();
  return (
    <section className="card service-card endpoint-card">
      <div className="section-head compact">
        <div>
          <h3>{t("gatewayInfo.title")}</h3>
          <p>{t("gatewayInfo.description")}</p>
        </div>
      </div>
      <div className="service-list compact-grid">
        <InfoRow label={t("gatewayInfo.adminPage")} value={props.config?.adminUrl || "-"} code />
        <InfoRow label="Base URL" value={props.config?.baseUrl || "-"} code />
        <InfoRow label={t("gatewayInfo.defaultModel")} value={props.config?.settings.defaultModel || "-"} />
        <InfoRow label={t("gatewayInfo.imageModel")} value="gpt-image-2" />
        <InfoRow label={t("gatewayInfo.compatibleEndpoints")} value={props.config?.supportedEndpoints.map((item) => item.path).join(t("gatewayInfo.listSeparator")) || "-"} />
        <InfoRow label={t("gatewayInfo.tokenPreview")} value={props.config?.profile?.accessTokenPreview || t("gatewayInfo.notSignedIn")} code />
        <InfoRow label={t("gatewayInfo.modelSource")} value={props.config?.modelCatalog.source || "-"} />
      </div>
    </section>
  );
}
