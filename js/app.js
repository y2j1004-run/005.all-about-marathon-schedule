import { RACES, COUNTRIES, METHODS } from './data.js';
import {
  getStatus, mergeEdition, filterItems, sortItems, eventsForMonth,
  buildICS, validateBackup, todayISO, STATUS,
} from './logic.js';
import { store, MY_STATUS } from './store.js';

// ───────────── 유틸 ─────────────
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (iso) => {
  if (!iso) return '미정';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}.${m}.${d}(${WEEK[new Date(y, m - 1, d).getDay()]})`;
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ───────────── 데이터 조합 ─────────────
const TODAY = todayISO();

function allRaces() {
  return [...RACES, ...store.get().customRaces];
}

function buildItems() {
  return allRaces().map((race) => {
    const edition = mergeEdition(race, store.getOverride(race.id));
    return { race, info: getStatus(edition, TODAY), user: store.getUser(race.id) };
  });
}

const ui = {
  view: 'dashboard',
  filters: { query: '', country: 'ALL', status: 'ALL', method: 'ALL', month: 'ALL', favoritesOnly: false },
  sort: 'race',
  myStatus: 'ALL',
  cal: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })(),
};

// ───────────── 공통 조각 ─────────────
const flag = (c) => COUNTRIES[c]?.flag || '🏳️';
const statusBadge = (info) => `<span class="badge b-${info.status}">${info.label}</span>`;
const estBadge = (e) =>
  e.confirmed
    ? '<span class="badge b-ok">확정</span>'
    : `<span class="badge b-est">${e.projected ? '예년 기준 추정' : '예상'}</span>`;

function miniItem({ race, info }, sub) {
  return `<li data-id="${esc(race.id)}">
    <span>${flag(race.country)}</span>
    <span class="name">${esc(race.name)}<br><span class="sub">${esc(sub)}</span></span>
    <span class="dday">${esc(info.ddayText)}</span>
  </li>`;
}
const emptyLi = (t) => `<li class="empty">${t}</li>`;

// ───────────── 대시보드 ─────────────
function renderDashboard(items) {
  const open = sortItems(items.filter((i) => i.info.status === STATUS.REG_OPEN), 'reg');
  const soon = sortItems(items.filter((i) => i.info.status === STATUS.UPCOMING_REG && i.info.daysToOpen <= 90), 'reg');
  const races = sortItems(items.filter((i) => i.info.daysToRace >= 0 && i.info.daysToRace <= 120), 'race');
  const mine = sortItems(items.filter((i) => i.user.favorite || (i.user.myStatus && i.user.myStatus !== 'none')), 'race');

  const byCountry = (c) => items.filter((i) => i.race.country === c).length;
  $('#stats').innerHTML = [
    ['전체 대회', items.length],
    ['🇰🇷 한국', byCountry('KR')],
    ['🇯🇵 일본', byCountry('JP')],
    ['🇨🇳 중국', byCountry('CN')],
    ['지금 접수 중', open.length],
    ['내 관심 대회', mine.length],
  ].map(([l, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('');

  $('#dash-open').innerHTML = open.map((i) => miniItem(i, `마감 ${fmt(i.info.edition.regClose)} · ${METHODS[i.race.method]}`)).join('') || emptyLi('현재 접수 중인 대회가 없습니다.');
  $('#dash-soon').innerHTML = soon.map((i) => miniItem(i, `접수 시작 ${fmt(i.info.edition.regOpen)}`)).join('') || emptyLi('90일 내 접수 시작 예정 대회가 없습니다.');
  $('#dash-race').innerHTML = races.map((i) => miniItem({ ...i, info: { ...i.info, ddayText: i.info.daysToRace === 0 ? '오늘!' : `D-${i.info.daysToRace}` } }, `${fmt(i.info.edition.raceDate)} · ${i.race.city}`)).join('') || emptyLi('120일 내 대회가 없습니다.');
  $('#dash-mine').innerHTML = mine.map((i) => miniItem(i, `${MY_STATUS[i.user.myStatus || 'none']} · ${fmt(i.info.edition.raceDate)}`)).join('') || emptyLi('대회 카드의 ⭐를 눌러 관심 대회를 추가하세요.');
}

// ───────────── 목록 ─────────────
function cardHTML({ race, info, user }) {
  const e = info.edition;
  const my = user.myStatus && user.myStatus !== 'none' ? `<span class="badge b-my">${MY_STATUS[user.myStatus]}</span>` : '';
  return `<article class="card" data-id="${esc(race.id)}">
    <div class="card-top">
      <span style="font-size:1.4rem">${flag(race.country)}</span>
      <div class="card-title"><b>${esc(race.name)}</b><small>${esc(race.localName)} · ${esc(race.city)}</small></div>
      <button class="fav ${user.favorite ? 'on' : ''}" data-fav="${esc(race.id)}" aria-label="관심 대회">⭐</button>
    </div>
    <div class="tags">${statusBadge(info)} ${estBadge(e)} <span class="badge b-method">${METHODS[race.method] || race.method}</span> ${my}</div>
    <dl class="meta">
      <dt>대회일</dt><dd>${fmt(e.raceDate)}</dd>
      <dt>접수</dt><dd>${e.regOpen ? `${fmt(e.regOpen)} ~ ${fmt(e.regClose)}` : '미정'}</dd>
      <dt>종목</dt><dd>${esc((race.distances || []).join(', '))}</dd>
    </dl>
    <div class="dday">${esc(info.ddayText)}</div>
  </article>`;
}

function renderList(items) {
  const filtered = sortItems(filterItems(items, ui.filters), ui.sort);
  ui.lastFiltered = filtered;
  $('#list-count').textContent = `${filtered.length}개 대회`;
  $('#cards').innerHTML = filtered.map(cardHTML).join('') || '<p class="hint">조건에 맞는 대회가 없습니다.</p>';
}

// ───────────── 캘린더 ─────────────
function renderCalendar(items) {
  const { y, m } = ui.cal;
  $('#cal-title').textContent = `${y}년 ${m}월`;
  const events = eventsForMonth(items, y, m);
  const label = { race: '🏁', open: '접수▶', close: '마감■', result: '발표' };
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  let html = WEEK.map((w) => `<div class="cal-dow">${w}</div>`).join('');
  for (let k = 0; k < 42; k++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k);
    if (k >= 35 && d.getMonth() !== m - 1) break;
    const iso = todayISO(d);
    const evs = events.filter((e) => e.date === iso);
    html += `<div class="cal-cell ${d.getMonth() !== m - 1 ? 'out' : ''} ${iso === TODAY ? 'today' : ''}">
      <span class="d">${d.getDate()}</span>
      ${evs.map((e) => `<span class="ev ${e.type}" data-id="${esc(e.race.id)}" title="${esc(e.race.name)}">${label[e.type]} ${flag(e.race.country)}${esc(e.race.name)}</span>`).join('')}
    </div>`;
  }
  $('#calendar').innerHTML = html;
}

// ───────────── 내 대회 ─────────────
function renderMine(items) {
  const rows = sortItems(
    items.filter((i) => (i.user.favorite || (i.user.myStatus && i.user.myStatus !== 'none')) &&
      (ui.myStatus === 'ALL' || (i.user.myStatus || 'none') === ui.myStatus)),
    'race',
  );
  $('#mine-body').innerHTML = rows.map(({ race, info, user }) => `<tr data-id="${esc(race.id)}">
      <td>${flag(race.country)} ${esc(race.name)}${user.favorite ? ' ⭐' : ''}</td>
      <td>${fmt(info.edition.raceDate)}</td>
      <td>${statusBadge(info)} <span class="dday">${esc(info.ddayText)}</span></td>
      <td><span class="badge b-my">${MY_STATUS[user.myStatus || 'none']}</span></td>
      <td>${esc(user.record || user.goal || '-')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="hint">아직 관심·신청 대회가 없습니다.</td></tr>';
}

// ───────────── 모달: 상세 ─────────────
const modal = $('#modal');

function findItem(id) {
  return buildItems().find((i) => i.race.id === id);
}

function openDetail(id) {
  const item = findItem(id);
  if (!item) return;
  const { race, info, user } = item;
  const e = info.edition;
  const site = safeUrl(race.website);
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${race.localName} 공식`)}`;
  const isCustom = !RACES.some((r) => r.id === race.id);
  const list = (arr, tag = 'ul') => (arr?.length ? `<${tag}>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '<p class="hint">정보 없음</p>');

  $('#modal-body').innerHTML = `
    <div class="modal-head">
      <span style="font-size:1.8rem">${flag(race.country)}</span>
      <h3>${esc(race.name)}<small>${esc(race.localName)} · ${esc(race.city)}${race.label ? ' · ' + esc(race.label) : ''}</small></h3>
      <button class="btn icon" data-close aria-label="닫기">✕</button>
    </div>
    <div class="tags">${statusBadge(info)} ${estBadge(e)} <span class="badge b-method">${METHODS[race.method] || race.method}</span> <span class="dday">${esc(info.ddayText)}</span></div>

    <div class="section"><h4>📅 일정</h4>
      <div class="timeline">
        <div class="t"><small>접수 시작</small>${fmt(e.regOpen)}</div>
        <div class="t"><small>접수 마감</small>${fmt(e.regClose)}</div>
        ${e.resultDate ? `<div class="t"><small>추첨 결과</small>${fmt(e.resultDate)}</div>` : ''}
        <div class="t"><small>대회일</small><b>${fmt(e.raceDate)}</b></div>
      </div>
      <p class="hint">예년 개최 시기: ${esc(race.typical || '-')}${e.confirmed ? '' : ' · 공식 요강 발표 전 예상 일정입니다.'}</p>
    </div>

    <div class="section"><h4>🏃 대회 소개</h4><p>${esc(race.intro || '')}</p>${list(race.highlights)}</div>
    <div class="section"><h4>📋 기본 정보</h4>
      <dl class="meta">
        <dt>종목</dt><dd>${esc((race.distances || []).join(', '))}</dd>
        <dt>신청 방식</dt><dd>${METHODS[race.method] || esc(race.method)}</dd>
        <dt>참가비</dt><dd>${esc(race.fee || '-')}</dd>
        <dt>접수처</dt><dd>${esc(race.entryPlatform || '-')}</dd>
        <dt>공식 사이트</dt><dd>${site ? `<a href="${esc(site)}" target="_blank" rel="noopener">${esc(site)}</a>` : `<a href="${searchUrl}" target="_blank" rel="noopener">공식 사이트 검색 ↗</a>`}</dd>
      </dl>
    </div>
    <div class="section"><h4>📝 신청 방법</h4>${list(race.howToApply, 'ol')}</div>
    <div class="section"><h4>✈️ 참가 팁</h4>${list(race.foreignerTips)}</div>

    <div class="section"><h4>⭐ 내 진행 관리</h4>
      <form class="form-grid" id="my-form">
        <label>진행 상태<select name="myStatus">${Object.entries(MY_STATUS).map(([k, v]) => `<option value="${k}" ${(user.myStatus || 'none') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>배번<input name="bib" value="${esc(user.bib || '')}" placeholder="예: A1234" /></label>
        <label>목표 기록<input name="goal" value="${esc(user.goal || '')}" placeholder="예: 3:59:59" /></label>
        <label>완주 기록<input name="record" value="${esc(user.record || '')}" placeholder="예: 3:52:10" /></label>
        <label class="full">메모 (숙소·항공·결제 기한 등)<textarea name="notes">${esc(user.notes || '')}</textarea></label>
      </form>
    </div>

    <div class="actions">
      <button class="btn" data-fav-modal>${user.favorite ? '⭐ 관심 해제' : '☆ 관심 등록'}</button>
      <button class="btn" data-ics>📅 캘린더에 추가(.ics)</button>
      <button class="btn" data-edit>✏️ 일정 수정</button>
      ${isCustom ? '<button class="btn" data-edit-race>✏️ 대회 정보 수정</button><button class="btn danger" data-delete>삭제</button>' : ''}
      <button class="btn primary" data-save>저장</button>
    </div>`;

  const body = $('#modal-body');
  body.querySelector('[data-close]').onclick = () => modal.close();
  body.querySelector('[data-fav-modal]').onclick = () => { store.toggleFavorite(id); openDetail(id); };
  body.querySelector('[data-ics]').onclick = () => download(`${race.id}.ics`, buildICS([item]), 'text/calendar');
  body.querySelector('[data-edit]').onclick = () => openEditSchedule(id);
  body.querySelector('[data-save]').onclick = () => {
    const fd = new FormData($('#my-form'));
    store.setUser(id, Object.fromEntries(fd.entries()));
    toast('저장했습니다.');
    modal.close();
  };
  if (isCustom) {
    body.querySelector('[data-edit-race]').onclick = () => openRaceForm(race);
    body.querySelector('[data-delete]').onclick = () => {
      if (confirm(`'${race.name}' 대회를 삭제할까요?`)) { store.removeCustomRace(id); modal.close(); toast('삭제했습니다.'); }
    };
  }
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}

// ───────────── 모달: 일정 수정 ─────────────
function openEditSchedule(id) {
  const { race } = findItem(id);
  const base = mergeEdition(race, store.getOverride(id));
  const hasOverride = !!store.getOverride(id);
  $('#modal-body').innerHTML = `
    <div class="modal-head"><h3>일정 수정<small>${esc(race.name)}</small></h3><button class="btn icon" data-close>✕</button></div>
    <p class="hint">공식 요강에서 확인한 일정을 입력하세요. 이 브라우저에만 저장됩니다.</p>
    <form class="form-grid" id="ed-form">
      <label>접수 시작<input type="date" name="regOpen" value="${esc(base.regOpen || '')}" /></label>
      <label>접수 마감<input type="date" name="regClose" value="${esc(base.regClose || '')}" /></label>
      <label>추첨 결과 발표<input type="date" name="resultDate" value="${esc(base.resultDate || '')}" /></label>
      <label>대회일<input type="date" name="raceDate" value="${esc(base.raceDate || '')}" required /></label>
      <label class="chk full"><input type="checkbox" name="confirmed" ${base.confirmed ? 'checked' : ''} /> 공식 발표로 확정된 일정</label>
    </form>
    <div class="actions">
      ${hasOverride ? '<button class="btn danger" data-revert>기본값으로 되돌리기</button>' : ''}
      <button class="btn" data-back>취소</button>
      <button class="btn primary" data-save>저장</button>
    </div>`;
  const body = $('#modal-body');
  body.querySelector('[data-close]').onclick = () => modal.close();
  body.querySelector('[data-back]').onclick = () => openDetail(id);
  body.querySelector('[data-revert]')?.addEventListener('click', () => { store.setOverride(id, null); openDetail(id); });
  body.querySelector('[data-save]').onclick = () => {
    const fd = new FormData($('#ed-form'));
    const ed = {
      raceDate: fd.get('raceDate') || null,
      regOpen: fd.get('regOpen') || null,
      regClose: fd.get('regClose') || null,
      resultDate: fd.get('resultDate') || null,
      confirmed: fd.get('confirmed') === 'on',
    };
    if (!ed.raceDate) return toast('대회일을 입력하세요.');
    if (ed.regOpen && ed.regClose && ed.regOpen > ed.regClose) return toast('접수 시작일이 마감일보다 늦습니다.');
    store.setOverride(id, ed);
    toast('일정을 저장했습니다.');
    openDetail(id);
  };
}

// ───────────── 모달: 대회 추가/수정 ─────────────
function openRaceForm(existing) {
  const r = existing || { country: 'KR', method: 'firstcome', edition: {} };
  const lines = (a) => esc((a || []).join('\n'));
  $('#modal-body').innerHTML = `
    <div class="modal-head"><h3>${existing ? '대회 정보 수정' : '대회 추가'}</h3><button class="btn icon" data-close>✕</button></div>
    <form class="form-grid" id="race-form">
      <label>대회명 *<input name="name" required value="${esc(r.name || '')}" /></label>
      <label>현지 대회명<input name="localName" value="${esc(r.localName || '')}" /></label>
      <label>국가<select name="country">${Object.entries(COUNTRIES).map(([k, v]) => `<option value="${k}" ${r.country === k ? 'selected' : ''}>${v.flag} ${v.name}</option>`).join('')}</select></label>
      <label>도시<input name="city" value="${esc(r.city || '')}" /></label>
      <label>신청 방식<select name="method">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${r.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>종목 (쉼표 구분)<input name="distances" value="${esc((r.distances || []).join(', '))}" placeholder="풀코스, 하프, 10K" /></label>
      <label>대회일 *<input type="date" name="raceDate" required value="${esc(r.edition.raceDate || '')}" /></label>
      <label>접수 시작<input type="date" name="regOpen" value="${esc(r.edition.regOpen || '')}" /></label>
      <label>접수 마감<input type="date" name="regClose" value="${esc(r.edition.regClose || '')}" /></label>
      <label>참가비<input name="fee" value="${esc(r.fee || '')}" /></label>
      <label class="full">공식 사이트<input name="website" type="url" value="${esc(r.website || '')}" placeholder="https://" /></label>
      <label class="full">소개<textarea name="intro">${esc(r.intro || '')}</textarea></label>
      <label class="full">신청 방법 (줄마다 한 단계)<textarea name="howToApply">${lines(r.howToApply)}</textarea></label>
    </form>
    <div class="actions"><button class="btn" data-cancel>취소</button><button class="btn primary" data-save>저장</button></div>`;
  const body = $('#modal-body');
  body.querySelector('[data-close]').onclick = () => modal.close();
  body.querySelector('[data-cancel]').onclick = () => (existing ? openDetail(existing.id) : modal.close());
  body.querySelector('[data-save]').onclick = () => {
    const fd = Object.fromEntries(new FormData($('#race-form')).entries());
    if (!fd.name.trim() || !fd.raceDate) return toast('대회명과 대회일은 필수입니다.');
    const race = {
      id: existing?.id || `custom-${Date.now().toString(36)}`,
      country: fd.country,
      name: fd.name.trim(),
      localName: fd.localName.trim() || fd.name.trim(),
      city: fd.city.trim(),
      typical: '사용자 등록 대회',
      distances: fd.distances.split(',').map((s) => s.trim()).filter(Boolean),
      method: fd.method,
      fee: fd.fee.trim(),
      website: safeUrl(fd.website.trim()),
      entryPlatform: '',
      intro: fd.intro.trim(),
      highlights: [],
      howToApply: fd.howToApply.split('\n').map((s) => s.trim()).filter(Boolean),
      foreignerTips: [],
      edition: { raceDate: fd.raceDate, regOpen: fd.regOpen || null, regClose: fd.regClose || null, confirmed: true },
    };
    store.addCustomRace(race);
    toast('대회를 저장했습니다.');
    openDetail(race.id);
  };
  if (!modal.open) modal.showModal();
}

// ───────────── 렌더 & 이벤트 ─────────────
function render() {
  const items = buildItems();
  renderDashboard(items);
  renderList(items);
  renderCalendar(items);
  renderMine(items);
}

function setView(v) {
  ui.view = v;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
  history.replaceState(null, '', `#${v}`);
}

function init() {
  // 셀렉트 옵션 채우기
  $('#f-month').innerHTML = '<option value="ALL">전체 월</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월 개최</option>`).join('');
  $('#m-status').innerHTML = '<option value="ALL">전체 진행 상태</option>' + Object.entries(MY_STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => setView(t.dataset.view)));
  const initial = location.hash.slice(1);
  if (['dashboard', 'list', 'calendar', 'mine'].includes(initial)) setView(initial);

  // 필터
  const bind = (sel, key, prop = 'value') => $(sel).addEventListener('input', (e) => { ui.filters[key] = e.target[prop]; render(); });
  bind('#f-query', 'query');
  bind('#f-country', 'country');
  bind('#f-status', 'status');
  bind('#f-method', 'method');
  bind('#f-month', 'month');
  bind('#f-fav', 'favoritesOnly', 'checked');
  $('#f-sort').addEventListener('input', (e) => { ui.sort = e.target.value; render(); });
  $('#m-status').addEventListener('input', (e) => { ui.myStatus = e.target.value; render(); });

  // 위임 클릭: 카드/리스트/캘린더 → 상세
  document.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); store.toggleFavorite(fav.dataset.fav); return; }
    const el = e.target.closest('#app [data-id]');
    if (el) openDetail(el.dataset.id);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // 캘린더 이동
  const moveCal = (delta) => {
    const d = new Date(ui.cal.y, ui.cal.m - 1 + delta, 1);
    ui.cal = { y: d.getFullYear(), m: d.getMonth() + 1 };
    render();
  };
  $('#cal-prev').onclick = () => moveCal(-1);
  $('#cal-next').onclick = () => moveCal(1);
  $('#cal-today').onclick = () => { const d = new Date(); ui.cal = { y: d.getFullYear(), m: d.getMonth() + 1 }; render(); };

  // 도구
  $('#btn-add').onclick = () => openRaceForm(null);
  $('#btn-ics-list').onclick = () => {
    if (!ui.lastFiltered?.length) return toast('내보낼 대회가 없습니다.');
    download('marathon-schedule.ics', buildICS(ui.lastFiltered), 'text/calendar');
  };
  $('#btn-export').onclick = () => download(`marathon-backup-${TODAY}.json`, store.exportJSON(), 'application/json');
  $('#file-import').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!validateBackup(data)) throw new Error('invalid');
      store.importData(data);
      toast('백업을 복원했습니다.');
    } catch {
      toast('올바른 백업 파일이 아닙니다.');
    }
    e.target.value = '';
  };
  $('#btn-reset').onclick = () => {
    if (confirm('관심 대회·메모·수정한 일정·추가한 대회가 모두 삭제됩니다. 계속할까요?')) { store.reset(); toast('초기화했습니다.'); }
  };

  store.subscribe(render);
  render();
}

init();
