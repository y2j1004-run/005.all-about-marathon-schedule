// localStorage 기반 사용자 데이터 저장소
// - user[raceId]      : { favorite, myStatus, notes, bib, goal, record }
// - overrides[raceId] : 사용자가 수정한 일정 { raceDate, regOpen, regClose, resultDate, confirmed }
// - customRaces       : 사용자가 직접 추가한 대회

const KEY = 'aams.v1';

const empty = () => ({ version: 1, user: {}, overrides: {}, customRaces: [] });

export const MY_STATUS = {
  none: '미정',
  interested: '관심',
  planning: '신청 예정',
  applied: '신청 완료',
  won: '당첨/확정',
  lost: '낙첨',
  finished: '완주',
  dns: '불참(DNS)',
};

function safeGet() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    return { ...empty(), ...data };
  } catch {
    return empty();
  }
}

let state = safeGet();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가 환경(시크릿 모드 등)에서는 메모리에만 유지 */
  }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getUser(id) {
    return state.user[id] || {};
  },
  setUser(id, patch) {
    state.user[id] = { ...state.user[id], ...patch };
    persist();
  },
  toggleFavorite(id) {
    this.setUser(id, { favorite: !this.getUser(id).favorite });
  },
  getOverride(id) {
    return state.overrides[id];
  },
  setOverride(id, edition) {
    if (edition) state.overrides[id] = edition;
    else delete state.overrides[id];
    persist();
  },
  addCustomRace(race) {
    state.customRaces = [...state.customRaces.filter((r) => r.id !== race.id), race];
    persist();
  },
  removeCustomRace(id) {
    state.customRaces = state.customRaces.filter((r) => r.id !== id);
    delete state.user[id];
    delete state.overrides[id];
    persist();
  },
  exportJSON() {
    return JSON.stringify(state, null, 2);
  },
  importData(data) {
    state = { ...empty(), ...data };
    persist();
  },
  reset() {
    state = empty();
    persist();
  },
};
