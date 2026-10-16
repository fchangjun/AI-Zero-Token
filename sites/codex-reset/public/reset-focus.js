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

const COMPLETED_STATUSES = ['completed', 'complete', 'confirmed', 'propagated'];
function isCompleted(record) {
  return record && (!record.status || COMPLETED_STATUSES.includes(record.status));
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

function emptyNext(unavailable = false, note = '') {
  return {
    priority: false, kind: unavailable ? 'unavailable' : 'unannounced', mode: 'empty',
    record: null, targetAt: null, confirmedAt: null, remainingMs: null,
    badge: unavailable ? '暂无法确认' : '暂无新预告', title: '下一次重置',
    timeCaption: '下一次重置', timeLabel: unavailable ? '暂无法确认' : '等待新消息',
    dateLabel: unavailable ? '获得有效数据后更新' : '有新消息后更新',
    countdownLabel: '', countdownValue: '',
    note: note || (unavailable ? '尚无足够的有效数据，暂时无法判断下一次预告状态。' : '尚未收录下一次重置预告；不使用历史间隔推算时间。'),
  };
}

function unavailableLatest(note = '') {
  return { ...quiet(true), kind: 'unavailable', title: '最近一次重置', timeCaption: '最近一次重置',
    note: note || '暂未收录可核验的完成记录；不能据此判断是否已发生重置。' };
}

function forecast(scheduled, current) {
  const announced = timestamp(scheduled.announced_at);
  const target = timestamp(scheduled.scheduled_for);
  const isEod = /\bEOD\b|\bend of (?:the )?day\b/i.test(String(scheduled.text || ''));
  const eodLabel = /\bEOD\s+(PST|PDT)\b/i.exec(String(scheduled.text || ''))?.[0].toUpperCase() || 'EOD';
  const referenceNote = isEod
    ? `原帖仅给出 ${eodLabel}（日终）窗口；这里的时刻由数据源换算，仅作参考，并非精确到账承诺。以原帖及后续完成通告为准。`
    : '时间取自数据源的预告，仅作参考；倒计时归零不代表重置已完成，以后续完成通告为准。';
  if (target === null) {
    return {
      priority: Math.max(0, current - announced) < DAY_MS, kind: 'scheduled', mode: 'forecast',
      confirmedAt: null, record: scheduled, targetAt: null, remainingMs: null,
      badge: '已有预告 · 时间待定', title: '下一次重置，已有预告',
      timeCaption: '下一次重置', timeLabel: '已有预告',
      dateLabel: `预告发布：${labels(announced).full}`,
      countdownLabel: '', countdownValue: '',
      note: '已收录重置预告，但尚无可用的具体时间；暂不显示倒计时，以后续通告为准。',
    };
  }
  const time = labels(target);
  const future = target > current;
  return {
    priority: future || current - target < DAY_MS,
    kind: future ? 'scheduled' : 'overdue', mode: 'forecast', confirmedAt: null, record: scheduled,
    targetAt: new Date(target).toISOString(), remainingMs: Math.max(0, target - current),
    badge: future ? '新预告 · 待重置' : '已到参考时点 · 待确认',
    title: future ? (scheduled.reset_type === 'banked' ? '下一次储备重置' : '下一次额度重置') : '参考时点已到，等待完成消息',
    timeCaption: isEod ? '预计最晚 · 数据源参考时点' : '预告参考时点',
    timeLabel: time.clock, dateLabel: time.day,
    countdownLabel: future ? '距离参考时点' : '当前进度',
    countdownValue: future ? countdown(target - current) : '待确认',
    note: future ? referenceNote : `尚未收录完成确认，不代表已重置或预告失效。${referenceNote}`,
  };
}

function tiboPostId(source) {
  if (source?.type !== 'x_post' || source.author !== 'thsottiaux') return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || !['x.com', 'twitter.com'].includes(url.hostname)) return null;
    return /^\/thsottiaux\/status\/(\d+)\/?$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

function activeWatch(watch, current, completedAt) {
  const observed = timestamp(watch?.observed_at);
  const expires = timestamp(watch?.expires_at);
  const id = tiboPostId(watch?.source);
  if (!id || observed === null || expires === null || observed > current + CLOCK_SKEW_MS
      || observed <= completedAt || expires <= observed || expires <= current) return null;
  const record = {
    id, status: 'watch', reset_type: 'regular', announced_at: watch.observed_at,
    text: typeof watch.text === 'string' ? watch.text : '', source: { ...watch.source },
    ...(typeof watch.summaryZh === 'string' ? { summaryZh: watch.summaryZh } : {}),
    ...(typeof watch.translationZh === 'string' ? { translationZh: watch.translationZh } : {}),
    ...(watch.translationMeta !== undefined ? { translationMeta: watch.translationMeta } : {}),
  };
  return {
    priority: true, kind: 'watch', mode: 'watch', record,
    observedAt: new Date(observed).toISOString(), expiresAt: new Date(expires).toISOString(),
    watchChance: Number.isFinite(watch.reset_chance_percent) && watch.reset_chance_percent >= 0 && watch.reset_chance_percent <= 100 ? watch.reset_chance_percent : null,
    forecastWindow: typeof watch.forecast_window === 'string' && watch.forecast_window.trim() ? watch.forecast_window.trim() : null,
    watchUntil: labels(expires).full,
    targetAt: null, confirmedAt: null, remainingMs: null,
    badge: '观察信号 · 非正式预告', title: '下一次重置，有新迹象',
    timeCaption: '下一次重置观察', timeLabel: '有新迹象', dateLabel: `观察记录：${labels(observed).full}`,
    countdownLabel: '', countdownValue: '',
    note: '这是 Codex Resets 根据公开原帖作出的第三方判断，不是 Tibo 的正式重置预告。观察有效期结束不代表已重置，以正式公告和账户状态为准。',
  };
}

export function getResetHeading(focus) {
  if (focus.kind === 'scheduled') return { title: '下一次重置，', emphasis: '有新预告。', description: '下一次预告与最近确认记录，中英文原帖一起看。' };
  if (focus.kind === 'overdue') return { title: '重置预告，', emphasis: '等待确认。', description: '下一次预告仍待确认，同时保留最近一次确认记录。' };
  if (focus.kind === 'watch') return { title: '下一次重置，', emphasis: '有新迹象。', description: '第三方观察信号与最近确认记录；观察不代表正式预告或重置已完成。' };
  if (focus.mode === 'confirmed') return { title: '最近一次重置，', emphasis: '已确认。', description: '上次确认记录与下一次重置预告。' };
  return { title: '重置动态，', emphasis: '持续记录。', description: '上次重置记录与下一次预告分别展示。' };
}

/** Independent completion and forecast states: elapsed time never confirms or cancels a reset. */
export function getResetState(data, now = Date.now()) {
  const current = now instanceof Date ? now.getTime() : now;
  const generatedAt = data?.generatedAt == null ? null : timestamp(data.generatedAt);
  if (!Number.isFinite(current) || !data || typeof data !== 'object' || Array.isArray(data)
      || (data.generatedAt != null && (generatedAt === null || generatedAt > current + CLOCK_SKEW_MS))) {
    const latest = unavailableLatest(), next = emptyNext(true);
    return { latest, next, focus: { ...quiet(true), latest, next } };
  }

  const rawScheduled = data.status?.scheduled_reset;
  // A closed forecast retains its original announcement time; it is not a completion record.
  const records = [data.status?.latest_reset, ...(Array.isArray(data.records) ? data.records : [])]
    .filter(record => announcedAt(record, current) !== null)
    .sort((a, b) => timestamp(b.announced_at) - timestamp(a.announced_at));
  const completed = records.find(record => record.source?.type === 'x_post' && isCompleted(record));
  const observed = records.find(record => record.source?.type === 'observed' && isCompleted(record));
  const latest = completed || observed ? lastReset(completed || observed, current) : unavailableLatest();
  const scheduleAnnouncedAt = announcedAt(rawScheduled, current);
  const matchingCompletion = scheduleAnnouncedAt !== null && typeof rawScheduled.reset_type === 'string' && rawScheduled.reset_type !== ''
    ? records.find(record => record.source?.type === 'x_post' && isCompleted(record)
      && record.reset_type === rawScheduled.reset_type && timestamp(record.announced_at) >= scheduleAnnouncedAt)
    : null;
  const validScheduledStatus = ['scheduled', 'cancelled', 'canceled', ...COMPLETED_STATUSES].includes(rawScheduled?.status);
  const hasScheduleField = data.status && Object.hasOwn(data.status, 'scheduled_reset');
  let next;

  // Closing evidence must be a public completion of the same reset type, never an observation.
  if (rawScheduled != null && !validScheduledStatus) {
    next = emptyNext(true, '已收录的预告缺少有效状态，暂时无法确认其是否仍在等待重置。');
  } else if (rawScheduled && matchingCompletion) {
    next = emptyNext(false, '该预告之后已有公开完成通告；下一次重置暂无新预告。');
  } else if (rawScheduled && scheduleAnnouncedAt !== null && ['cancelled', 'canceled'].includes(rawScheduled.status)) {
    next = emptyNext(false, '该重置预告已明确取消；等待下一次公开消息。');
  } else if (rawScheduled && scheduleAnnouncedAt !== null && COMPLETED_STATUSES.includes(rawScheduled.status)) {
    next = emptyNext(false, '该预告已结束；最近一次重置时间以独立的确认记录为准。');
  } else if (rawScheduled?.status === 'scheduled' && scheduleAnnouncedAt !== null) {
    const hasTarget = rawScheduled.scheduled_for != null && rawScheduled.scheduled_for !== '';
    const target = timestamp(rawScheduled.scheduled_for);
    // An invalid supplied date is missing evidence, not evidence of no forecast.
    next = hasTarget && target === null
      ? emptyNext(true, '已收录预告，但参考时间无法核验；以原帖及后续更新为准。')
      : forecast(rawScheduled, current);
  } else if (rawScheduled != null || !hasScheduleField || rawScheduled === undefined) {
    next = emptyNext(true, '尚无可核验的预告状态；以有效的公开数据和原帖为准。');
  } else {
    next = emptyNext(!(completed || observed));
  }

  if (next.mode !== 'forecast') {
    const watch = activeWatch(data.status?.active_watch, current, completed ? timestamp(completed.announced_at) : -Infinity);
    if (watch) next = watch;
  }
  const primary = ['forecast', 'watch'].includes(next.mode) ? next : latest.mode !== 'empty' ? latest : quiet(true);
  const focus = { ...primary, latest, next };
  return { latest, next, focus };
}

/** Compatibility selector for heading/order consumers, with both independent states attached. */
export function getResetFocus(data, now = Date.now()) {
  return getResetState(data, now).focus;
}
