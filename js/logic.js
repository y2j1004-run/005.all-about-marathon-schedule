// 순수 로직 모듈: DOM/저장소에 의존하지 않아 테스트 가능합니다.

const DAY = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → UTC 자정 Date */
export function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Date → 'YYYY-MM-DD' (UTC 기준) */
export function formatISO(d) {
  return d.toISOString().slice(0, 10);
}

/** 로컬 시간 기준 오늘 날짜 'YYYY-MM-DD' */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** a → b 까지 남은 일수 (b - a) */
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function addYears(iso, n) {
  if (!iso) return iso;
  const d = parseDate(iso);
  const y = d.getUTCFullYear() + n;
  const m = d.getUTCMonth();
  // 2/29 → 평년이면 2/28
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return formatISO(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

/** 같은 주차·요일로 n년 이동 (마라톤은 대부분 'N번째 일요일' 패턴) */
export function shiftYearsSameWeekday(iso, n) {
  if (!iso) return iso;
  const d = parseDate(iso);
  const weekday = d.getUTCDay();
  const nth = Math.ceil(d.getUTCDate() / 7); // 1~5번째
  const y = d.getUTCFullYear() + n;
  const m = d.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  let day = 1 + offset + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day > lastDay) day -= 7; // 5번째 요일이 없으면 마지막 요일
  return formatISO(new Date(Date.UTC(y, m, day)));
}

/**
 * 대회일이 지났다면 예년 패턴으로 다음 회차를 추정합니다.
 * 대회일은 같은 주차·요일로, 접수일은 같은 날짜로 1년씩 이동합니다.
 */
export function projectEdition(edition, today) {
  if (!edition || !edition.raceDate) return { ...edition, projected: false };
  let e = { ...edition, projected: false };
  let guard = 0;
  while (daysBetween(today, e.raceDate) < 0 && guard++ < 50) {
    e = {
      raceDate: shiftYearsSameWeekday(e.raceDate, 1),
      regOpen: addYears(e.regOpen, 1),
      regClose: addYears(e.regClose, 1),
      resultDate: addYears(e.resultDate, 1),
      confirmed: false,
      projected: true,
    };
  }
  return e;
}

export const STATUS = {
  UPCOMING_REG: 'upcoming_reg', // 접수 예정
  REG_OPEN: 'reg_open', // 접수 중
  REG_CLOSED: 'reg_closed', // 접수 마감, 대회 예정
  RACE_DAY: 'race_day', // 대회 당일
  UNKNOWN: 'unknown',
};

export const STATUS_LABEL = {
  upcoming_reg: '접수 예정',
  reg_open: '접수 중',
  reg_closed: '접수 마감',
  race_day: '대회 당일',
  unknown: '일정 미정',
};

/**
 * 오늘 기준 대회 상태와 D-day 정보를 계산합니다.
 * @returns {{status, edition, label, ddayText, daysToRace, daysToOpen, daysToClose}}
 */
export function getStatus(edition, today) {
  const e = projectEdition(edition, today);
  if (!e.raceDate) return { status: STATUS.UNKNOWN, edition: e, label: STATUS_LABEL.unknown, ddayText: '' };

  const daysToRace = daysBetween(today, e.raceDate);
  const daysToOpen = e.regOpen ? daysBetween(today, e.regOpen) : null;
  const daysToClose = e.regClose ? daysBetween(today, e.regClose) : null;

  let status;
  let ddayText;
  if (daysToRace === 0) {
    status = STATUS.RACE_DAY;
    ddayText = '오늘 대회!';
  } else if (daysToOpen !== null && daysToOpen > 0) {
    status = STATUS.UPCOMING_REG;
    ddayText = `접수 D-${daysToOpen}`;
  } else if (daysToClose !== null && daysToClose >= 0) {
    status = STATUS.REG_OPEN;
    ddayText = daysToClose === 0 ? '오늘 접수 마감' : `마감 D-${daysToClose}`;
  } else if (daysToOpen === null && daysToClose === null) {
    status = STATUS.UNKNOWN;
    ddayText = `대회 D-${daysToRace}`;
  } else {
    status = STATUS.REG_CLOSED;
    ddayText = `대회 D-${daysToRace}`;
  }
  return { status, edition: e, label: STATUS_LABEL[status], ddayText, daysToRace, daysToOpen, daysToClose };
}

/** 기본 대회 데이터에 사용자의 일정 수정(override)을 반영 */
export function mergeEdition(race, override) {
  if (!override) return race.edition;
  return { ...race.edition, ...override };
}

/**
 * 목록 필터링
 * @param {Array} items  [{race, info, user}]
 * @param {Object} f     {country, method, status, month, query, favoritesOnly, myStatus}
 */
export function filterItems(items, f = {}) {
  const q = (f.query || '').trim().toLowerCase();
  return items.filter(({ race, info, user }) => {
    if (f.country && f.country !== 'ALL' && race.country !== f.country) return false;
    if (f.method && f.method !== 'ALL' && race.method !== f.method) return false;
    if (f.status && f.status !== 'ALL' && info.status !== f.status) return false;
    if (f.month && f.month !== 'ALL') {
      const m = info.edition.raceDate ? +info.edition.raceDate.slice(5, 7) : null;
      if (m !== +f.month) return false;
    }
    if (f.favoritesOnly && !(user && user.favorite)) return false;
    if (f.myStatus && f.myStatus !== 'ALL' && (user?.myStatus || 'none') !== f.myStatus) return false;
    if (q) {
      const hay = [race.name, race.localName, race.city, race.intro, ...(race.distances || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** 정렬: 'race'(대회일순) | 'reg'(다가오는 접수 이벤트순) | 'name' */
export function sortItems(items, by = 'race') {
  const arr = [...items];
  if (by === 'name') return arr.sort((a, b) => a.race.name.localeCompare(b.race.name, 'ko'));
  if (by === 'reg') {
    const key = ({ info }) => {
      if (info.status === STATUS.REG_OPEN) return info.daysToClose;
      if (info.status === STATUS.UPCOMING_REG) return 1000 + info.daysToOpen;
      return 100000 + (info.daysToRace ?? 0);
    };
    return arr.sort((a, b) => key(a) - key(b));
  }
  return arr.sort((a, b) => (a.info.daysToRace ?? 1e9) - (b.info.daysToRace ?? 1e9));
}

/** 특정 연·월 달력에 표시할 이벤트 목록 */
export function eventsForMonth(items, year, month /* 1-12 */) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const out = [];
  for (const { race, info } of items) {
    const e = info.edition;
    const push = (date, type) => date && date.startsWith(prefix) && out.push({ date, type, race });
    push(e.raceDate, 'race');
    push(e.regOpen, 'open');
    push(e.regClose, 'close');
    push(e.resultDate, 'result');
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ───────────── iCalendar(.ics) 내보내기 ─────────────

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(iso) {
  return iso.replace(/-/g, '');
}

function nextDay(iso) {
  return formatISO(new Date(parseDate(iso).getTime() + DAY));
}

/** 대회 목록 → .ics 문자열 (접수 시작/마감/대회일 종일 일정) */
export function buildICS(items, stamp = new Date()) {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//All About Marathon Schedule//KO', 'CALSCALE:GREGORIAN'];
  const types = [
    ['regOpen', '접수 시작'],
    ['regClose', '접수 마감'],
    ['resultDate', '추첨 결과 발표'],
    ['raceDate', '대회일'],
  ];
  for (const { race, info } of items) {
    const e = info.edition;
    for (const [key, label] of types) {
      if (!e[key]) continue;
      const note = e.confirmed ? '' : ' (예상 일정 – 공식 요강 확인 필요)';
      lines.push(
        'BEGIN:VEVENT',
        `UID:${race.id}-${key}-${e[key]}@all-about-marathon`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${icsDate(e[key])}`,
        `DTEND;VALUE=DATE:${icsDate(nextDay(e[key]))}`,
        `SUMMARY:${icsEscape(`[${label}] ${race.name}`)}`,
        `DESCRIPTION:${icsEscape(`${race.city} · ${race.typical}${note}${race.website ? '\n' + race.website : ''}`)}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** 사용자 데이터 백업 JSON 검증 */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.version !== 1) return false;
  return typeof obj.user === 'object' && typeof obj.overrides === 'object' && Array.isArray(obj.customRaces);
}
