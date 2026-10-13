const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const beijing = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Require an explicit time zone so server prerendering and browsers agree.
function timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match.map((part, index) => index ? Number(part) : part);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function labels(at) {
  const parts = Object.fromEntries(beijing.formatToParts(new Date(at)).map(part => [part.type, part.value]));
  const day = `${parts.year}年${parts.month}月${parts.day}日`;
  const clock = `${parts.hour}:${parts.minute}`;
  return { day: `${day} · 北京时间`, clock, full: `${day} ${clock} · 北京时间` };
}

function announcedAt(record, now) {
  const at = timestamp(record?.announced_at);
  return at !== null && at <= now + CLOCK_SKEW_MS ? at : null;
}

function isCompleted(record) {
  return record && (!record.status || ['completed', 'complete', 'confirmed', 'propagated'].includes(record.status));
}

function countdown(remainingMs) {
  const minutes = Math.ceil(Math.max(0, remainingMs) / 60000);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}时${String(minutes % 60).padStart(2, '0')}分`;
}

function quiet(invalidClock = false) {
  return {
    priority: false, kind: 'quiet', mode: 'empty', record: null, targetAt: null, confirmedAt: null, remainingMs: null,
    badge: '重置动态', title: '公开重置记录',
    timeCaption: '公开重置记录', timeLabel: '暂无记录', dateLabel: '有公开消息后更新',
    countdownLabel: '', countdownValue: '',
    note: invalidClock ? '通告时间暂不可核验，待获得有效时间后再判断是否为新消息。' : '暂未收录有效的新预告；不使用历史间隔推算下一次重置。',
  };
}

function lastReset(record, now) {
  if (!record) return quiet();
  const at = timestamp(record.announced_at);
  const confirmed = record.source?.type === 'x_post';
  const priority = confirmed && Math.max(0, now - at) < DAY_MS;
  const time = labels(at);
  return {
    priority, kind: priority ? 'recent' : 'quiet', mode: confirmed ? 'confirmed' : 'observed', record,
    targetAt: null, confirmedAt: confirmed ? new Date(at).toISOString() : null, remainingMs: null,
    badge: confirmed ? '✓ 已确认' : '观测记录',
    title: confirmed ? '最近一次重置，已确认' : '最近观测到的重置',
    timeCaption: confirmed ? '最近一次重置' : '最近观测', timeLabel: time.clock, dateLabel: time.day,
    countdownLabel: '', countdownValue: '',
    note: confirmed ? '显示最近一次重置的公开确认通告时间；个人额度以 Codex 显示为准。' : '时间来自数据源观测，尚无对应的公开完成通告。',
  };
}

export function getResetHeading(focus) {
  if (focus.kind === 'scheduled') return { title: '下一次重置，', emphasis: '有新预告。', description: '预计时间与 Tibo 中英文原帖。' };
  if (focus.kind === 'overdue') return { title: '重置预告，', emphasis: '等待确认。', description: '参考时间已到，关注后续完成消息。' };
  if (focus.mode === 'confirmed') return { title: '最近一次重置，', emphasis: '已确认。', description: '确认时间与 Tibo 中英文原帖。' };
  return { title: '重置动态，', emphasis: '持续记录。', description: '公开通告与历史重置记录。' };
}

/** One time-dependent policy for homepage ordering, prerendering and countdowns. */
export function getResetFocus(data, now = Date.now()) {
  const current = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(current)) return quiet(true);
  const generatedAt = data?.generatedAt == null ? null : timestamp(data.generatedAt);
  if (data?.generatedAt != null && (generatedAt === null || generatedAt > current + CLOCK_SKEW_MS)) return quiet(true);

  const records = [data?.status?.latest_reset, ...(Array.isArray(data?.records) ? data.records : [])]
    .filter(record => announcedAt(record, current) !== null)
    .sort((a, b) => timestamp(b.announced_at) - timestamp(a.announced_at));
  const latestCompleted = records.find(isCompleted);
  const completedAt = latestCompleted ? timestamp(latestCompleted.announced_at) : -Infinity;
  const scheduled = data?.status?.scheduled_reset;
  const scheduleAnnouncedAt = announcedAt(scheduled, current);
  const scheduleIsNewer = scheduled?.status === 'scheduled' && scheduleAnnouncedAt !== null && scheduleAnnouncedAt > completedAt;

  if (scheduleIsNewer) {
    const hasTarget = scheduled.scheduled_for != null && scheduled.scheduled_for !== '';
    const target = timestamp(scheduled.scheduled_for);
    const age = Math.max(0, current - scheduleAnnouncedAt);
    const isEod = /\bEOD\b|\bend of (?:the )?day\b/i.test(String(scheduled.text || ''));
    const eodLabel = /\bEOD\s+(PST|PDT)\b/i.exec(String(scheduled.text || ''))?.[0].toUpperCase() || 'EOD';
    const referenceNote = isEod
      ? `原帖仅给出 ${eodLabel}（日终）窗口；这里的时刻由数据源换算，仅作参考，并非精确到账承诺。以原帖及后续完成通告为准。`
      : '时间取自数据源的预告，仅作参考；倒计时归零不代表重置已完成，以后续完成通告为准。';

    if (target !== null && target > current) {
      const time = labels(target);
      return {
        priority: true, kind: 'scheduled', mode: 'forecast', confirmedAt: null, record: scheduled,
        targetAt: new Date(target).toISOString(), remainingMs: target - current,
        badge: '新预告 · 待重置', title: scheduled.reset_type === 'banked' ? '下一次储备重置' : '下一次额度重置',
        timeCaption: isEod ? '预计最晚 · 数据源参考时点' : '预告参考时点',
        timeLabel: time.clock, dateLabel: time.day,
        countdownLabel: '距离参考时点', countdownValue: countdown(target - current), note: referenceNote,
      };
    }
    if (target !== null && current - target < DAY_MS) {
      const time = labels(target);
      return {
        priority: true, kind: 'overdue', mode: 'forecast', confirmedAt: null, record: scheduled,
        targetAt: new Date(target).toISOString(), remainingMs: 0,
        badge: '已到参考时点 · 待确认', title: '参考时点已到，等待完成消息',
        timeCaption: isEod ? '预计最晚 · 数据源参考时点' : '预告参考时点',
        timeLabel: time.clock, dateLabel: time.day,
        countdownLabel: '当前进度', countdownValue: '待确认',
        note: `尚未收录完成确认，不代表已重置或预告失效。${referenceNote}`,
      };
    }
    if (!hasTarget && age < DAY_MS) {
      return {
        priority: true, kind: 'scheduled', mode: 'forecast', confirmedAt: null, record: scheduled, targetAt: null, remainingMs: null,
        badge: '新预告 · 时间待定', title: '下一次重置，已有预告',
        timeCaption: '下一次重置', timeLabel: '已有预告',
        dateLabel: `预告发布：${labels(scheduleAnnouncedAt).full}`,
        countdownLabel: '', countdownValue: '',
        note: '已收录新的重置预告，但尚无可用的具体时间；暂不显示倒计时，以后续通告为准。',
      };
    }
  }

  const latestPublic = records.find(record => record.source?.type === 'x_post' && isCompleted(record));
  return lastReset(latestPublic || latestCompleted, current);
}
