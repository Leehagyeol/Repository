# 저장소 앱 — 공통 규칙

모든 단계에서 아래 규칙을 지킨다.

- 기획문서(storage/docs/저장소_기획문서.md)가 기준이다. 문서와 다르게 해야 할 이유가 생기면 먼저 나에게 묻는다.
- HTML + CSS + JavaScript만 쓴다. 빌드 도구, 프레임워크, npm 패키지는 쓰지 않는다. 외부 라이브러리가 꼭 필요하면 먼저 묻는다.
- 앱 파일은 모두 storage/ 폴더 안에 둔다. 리포지토리 루트에는 README.md, .gitignore 외에 파일을 늘리지 않는다.
- 커밋·푸시는 내가 요청할 때만 한다.
- 데이터는 IndexedDB에 저장하고, DB 이름은 "storage-db", localStorage 키는 "storage-"로 시작한다.
- 서비스 워커는 storage/ 안에 두고 scope를 storage/로 제한한다. manifest의 start_url과 scope도 storage/로 한다.
- 아이폰 Safari(iOS 17 이상) 홈 화면 앱 기준으로 만든다. 터치 영역은 최소 44×44pt, 아래쪽 안전 영역(safe-area-inset)을 지킨다.
- 색: 대표색 #2F6F68(짙은 청록), 바탕 #F6F1E7(미색), 강조 #E9B44C(노랑, 글자에는 쓰지 않음), 다크 모드 배경 #1C2321. 다크 모드는 아이폰 설정을 따른다.
- 카테고리 목록(레시피, 육아, 만들기, 쇼핑, 메모, 짤방)은 설정 파일 한 곳에 모아 둔다.
- 화면에 보이는 글자는 모두 한국어로 쓴다.
- 각 단계가 끝나면 (1) 바꾼 파일 목록, (2) 아이폰에서 확인할 것, (3) 다음 단계 전에 내가 할 일을 짧게 정리해준다.

## 장보기 앱과 분리 (보충)

장보기 앱(https://leehagyeol.github.io/grocery/)과 같은 사이트(leehagyeol.github.io)를 쓰므로 아래도 지킨다.

- 서비스 워커 캐시 이름은 "storage-"로 시작한다(예: "storage-v1"). 오래된 캐시를 지울 때는 "storage-"로 시작하는 것만 지운다. 장보기 앱은 "grocery-" 캐시를 쓴다.
- manifest의 id도 storage/ 폴더로 한다. 아이콘·manifest·서비스 워커는 모두 상대 경로(./)로 storage/ 안의 파일을 가리키고, 사이트 맨 위 경로(/sw.js, /apple-touch-icon.png 등)는 쓰지 않는다.
