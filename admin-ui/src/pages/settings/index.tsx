import { SettingsForm, type SettingsPageProps } from "./SettingsForm";

export function SettingsPage(props: SettingsPageProps) {
  return <SettingsForm {...props} scope="general" />;
}
