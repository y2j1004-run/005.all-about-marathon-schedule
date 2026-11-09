import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysBetween, addYears, shiftYearsSameWeekday, projectEdition, getStatus,
  STATUS, filterItems, sortItems, eventsForMonth, buildICS, mergeEdition, validateBackup,
} from '../js/logic.js';
import { RACES } from '../js/data.js';

const ed = { raceDate: '2027-03-07', regOpen: '2026-08-15', regClose: '2026-08-31', confirmed: false };

test('daysBetween', () => {
  assert.equal(daysBetween('2026-11-09', '2026-11-10'), 1);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(daysBetween('2026-11-10', '2026-11-09'), -1);
});

test('addYears handles leap day', () => {
  assert.equal(addYears('2028-02-29', 1), '2029-02-28');
  assert.equal(addYears('2026-08-15', 1), '2027-08-15');
});

test('shiftYearsSameWeekday keeps nth weekday', () => {
  // 2027-03-07 = 3월 첫째 일요일 → 2028-03-05 (첫째 일요일)
  assert.equal(shiftYearsSameWeekday('2027-03-07', 1), '2028-03-05');
  // 5번째 일요일이 없으면 마지막 일요일
  assert.equal(new Date(shiftYearsSameWeekday('2026-08-30', 1)).getUTCDay(), 0);
});

test('getStatus transitions', () => {
  assert.equal(getStatus(ed, '2026-08-01').status, STATUS.UPCOMING_REG);
  assert.equal(getStatus(ed, '2026-08-01').ddayText, '접수 D-14');
  assert.equal(getStatus(ed, '2026-08-20').status, STATUS.REG_OPEN);
  assert.equal(getStatus(ed, '2026-08-31').ddayText, '오늘 접수 마감');
  assert.equal(getStatus(ed, '2026-11-09').status, STATUS.REG_CLOSED);
  assert.equal(getStatus(ed, '2027-03-07').status, STATUS.RACE_DAY);
});

test('past race is projected to next year', () => {
  const s = getStatus(ed, '2027-03-08');
  assert.equal(s.edition.projected, true);
  assert.equal(s.edition.raceDate, '2028-03-05');
  assert.equal(s.edition.regOpen, '2027-08-15');
  assert.equal(s.status, STATUS.UPCOMING_REG);
});

test('mergeEdition applies override', () => {
  const e = mergeEdition({ edition: ed }, { raceDate: '2027-03-01', confirmed: true });
  assert.equal(e.raceDate, '2027-03-01');
  assert.equal(e.regOpen, '2026-08-15');
  assert.equal(e.confirmed, true);
});

const items = RACES.map((race) => ({ race, info: getStatus(race.edition, '2026-11-09'), user: {} }));

test('data integrity', () => {
  const ids = new Set();
  for (const r of RACES) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(['KR', 'JP', 'CN'].includes(r.country));
    assert.ok(['lottery', 'firstcome', 'mixed'].includes(r.method));
    assert.ok(r.howToApply.length > 0);
    const e = r.edition;
    assert.ok(e.regOpen <= e.regClose && e.regClose <= e.raceDate, `bad dates ${r.id}`);
  }
  for (const c of ['KR', 'JP', 'CN']) assert.ok(RACES.filter((r) => r.country === c).length >= 5);
});

test('filter & sort', () => {
  const jp = filterItems(items, { country: 'JP' });
  assert.ok(jp.length > 0 && jp.every((i) => i.race.country === 'JP'));
  assert.ok(filterItems(items, { query: '도쿄' }).some((i) => i.race.id === 'tokyo'));
  assert.equal(filterItems(items, { favoritesOnly: true }).length, 0);
  const sorted = sortItems(items, 'race');
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].info.daysToRace <= sorted[i].info.daysToRace);
});

test('eventsForMonth & ICS', () => {
  const evs = eventsForMonth(items, 2027, 3);
  assert.ok(evs.some((e) => e.race.id === 'tokyo' && e.type === 'race'));
  const ics = buildICS(items.filter((i) => i.race.id === 'tokyo'), new Date('2026-11-09T00:00:00Z'));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270307/);
  assert.match(ics, /DTEND;VALUE=DATE:20270308/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
});

test('validateBackup', () => {
  assert.ok(validateBackup({ version: 1, user: {}, overrides: {}, customRaces: [] }));
  assert.ok(!validateBackup({ version: 2 }));
  assert.ok(!validateBackup(null));
});
