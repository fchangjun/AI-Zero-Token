import type { RequestLog } from "@/shared/types";
import { RequestLogs } from "./components/RequestLogs";

export function LogsPage(props: { logs: RequestLog[] }) {
  return <RequestLogs logs={props.logs} />;
}
