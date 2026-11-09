# 🏃 마라톤 일정 매니저 (All About Marathon Schedule)

대한민국 · 일본 · 중국의 주요 마라톤 대회 **소개**, **접수 일정**, **신청 방법**을 한눈에 보고,
내가 신청한 대회의 진행 상황(관심 → 신청 → 당첨 → 완주)을 관리하는 웹 앱입니다.

빌드 과정 없는 순수 HTML/CSS/JavaScript(ES Modules) 앱이라 GitHub Pages 등 정적 호스팅에 그대로 올릴 수 있습니다.

## 주요 기능

| 화면 | 기능 |
| --- | --- |
| **대시보드** | 지금 접수 중 / 90일 내 접수 시작 / 120일 내 대회 / 내 관심 대회를 D-day와 함께 표시 |
| **대회 목록** | 국가·접수 상태·신청 방식(추첨/선착순)·개최 월·검색어로 필터링, 대회일순/접수 임박순 정렬, ⭐ 관심 등록 |
| **대회 상세** | 대회 소개, 코스 특징, 종목, 참가비, 공식 사이트, 단계별 신청 방법, 외국인 참가 팁 |
| **캘린더** | 월별 달력에 접수 시작·마감·추첨 결과 발표·대회일 표시 |
| **내 대회** | 진행 상태(관심/신청 예정/신청 완료/당첨/낙첨/완주/DNS), 배번, 목표·완주 기록, 메모 관리 |
| **일정 수정** | 공식 요강 발표 후 확정 일정을 입력하여 예상 일정을 덮어쓰기 |
| **대회 추가** | 목록에 없는 대회를 직접 등록 |
| **내보내기** | 구글/애플 캘린더용 `.ics` 내보내기, 개인 데이터 JSON 백업·복원 |

### 수록 대회 (19개)

- 🇰🇷 **대한민국**: 서울마라톤(동아), JTBC 서울마라톤, 춘천마라톤, 대구마라톤, 경주국제마라톤
- 🇯🇵 **일본**: 도쿄, 오사카, 교토, 나고야 우먼스, 후쿠오카, 고베, 홋카이도, 나하
- 🇨🇳 **중국**: 샤먼, 우시, 베이징, 상하이, 청두, 광저우

## ⚠️ 일정 데이터에 대해

`js/data.js`의 날짜·참가비는 **예년 개최 패턴을 바탕으로 한 예상치**입니다(`confirmed: false`).
실제 일정은 매년 바뀌므로 반드시 공식 요강을 확인하세요.

- 앱에서 각 대회의 **“일정 수정”**으로 확정 일정을 입력하면 이 브라우저에 저장됩니다.
- 대회일이 지나면 앱이 자동으로 **다음 해 일정을 추정**합니다(같은 달 같은 주차 요일 기준, "예년 기준 추정" 배지 표시).
- 모든 사용자에게 반영하려면 `js/data.js`의 `edition` 값을 갱신하고 `confirmed: true`로 바꾸세요.

## 실행 방법

ES Modules를 사용하므로 `file://`로 직접 열지 말고 로컬 서버로 실행하세요.

```bash
npm start            # python3 -m http.server 8080
# 또는
npx serve .
```

브라우저에서 http://localhost:8080 접속.

## 테스트

```bash
npm test             # node:test 기반 로직/데이터 무결성 테스트 (Node 18+)
```

## 구조

```
index.html          화면 레이아웃 (대시보드 / 목록 / 캘린더 / 내 대회)
css/style.css       스타일 (다크 모드·모바일 대응)
js/data.js          대회 기본 데이터 (여기를 수정해 대회 추가·갱신)
js/logic.js         순수 로직: 접수 상태·D-day 계산, 다음 회차 추정, 필터/정렬, ICS 생성
js/store.js         localStorage 저장소 (관심·진행상태·메모·일정 수정·사용자 대회)
js/app.js           UI 렌더링 및 이벤트 처리
tests/              로직 테스트
```

## 대회 데이터 추가하기

`js/data.js`의 `RACES` 배열에 아래 형식으로 추가합니다.

```js
{
  id: 'my-race',                 // 고유 ID
  country: 'KR',                 // 'KR' | 'JP' | 'CN'
  name: '대회명', localName: '현지 대회명', city: '도시',
  typical: '매년 4월 첫째 일요일',
  distances: ['풀코스', '10K'],
  method: 'firstcome',           // 'lottery' | 'firstcome' | 'mixed'
  fee: '약 5만 원', website: 'https://...', entryPlatform: '공식 홈페이지',
  intro: '소개', highlights: ['특징'], howToApply: ['1단계', '2단계'], foreignerTips: ['팁'],
  edition: { raceDate: '2027-04-04', regOpen: '2027-01-10', regClose: '2027-02-28', confirmed: false },
}
```

## 배포 (GitHub Pages)

배포 주소: **https://y2j1004-run.github.io/005.all-about-marathon-schedule/**

`.github/workflows/pages.yml`이 `main` 브랜치에 push될 때마다 테스트 후 자동 배포합니다.
(저장소 Settings → Pages → Source: **GitHub Actions** 설정 필요 · 수동 실행: Actions → “GitHub Pages 배포” → Run workflow)

## 데이터 저장

개인 데이터(관심 대회, 메모, 수정한 일정 등)는 브라우저 `localStorage`에만 저장되며 서버로 전송되지 않습니다.
기기를 바꾸거나 브라우저 데이터를 지우기 전에 **내 대회 → 백업(JSON)**으로 저장해 두세요.
