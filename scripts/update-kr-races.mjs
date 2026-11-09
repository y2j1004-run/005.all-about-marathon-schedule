#!/usr/bin/env node
// marathon.pe.kr 대회 일정을 읽어 data/kr-races.json 을 갱신합니다.
// GitHub Actions(.github/workflows/update-kr-races.yml)에서 매일 1회 실행됩니다.
//
// 사용법
//   node scripts/update-kr-races.mjs               # 사이트에서 받아와 갱신
//   node scripts/update-kr-races.mjs --file a.html # 저장해 둔 HTML로 갱신(파서 점검용)
//   node scripts/update-kr-races.mjs --dry-run     # 파일을 쓰지 않고 결과만 출력
//
// 안전장치: 가져오기 실패 또는 파싱 결과가 MIN_RESULTS 미만이면 기존 파일을 그대로 두고 실패(exit 1)합니다.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendar, decodeHtml } from './parse-calendar.mjs';

const SOURCE_URL = 'http://marathon.pe.kr/index_calendar.html';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../data/kr-races.json');
const MIN_RESULTS = 5;
const KEEP_PAST_DAYS = 7;

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const dryRun = args.includes('--dry-run');

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function load() {
  if (fileArg) return decodeHtml(new Uint8Array(await readFile(fileArg)));
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'all-about-marathon-schedule (+https://github.com/y2j1004-run/005.all-about-marathon-schedule)' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${res.headers.get('location') || ''}`.trim());
  return decodeHtml(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || '');
}

async function main() {
  const today = kstToday();
  const html = await load();
  const cutoff = new Date(Date.parse(today) - KEEP_PAST_DAYS * 86400_000).toISOString().slice(0, 10);
  const races = parseCalendar(html, { today, baseUrl: SOURCE_URL }).filter((r) => r.date >= cutoff);

  console.log(`파싱 결과: ${races.length}개 대회 (기준일 ${today})`);
  races.slice(0, 10).forEach((r) => console.log(`  ${r.date}  ${r.name}  [${r.location}] ${r.distances.join(',')}`));

  if (races.length < MIN_RESULTS) {
    throw new Error(`파싱 결과가 ${races.length}개뿐입니다. 사이트 구조가 바뀌었을 수 있어 기존 데이터를 유지합니다.`);
  }

  let prev = null;
  try {
    prev = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {}
  if (prev && JSON.stringify(prev.races) === JSON.stringify(races)) {
    console.log('변경 사항 없음');
    return;
  }

  const out = { source: SOURCE_URL, updatedAt: new Date().toISOString(), count: races.length, races };
  if (dryRun) return console.log('(dry-run) 파일을 쓰지 않았습니다.');
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`저장: ${OUT}`);
}

main().catch((e) => {
  console.error(`갱신 실패: ${e.message}`);
  process.exit(1);
});
