import { profileLabel, maskEmail, maskIdentifier } from "@/shared/lib/profiles";
import type { ProfileSummary } from "@/shared/types";

export function UsageAccountSummary(props: {
  apiProfile: ProfileSummary | null;
  codexProfile: ProfileSummary | null;
  codexEmail?: string;
  codexAccountId?: string;
  showEmails: boolean;
}) {
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
        : "未应用";

  return (
    <div className="usage-summary">
      <div className="usage-summary-row">
        <span>网关:</span>
        <strong>{apiLabel}</strong>
      </div>
      <div className="usage-summary-row">
        <span>Codex:</span>
        <strong>{codexLabel}</strong>
      </div>
    </div>
  );
}
