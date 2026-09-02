export const STAT_DEFS = [
  { key: 'carry', label: 'Carry', group: 'attack', shortcut: 'c' },
  { key: 'linebreak', label: 'Line break', group: 'attack', shortcut: 'b' },
  { key: 'offload', label: 'Offload', group: 'attack', shortcut: 'o' },
  { key: 'try', label: 'Try', group: 'attack', shortcut: 'y' },
  { key: 'assist', label: 'Try assist', group: 'attack', shortcut: 'a' },

  { key: 'own_lineout_won', label: 'Own lineout won', group: 'setpiece', shortcut: 'q' },
  { key: 'own_lineout_lost', label: 'Own lineout lost', group: 'setpiece', shortcut: 'w' },
  { key: 'def_lineout_won', label: 'Defence lineout won', group: 'setpiece', shortcut: 'e' },
  { key: 'def_lineout_lost', label: 'Defence lineout lost', group: 'setpiece', shortcut: 'r' },
  { key: 'own_scrum_won', label: 'Own scrum won', group: 'setpiece', shortcut: 's' },
  { key: 'own_scrum_lost', label: 'Own scrum lost', group: 'setpiece', shortcut: 'd' },
  { key: 'def_scrum_won', label: 'Defence scrum won', group: 'setpiece', shortcut: 'f' },
  { key: 'def_scrum_lost', label: 'Defence scrum lost', group: 'setpiece', shortcut: 'g' },

  { key: 'kick', label: 'Kick', group: 'kicking', shortcut: 'k' },
  { key: 'kickoff', label: 'Kick-off', group: 'kicking', shortcut: 'i' },
  { key: 'conversion', label: 'Conversion', group: 'kicking', shortcut: 'v' },

  { key: 'tackle', label: 'Tackle', group: 'defence', shortcut: 't' },
  { key: 'missed_tackle', label: 'Missed tackle', group: 'defence', shortcut: 'm' },
  { key: 'turnover_won', label: 'Turnover won', group: 'defence', shortcut: 'u' },

  { key: 'turnover_lost', label: 'Turnover conceded', group: 'errors', shortcut: 'x' },
  { key: 'penalty_conceded', label: 'Penalty conceded', group: 'errors', shortcut: 'p' },
  { key: 'unforced_error', label: 'Unforced error', group: 'errors', shortcut: 'n' },
  { key: 'card', label: 'Card', group: 'errors', shortcut: 'j' },
];

export const GROUP_LABELS = {
  attack: 'Attack',
  setpiece: 'Set piece',
  kicking: 'Kicking',
  defence: 'Defence',
  errors: 'Errors & discipline',
};

export const GROUP_ORDER = ['attack', 'setpiece', 'kicking', 'defence', 'errors'];

export const BUCKETS = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];

export const ERROR_KEYS = ['turnover_lost', 'penalty_conceded', 'unforced_error', 'card'];

export function parseClockMinutes(clock) {
  if (!clock) return null;
  const trimmed = String(clock).trim();
  let m = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  m = trimmed.match(/^(\d{1,3})$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function bucketIndex(minutes) {
  if (minutes == null) return -1;
  if (minutes >= 80) return 8;
  return Math.floor(minutes / 10);
}

export function parsePlayerLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let m = trimmed.match(/^(\d{1,3})\s*[-.,:]?\s*(.+)$/);
  if (m && m[2].trim()) {
    return { jersey: m[1], name: m[2].trim() };
  }
  m = trimmed.match(/^(.+?)[\s,;-]+(\d{1,3})$/);
  if (m && m[1].trim()) {
    return { name: m[1].trim(), jersey: m[2] };
  }
  return { name: trimmed, jersey: '' };
}

export function pct(num, den) {
  return den > 0 ? Math.round((num / den) * 100) : null;
}
