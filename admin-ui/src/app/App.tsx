import { AppShell } from "@/layouts/AppShell";
import { useAdminWorkspace } from "@/hooks/useAdminWorkspace";

export function App() {
  const workspace = useAdminWorkspace();
  return <AppShell workspace={workspace} />;
}
