// marathon.pe.kr 대회 일정 페이지 파서
//
// 사이트 마크업이 바뀌어도 최대한 버티도록 "구조"가 아니라 "내용" 기준으로 파싱합니다.
//   1) 가장 안쪽 <tr> 행만 추출 (중첩 테이블 레이아웃 대응)
//   2) 각 행에서 날짜 패턴이 있는 셀을 찾고
//   3) 대회명(마라톤/런/레이스 등 키워드) · 지역 · 종목 · 링크를 추출
//   4) 행 사이에 나오는 "2027년", "12월" 같은 제목으로 연/월 문맥을 추적
// 결과가 너무 적으면 호출 측(update-kr-races.mjs)에서 기존 데이터를 유지합니다.

const REGIONS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남',
  '전북', '전남', '경북', '경남', '제주', '충청', '전라', '경상',
];
const NAME_HINT = /마라톤|런|RUN|레이스|race|달리기|대회|트레일|울트라|하프|걷기|역전/i;
const WEEKDAY_ONLY = /^\(?[일월화수목금토]\)?(요일)?$/;

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function textOf(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 응답 바이트 → 문자열 (EUC-KR/UTF-8 자동 판별) */
export function decodeHtml(bytes, contentType = '') {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType) || /charset\s*=\s*["']?([\w-]+)/i.exec(head);
  let enc = (m ? m[1] : 'utf-8').toLowerCase();
  if (['ks_c_5601-1987', 'ksc5601', 'cp949', 'x-windows-949', 'euc_kr'].includes(enc)) enc = 'euc-kr';
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 셀 텍스트에서 날짜 추출 → {y?, m, d} | null */
export function parseDateCell(t, ctxMonth) {
  let m;
  if ((m = /(20\d{2})\s*[./\-년]\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})/.exec(t))) return { y: +m[1], m: +m[2], d: +m[3] };
  if ((m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(t))) return { m: +m[1], d: +m[2] };
  if (t.length <= 16 && (m = /^(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/.exec(t))) return { m: +m[1], d: +m[2] };
  if (ctxMonth && t.length <= 8 && (m = /^(\d{1,2})\s*(일)?\s*(\(?[일월화수목금토]\)?)?$/.exec(t)) && (m[2] || m[3]))
    return { m: ctxMonth, d: +m[1] };
  return null;
}

export function parseDistances(t) {
  const out = new Set();
  if (/풀\s*코스|풀\b|full/i.test(t)) out.add('풀코스');
  if (/하프|half/i.test(t)) out.add('하프');
  if (/울트라|ultra/i.test(t)) out.add('울트라');
  for (const m of t.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:km|k)(?![a-z])/gi)) {
    const n = parseFloat(m[1]);
    if (n === 42.195) out.add('풀코스');
    else if (n === 21.0975 || n === 21.1) out.add('하프');
    else if (n > 0 && n <= 200) out.add(`${m[1]}K`);
  }
  return [...out];
}

function absolutize(href, base) {
  if (!href || /^(javascript|mailto|#)/i.test(href)) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function inferYear(m, today) {
  const ty = +today.slice(0, 4);
  const tm = +today.slice(5, 7);
  // 목록은 오늘 이후 일정이 대부분 → 오늘보다 2개월 이상 이전 월이면 다음 해로 간주
  return m < tm - 2 ? ty + 1 : ty;
}

/**
 * @param {string} html
 * @param {{today: string, baseUrl?: string}} opt
 * @returns {Array<{date, name, location, distances, url, raw}>}
 */
export function parseCalendar(html, { today, baseUrl = 'http://marathon.pe.kr/' }) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const rowRe = /<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi;
  const results = [];
  const seen = new Set();
  let ctxYear = null;
  let ctxMonth = null;
  let last = 0;
  let m;

  const scanContext = (text) => {
    const y = /(20\d{2})\s*년/.exec(text);
    if (y) ctxYear = +y[1];
    const mo = /(?:^|\s)(\d{1,2})\s*월(?!\s*\d)/.exec(text);
    if (mo && +mo[1] >= 1 && +mo[1] <= 12) ctxMonth = +mo[1];
  };

  while ((m = rowRe.exec(clean))) {
    scanContext(textOf(clean.slice(last, m.index)));
    last = rowRe.lastIndex;

    const rowHtml = m[1];
    const cellsHtml = rowHtml.split(/<t[dh]\b[^>]*>/i).slice(1);
    const cells = cellsHtml.map(textOf).filter((c) => c !== '');
    if (cells.length === 0) continue;

    // 제목 행(연·월 표시) 처리
    if (cells.length <= 2 && cells.join(' ').length <= 20) {
      scanContext(cells.join(' '));
      if (!cells.some((c) => NAME_HINT.test(c))) continue;
    }

    // 날짜 셀 찾기 (앞쪽 3개 셀)
    let date = null;
    let dateIdx = -1;
    for (let i = 0; i < Math.min(3, cells.length); i++) {
      date = parseDateCell(cells[i], ctxMonth);
      if (date) { dateIdx = i; break; }
    }
    if (!date) continue;

    const rest = cells.filter((_, i) => i !== dateIdx && !WEEKDAY_ONLY.test(cells[i]));
    const name = rest.find((c) => NAME_HINT.test(c) && /[가-힣A-Za-z]{2,}/.test(c) && c.length <= 80)
      || rest.find((c) => /[가-힣]{3,}/.test(c) && c.length <= 80);
    if (!name) continue;

    const year = date.y || ctxYear || inferYear(date.m, today);
    if (!validDate(year, date.m, date.d)) continue;
    const iso = `${year}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;

    const location = rest.find((c) => c !== name && c.length <= 40 && REGIONS.some((r) => c.includes(r))) || '';
    const hrefs = [...rowHtml.matchAll(/href\s*=\s*["']?([^"' >]+)/gi)].map((h) => absolutize(decodeEntities(h[1]), baseUrl)).filter(Boolean);

    const key = `${iso}|${name.replace(/\s+/g, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      date: iso,
      name: name.replace(/\s+/g, ' '),
      location,
      distances: parseDistances(cells.join(' ')),
      url: hrefs[0] || null,
    });
  }
  return results.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko'));
}
