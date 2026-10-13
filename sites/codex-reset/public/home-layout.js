import { getResetHeading } from './reset-focus.js';
// Shared presentation keeps the static first paint and the live page in sync.
export function getHomeLayout(focus) {
  const heading = getResetHeading(focus);
  return {
    priority: focus.priority,
    sectionIds: focus.priority
      ? ['home-resets-section', 'home-prices-section']
      : ['home-prices-section', 'home-resets-section'],
    titleHtml: focus.kind === 'scheduled'
      ? '重置有新信号。<span>别错过。</span>'
      : focus.kind === 'overdue'
        ? '预告时间已到。<span>等待确认。</span>'
        : focus.kind === 'recent'
          ? '重置已确认。<span>订阅有好价。</span>'
          : '好价格，新信号。<span>一眼看清。</span>',
    texts: {
      'home-hero-label': 'YOUR DAILY CODEX BRIEF',
      'home-prices-eyebrow': `${focus.priority ? '02' : '01'} / SUBSCRIPTION SHORTLIST`,
      'home-resets-eyebrow': `${focus.priority ? '01' : '02'} / CODEX RESET WATCH`,
      'home-resets-title': `${heading.title}${heading.emphasis}`,
    },
  };
}
