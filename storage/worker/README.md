# 링크 미리보기 함수 배포하기 (Windows, 처음 하는 사람용)

저장소 앱에 링크를 붙여넣으면 제목과 썸네일을 대신 가져오는 작은 함수입니다. Cloudflare Workers 무료 요금제로 돌아갑니다(하루 10만 번까지 무료).

명령어는 모두 **VS Code 아래쪽 터미널**(메뉴 보기 → 터미널)에서 한 줄씩 실행합니다.

## 준비물
- Cloudflare 계정 (https://dash.cloudflare.com/sign-up 에서 무료 가입)
- Node.js — 이 PC에는 이미 설치되어 있습니다. 확인: `node -v` → `v26...` 처럼 나오면 됩니다.

## 1. 이 폴더로 이동
```
cd storage\worker
```

## 2. Cloudflare 로그인
```
npx wrangler login
```
- 처음에 `Need to install the following packages: wrangler ... Ok to proceed? (y)` 가 나오면 `y` 후 Enter.
  (wrangler는 Cloudflare에 배포하는 도구입니다. 앱에는 들어가지 않고 이 PC에서만 씁니다.)
- 브라우저가 열리면 Cloudflare에 로그인하고 **Allow**를 누릅니다.
- 터미널에 `Successfully logged in` 이 나오면 성공.

## 3. 배포
```
npx wrangler deploy
```
- 처음이면 workers.dev 하위 주소(서브도메인)를 정하라고 할 수 있습니다. 안내대로 영문 이름을 정하면 됩니다.
- 끝나면 이런 주소가 나옵니다. **이 주소를 복사해 두세요.**
  ```
  https://storage-preview.<내이름>.workers.dev
  ```

## 4. 비밀 키 만들기
아무도 짐작할 수 없는 긴 문자열을 하나 만듭니다.
```
[guid]::NewGuid().ToString('N')
```
나온 32글자(예: `3f2a9c...`)를 복사해 두세요. **이 값은 GitHub이나 다른 곳에 올리지 마세요.**

## 5. 비밀 키를 Cloudflare에 저장
```
npx wrangler secret put PREVIEW_KEY
```
- `Enter a secret value:` 가 나오면 4번에서 복사한 키를 붙여넣고(화면에는 안 보임) Enter.
- `Success! Uploaded secret PREVIEW_KEY` 가 나오면 성공.

## 6. 살아 있는지 확인
3번 주소 뒤에 `?ping=1` 을 붙여 PC 브라우저로 엽니다.
```
https://storage-preview.<내이름>.workers.dev/?ping=1
```
`{"ok":false,"error":"origin-not-allowed"}` 가 보이면 **정상**입니다. 저장소 앱 주소에서 온 요청만 받도록 막아 두었기 때문입니다.

## 7. 앱에 연결
1. 아이폰 **홈 화면의 저장소 앱**을 엽니다(Safari 탭이 아니라 아이콘으로).
2. 오른쪽 위 설정 → **링크 미리보기** 칸에
   - 함수 주소: 3번 주소
   - 비밀 키: 4번 키
3. **저장** → **연결 확인**을 눌러 "연결됐어요"가 나오면 끝.

키를 아이폰에 옮기기 번거로우면, PC에서 키를 메모 앱(iCloud)이나 나에게 보내는 카카오톡 등으로 보내 복사해도 됩니다. 붙여넣은 뒤에는 그 메시지를 지워 주세요.

## 나중에 코드를 고쳤을 때
`storage\worker` 폴더에서 `npx wrangler deploy` 만 다시 실행하면 됩니다. 비밀 키는 그대로 남아 있습니다.

## 문제가 생기면
| 증상 | 확인할 것 |
| --- | --- |
| 연결 확인에서 "비밀 키가 맞지 않아요" | 5번에서 넣은 키와 앱 설정의 키가 같은지. 다시 `npx wrangler secret put PREVIEW_KEY` 로 넣어도 됩니다 |
| "허용되지 않은 주소" | `wrangler.toml` 의 `ALLOWED_ORIGINS` 가 `https://leehagyeol.github.io` 인지 |
| "함수에 연결하지 못했어요" | 함수 주소 오타, 인터넷 연결 |
| 실시간 로그를 보고 싶을 때 | `npx wrangler tail` (끝낼 때 Ctrl+C) |
