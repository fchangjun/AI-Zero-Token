import type { ResetCalendarNotification } from "./reset-calendar-types.js";

/** Shared by test delivery and real events. A forecast never implies quota recovery. */
export function resetNotificationContent(
  stage: "watch" | "scheduled" | "confirmed",
  type: "regular" | "banked" = "regular",
  scheduledFor: string | null = null,
  now = Date.now(),
): Pick<ResetCalendarNotification, "title" | "body" | "stage" | "detail"> {
  if (stage === "watch") return {
    stage, title: "Codex 补给雷达有动静",
    body: "额度困难户先集合！有新情报，重置还未确认。",
  };
  if (stage === "scheduled") {
    let detail = "补给在路上，具体几点还得再等等。";
    if (scheduledFor && Number.isFinite(Date.parse(scheduledFor))) {
      const time = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date(scheduledFor));
      detail = `${Date.parse(scheduledFor) <= now ? "原预计" : "预计"} ${time}（北京时间）`;
    }
    return type === "banked" ? {
      stage, title: "Codex 储备补给有预告",
      body: "先把粮袋备好，储备重置尚待发放确认。", detail,
    } : {
      stage, title: "Codex 预告来了，准备接粮",
      body: "别把刷新键按包浆了，补给有新消息！重置还待确认。", detail,
    };
  }
  return type === "banked" ? {
    stage, title: "Codex 储备重置已发放",
    body: "备用粮有消息了！不代表账号额度已恢复。",
  } : {
    stage, title: "Codex 重置确认，去查收",
    body: "情报站等到这条了！请以账号实际额度为准。",
  };
}
