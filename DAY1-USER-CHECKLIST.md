# Day-1 사용자 병행 작업 (에이전트 스캐폴드 중 지금 시작)

## A. Chrome Nano 모델 다운로드 (가장 먼저, 수 분 소요)
1. Chrome 업데이트 확인: `chrome://settings/help` → 139 이상 (현재 설치본 157 확인됨)
2. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → Chrome 재시작
3. 아무 페이지에서 DevTools Console 열고:
   ```js
   await LanguageModel.availability()
   ```
   - `downloadable`이면: `await LanguageModel.create({monitor(m){m.addEventListener('downloadprogress',e=>console.log(Math.round(e.loaded*100)+'%'))}})`
   - `available`이면 이미 준비 완료. 결과 문자열을 그대로 에이전트에게 알려주세요.
   - `unavailable`이면 그 값도 그대로 알려주세요 (게이트 1 분기 판단에 필수).

## B. Firebase 프로젝트 생성 (소유자 계정 필요)
1. https://console.firebase.google.com → 프로젝트 추가 (이름 예: `repair-ledger`). Google Analytics는 끄셔도 됩니다.
2. 프로젝트에서 **AI Services → AI Logic → Get started** → Gemini API provider는 **Gemini Developer API** 선택, 안내대로 API 활성화.
   - 이 과정에서 AI Logic에 App Check가 자동 enforcement됩니다. 콘솔 **Security → App Check → APIs**에서 Firebase AI Logic 행이 `Enforced`인지 확인해 주세요 (게이트 3 증거).
3. 웹 앱 등록: 프로젝트 개요 → `</>` → 닉네임 `repair-ledger-web` → **Firebase Hosting도 함께 설정** 체크 → 표시되는 `firebaseConfig` 객체 전체 복사.
4. **Authentication → Sign-in method → 익명(Anonymous) 활성화.**
5. **Firestore Database → Create database** (production mode로 시작; 규칙은 에이전트가 제공하는 `firestore.rules`로 교체).
6. **Security → App Check → Apps → 웹 앱 → reCAPTCHA v3 등록** → 발급된 **사이트 키** 복사.
   (reCAPTCHA 키가 없으면 https://www.google.com/recaptcha/admin 에서 v3 키를 먼저 발급; 도메인에 Hosting 도메인과 `localhost`는 넣지 마세요 — localhost는 디버그 토큰으로 처리)

## C. 에이전트에게 전달할 값 (공개 레포에 넣지 않을 값 아님 — 아래는 공개 가능 설정)
- `firebaseConfig` 전체 (apiKey 포함 — 웹용 apiKey는 비밀이 아님. 단, 공개 레포에는 `.env.local`이 아닌 Hosting 배포본에만 주입할지 에이전트와 확정)
- 프로젝트 ID
- reCAPTCHA v3 **사이트 키** (secret 키 아님)
- 위 A-3의 `LanguageModel.availability()` 결과 문자열

> 전달 금지: App Check 디버그 토큰, reCAPTCHA secret 키, 서비스 계정 JSON. 이 셋은 공개 레포·채팅 어디에도 올리지 마세요.
