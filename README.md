# gtrack

Gmail 메일 **열람 추적** (Mailtrack.io 유사, 개인용). 보낸 메일에 1×1 픽셀을 넣고,
수신자가 열면 Cloudflare Worker가 기록합니다. 대시보드에서 열람 여부·횟수·시각을 봅니다.

## 아는 한계 (추가 구현으로 못 바꿈)

- **위치·기기 안 나옴**: Gmail은 이미지를 Google 프록시로 가져오므로 수신자 IP를 알 수 없습니다. "열림"과 시각만 압니다.
- **Apple Mail 가짜 열람**: Apple Mail 개인정보 보호(MPP)는 받자마자 이미지를 미리 받습니다. 보낸 직후(기본 15초 이내) 열람은 "자동 의심"으로 따로 표시하고 실제 열람에서 뺍니다.
- **수신자 여럿이면 누가 열었는지 구분 불가**: 한 통으로 나가는 Gmail 구조상 불가능.
- **Gmail 모바일 앱에서 보낸 메일은 추적 안 됨**: 확장은 웹 Gmail에서만 픽셀을 넣습니다.

## 구성

```
src/worker.ts   Cloudflare Worker: 픽셀 /o/:id, 인제스트 API, 대시보드
src/lib.ts      순수 로직(픽셀 바이트, 자동/본인 열람 판정, 집계) + 테스트
schema.sql      D1 스키마
extension/      Chrome 확장(MV3 + InboxSDK)
```

## 1. Worker 배포

```sh
npm i -g wrangler              # 또는 npx wrangler ...
wrangler d1 create gtrack      # 출력된 database_id를 wrangler.toml에 붙여넣기
wrangler d1 execute gtrack --file=schema.sql --remote
wrangler secret put INGEST_TOKEN   # 긴 임의 문자열 입력 (확장에도 같은 값 사용)
wrangler deploy
```

자체 도메인 서브도메인(예: `track.내도메인`)은 `wrangler.toml`의 `routes`를
풀거나 Cloudflare 대시보드의 Workers Routes에서 연결하세요. `workers.dev`는
여러 사용자가 공유하는 도메인이라 피하는 편이 좋습니다.

## 2. 대시보드 보호 (Cloudflare Access)

Cloudflare Zero Trust → Access → Applications 에서 `track.내도메인/` 과
`track.내도메인/api/stats` 를 보호하고 **본인 이메일만** 허용하세요. Worker는
Access가 넣어주는 `Cf-Access-Authenticated-User-Email` 헤더가 없으면 403으로
막습니다(= Access 미설정 시 대시보드가 열리지 않음). 픽셀(`/o/...`)과 인제스트
API는 Access 밖에 두어야 합니다.

## 3. 확장 빌드 & 설치 (Chrome)

```sh
cd extension
cp config.example.js config.js   # HOST, INGEST_TOKEN, APP_ID 채우기
npm install
npm run build                    # dist/content.js 생성
```

- `APP_ID`: https://register.inboxsdk.com 에서 Google 계정으로 무료 발급.
- Chrome → `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `extension/` 선택.

**Firefox**: InboxSDK가 아직 Firefox를 공식 지원하지 않습니다(지원 PR 진행 중).
지원되면 같은 소스로 빌드해 `web-ext sign --channel unlisted`로 서명 후 설치하세요.

## 동작

- 메일 작성창에 "메일 추적" 버튼이 생깁니다. 기본 켜짐, 클릭하면 그 메일만 끕니다.
- 보내면 픽셀이 본문 끝에 들어가고 제목·받는사람·보낸시각이 Worker에 저장됩니다.
- 보낸편지함에서 **본인이** 그 메일을 열면 확장이 서버에 알려, 그 시점 열람은 집계에서 제외됩니다.

## 주의

- **INGEST_TOKEN은 확장 안에 들어갑니다.** 인제스트 API(쓰기)만 보호하는 용도이고
  단일 사용자용이라 허용 가능한 수준입니다. 토큰이 새면 남이 가짜 레코드를 넣을 수
  있으니, 노출되면 `wrangler secret put INGEST_TOKEN`으로 교체하고 `config.js`도 갱신하세요.
- **수신자 고지 없음.** 수신자가 EU에 있으면 GDPR/ePrivacy, 국내 수신자는
  정보통신망법 등 열람 추적에 대한 법적 의무가 생길 수 있습니다. 판단과 책임은 사용자에게 있습니다.

## 테스트

```sh
node --experimental-strip-types src/lib.test.ts
```
