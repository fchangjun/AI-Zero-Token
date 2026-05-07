import { BookOpenText, Home, ImageUp, LayoutDashboard, ListChecks, Settings, ShieldCheck, Users, Wifi, type LucideIcon } from "lucide-react";

export type AppRoute = "launch" | "overview" | "accounts" | "tester" | "image-bed" | "docs" | "network" | "logs" | "settings";

export type NavRoute = {
  id: AppRoute;
  label: string;
  icon: LucideIcon;
};

export const routes: NavRoute[] = [
  { id: "launch", label: "启动页", icon: Home },
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "accounts", label: "账号管理", icon: Users },
  { id: "tester", label: "接口测试", icon: ShieldCheck },
  { id: "image-bed", label: "图床上传", icon: ImageUp },
  { id: "docs", label: "使用文档", icon: BookOpenText },
  { id: "network", label: "网络检测", icon: Wifi },
  { id: "logs", label: "请求日志", icon: ListChecks },
  { id: "settings", label: "系统设置", icon: Settings },
];

export function readRouteFromHash(): AppRoute {
  const value = window.location.hash.replace(/^#\/?/, "");
  return routes.some((route) => route.id === value) ? (value as AppRoute) : "overview";
}
