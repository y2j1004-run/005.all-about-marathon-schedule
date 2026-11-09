import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCalendar, parseDateCell, parseDistances, decodeHtml } from '../scripts/parse-calendar.mjs';
import { mergeScraped } from '../js/logic.js';
import { RACES, KR_ALIASES } from '../js/data.js';

const html = readFileSync(new URL('./fixtures/calendar-sample.html', import.meta.url), 'utf8');
const rows = parseCalendar(html, { today: '2026-11-09', baseUrl: 'http://marathon.pe.kr/index_calendar.html' });

test('parseDateCell formats', () => {
  assert.deepEqual(parseDateCell('2027-03-21'), { y: 2027, m: 3, d: 21 });
  assert.deepEqual(parseDateCell('11월 22일(일)'), { m: 11, d: 22 });
  assert.deepEqual(parseDateCell('11/15'), { m: 11, d: 15 });
  assert.deepEqual(parseDateCell('13일(일)', 12), { m: 12, d: 13 });
  assert.equal(parseDateCell('10km'), null);
});

test('parseDistances', () => {
  assert.deepEqual(parseDistances('Full, Half, 10km').sort(), ['10K', '풀코스', '하프'].sort());
  assert.ok(parseDistances('100km').includes('100K'));
});

test('parseCalendar extracts rows with year/month context', () => {
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(rows.length, 5, JSON.stringify(rows, null, 1));
  assert.equal(byName['제23회 가평자라섬 마라톤'].date, '2026-11-15');
  assert.equal(byName['제23회 가평자라섬 마라톤'].location, '경기 가평군');
  assert.equal(byName['제23회 가평자라섬 마라톤'].url, 'http://marathon.pe.kr/view.php?id=101');
  assert.equal(byName['부산 & 바다 하프마라톤'].date, '2026-11-22');
  assert.equal(byName['송년 울트라 런 100K'].date, '2026-12-13');
  assert.equal(byName['2027 서울마라톤(동아마라톤)'].date, '2027-03-21');
});

test('decodeHtml handles EUC-KR', () => {
  const bytes = new Uint8Array([...Buffer.from('<meta charset="euc-kr">'), 0xb8, 0xb6, 0xb6, 0xf3, 0xc5, 0xe6]);
  assert.match(decodeHtml(bytes), /마라톤$/);
});

test('mergeScraped matches major races and adds others', () => {
  const { raceDates, extra } = mergeScraped(RACES, rows, KR_ALIASES, '2026-11-09');
  // 동아마라톤 → seoul-marathon 대회일 갱신 (예상 2027-03-21 ±60일)
  assert.equal(raceDates['seoul-marathon'].raceDate, '2027-03-21');
  // JTBC 2026-12-06 은 예상 대회일(2027-11-07)과 60일 이상 차이 → 매칭 안 함, 별도 대회로 추가
  assert.equal(raceDates['jtbc-seoul'], undefined);
  assert.ok(extra.some((r) => r.name === 'JTBC 서울마라톤'));
  assert.ok(extra.every((r) => r.country === 'KR' && r.source === 'marathon.pe.kr'));
  assert.equal(extra.length, 4);
  // 지난 대회는 제외
  assert.equal(mergeScraped(RACES, [{ date: '2026-01-01', name: '지난 대회' }], KR_ALIASES, '2026-11-09').extra.length, 0);
});
