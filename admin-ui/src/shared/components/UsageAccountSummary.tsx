import { profileLabel, maskEmail, maskIdentifier } from "@/shared/lib/profiles";
import type { ProfileSummary } from "@/shared/types";
import { useT } from "@/i18n";

export function UsageAccountSummary(props: {
  apiProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexEmail?: string;
  codexAccountId?: string;
  showEmails: boolean;
}) {
  const t = useT();
  const apiLabel = profileLabel(props.apiProfile, props.showEmails);
  const codexLabel = props.codexProfile
    ? profileLabel(props.codexProfile, props.showEmails)
    : props.codexEmail
      ? props.showEmails
        ? props.codexEmail
        : maskEmail(props.codexEmail)
      : props.codexAccountId
        ? props.showEmails
          ? props.codexAccountId
          : maskIdentifier(props.codexAccountId)
        : t("usageAccountSummary.notApplied");

  return (
    <div className="usage-summary">
      <div className="usage-summary-row">
        <span>{t("usageAccountSummary.gateway")}:</span>
        <strong>{apiLabel}</strong>
      </div>
      <div className="usage-summary-row">
        <span>{t("usageAccountSummary.codex")}:</span>
        <strong>{codexLabel}</strong>
      </div>
    </div>
  );
}
