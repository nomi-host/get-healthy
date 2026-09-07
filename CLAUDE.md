# Working notes for this repo

## Before any UI change: read `design.md`

`design.md` is the design system **and** the rulebook for this app. It is not
reference-only — §0 is a checklist that must be walked every time UI is added
or changed, and §7 documents the UI traps that have already caused repeated
re-work. Traps about editing/deploying the code itself live below in
"코드베이스 함정".

At minimum, before touching UI:

1. Walk **§0 UI 작업 체크리스트**.
2. Take values (color, font size, radius, spacing) from §1–§4 rather than
   inventing new ones.
3. Reuse the patterns in §5–§6 (collapse/expand specs, component recipes)
   instead of styling from scratch.
4. Run the §0 "마무리" steps — `node --check` on **all three** `<script>` tags,
   plus a Playwright render check with zero page errors.

When a UI change establishes a new rule or fixes a new class of bug, **update
`design.md` in the same change** so the next round doesn't repeat it.

## Standing rules

- **New icons**: when adding a new icon, search Google Material assets
  (fonts.google.com/icons — Material Symbols, Outlined/Filled) for the
  actual icon rather than hand-drawing one. Pull the real SVG path data
  (e.g. via the `@material-symbols/svg-400` npm package) and convert its
  `0 -960 960 960` coordinate space into this app's shared `0 0 24 24`
  icon grid before adding it to the icon map. (Details: `design.md` §9)
- **UI work**: always double-check alignment by default (spacing,
  vertical centering, wrapped/multi-line layout) — don't leave it to a
  follow-up round unless asked to skip it. Verify alignment fixes by
  measuring `getBoundingClientRect()`, not by eyeballing a screenshot.
  (Details: `design.md` §0, §7-1)
- **Icons are the user's own choices** — don't "consolidate" or redraw
  existing icons during consistency passes unless explicitly asked.

---

## 코드베이스 함정 (실제로 터졌던 것들)

UI가 아니라 **이 코드베이스를 편집·배포할 때** 터졌던 것들입니다. 화면 규칙(정렬·간격·
컴포넌트)은 `design.md` §7에 따로 있습니다.

### 함정 1. `<script>` 태그가 3개다

| # | 내용 |
|---|---|
| 0 | 헤드 스크립트 (~2.4KB) |
| 1 | React 번들 (~420KB) |
| 2 | PWA/서비스워커 등록 + 업데이트 배너/토스트 (~1.6KB) |

**셋 다** `node --check` 해야 합니다. 실제로 런타임 버그 2건이 스크립트 **2번**에서 났고,
1번만 검사하던 동안에는 전혀 보이지 않았습니다.

```bash
python3 - <<'EOF'
import re, subprocess
data = open('index.html', encoding='utf-8').read()
for i, s in enumerate(re.findall(r'<script[^>]*>(.*?)</script>', data, re.S)):
    open(f'/tmp/s{i}.js','w',encoding='utf-8').write(s)
    r = subprocess.run(['node','--check',f'/tmp/s{i}.js'], capture_output=True, text=True)
    print(i, 'OK' if r.returncode==0 else 'FAIL', r.stderr[:400])
EOF
```

### 함정 2. ⭐ minify된 블록을 통째로 교체할 땐 괄호 수지를 맞출 것

큰 UI 블록을 새로 써서 갈아끼울 때, 잘라낸 원본이 **자기 바깥의 괄호까지 물고 있는 경우**가
있습니다. 예를 들어 원본이 `...,"추가")))` 로 끝나면 그 중 하나는 원본 요소의 것이 아니라
**바깥 구조를 닫는 괄호**입니다. 문법적으로 완결된 새 블록으로 바꾸면 그 하나가 사라져
파일 전체가 깨집니다.

실제로 이번에 그랬고, 파서는 **한참 뒤(다음 `}function ...`)** 를 가리켜서 원인 위치를
바로 알 수 없었습니다.

교체 전후로 **순증감(net)** 을 비교하세요. 문자열 안쪽은 세지 말 것.

```python
def net(s):  # 문자열 리터럴 무시하고 괄호만 계수
    ...
# OLD  ( 48  ) 49  net -1   <- 바깥 괄호 1개를 물고 있었음
# NEW  ( 124 ) 124 net +0   <- 그대로 넣으면 깨짐. ) 하나를 더해야 함
```

증상이 나오면 `node --check` 대신 **acorn으로 정확한 오프셋**을 찍고
(`npm install acorn --no-save`), 그 지점부터 역으로 블록 경계를 확인하세요.

> 같은 이유로, 새 블록에 넣는 문자열 안의 줄바꿈은 반드시 `\\n` 이스케이프로 쓸 것.
> 파이썬에서 만든 실제 개행 문자가 JS 문자열 리터럴 안에 들어가면
> `Invalid or unexpected token`이 납니다. 이것도 이번에 같이 터졌습니다.

### 함정 3. ⭐ 전역 토큰에 짧은 이름을 쓰면 minify된 지역변수에 가려진다

`var K={...}` 처럼 **한 글자 이름으로 전역 토큰을 만들면 안 됩니다.** 번들이 이미
minify돼 있어서 `K`, `T`, `z`, `b` 같은 이름이 지역변수로 수십 곳에서 쓰이고 있고,
그 안에서는 내 전역이 **조용히 가려집니다**.

증상이 특히 고약합니다 — 에러가 안 납니다.

```js
border:`1px solid ${K.line}`   // 지역 K에 가려짐 → "1px solid undefined"
                               // → React가 무효 속성을 그냥 버림
                               // → 보더가 아예 사라지고 UA 기본(2px inset #767676)이 나옴
```

콘솔은 깨끗한데 화면만 이상해서 원인을 찾기 어렵습니다. **`getComputedStyle`로
실제 값을 찍어보면** UA 기본값이 나오는 걸로 바로 판별됩니다.

새 전역은 `TK0`, `SB0`처럼 **숫자를 붙인 3글자 이상**으로 짓고, 넣기 전에
`grep`으로 충돌을 확인하세요.

### 함정 4. 문자열 인코딩이 파일 안에서 섞여 있다

같은 한글이라도 어떤 곳은 리터럴 UTF-8(`"필요시"`), 어떤 곳은 JS 유니코드 이스케이프
(`"\uD544\uC694\uC2DC"` — 백슬래시가 파일에 그대로 들어 있음)로 저장돼 있습니다. 그래서:

- 치환 전에 **반드시 `data.count(old)`로 정확히 1인지 확인**하고 진행할 것.
- 에디터의 퍼지 매칭에 의존하지 말고 Python으로 읽기→치환→쓰기.
- 작은따옴표 문자열 안의 폰트명은 `\"`로 이스케이프 (§2).

### 함정 5. 배포가 안 된 것처럼 보일 때

- GitHub Pages의 source 설정이 조용히 풀려서 머지해도 재빌드가 안 된 적이 있습니다.
- 서비스워커가 이전 버전을 캐시해 사용자에게 옛 화면이 보일 수 있습니다
  (`sw.js`가 `UPDATE_AVAILABLE`을 보내면 배너가 뜹니다).
- 즉 "고쳤는데 반영이 안 됐다"는 보고를 받으면, 코드를 의심하기 전에
  `git show origin/main:index.html`로 **배포 브랜치에 실제로 들어갔는지부터** 확인하세요.

### 함정 6. ⭐ GitHub Pages의 ETag는 "내용이 바뀌었다"는 뜻이 아니다

`sw.js`가 업데이트 감지에 ETag를 쓰는데, **ETag가 다르다고 해서 파일이 바뀐 건
아닙니다.** GitHub Pages는 ETag를 `"<mtime 16진수>-<크기 16진수>"`로 만들고, 사이트를
푸는 시각이 복제 서버마다 1~2초씩 어긋납니다. 그래서 **바이트가 완전히 같은 파일**이
어떤 노드에서는 `"6a7c5a15-6f684"`, 다른 노드에서는 `"6a7c5a16-6f684"`로 돌아옵니다
(2026-09-07 실측 — 두 값 모두 크기 `6f684` = 456,324바이트로 동일, 본문 `cmp` 일치).

폰이 이동하면서 다른 엣지 노드에 붙을 때마다 ETag가 갈리기 때문에, ETag 차이만 보고
`UPDATE_AVAILABLE`을 보내면 **앱을 열 때마다 "새 버전이 나왔어요" 배너가 뜹니다.**
새로고침해도 다음 번에 반대쪽 노드에 붙으면 다시 뜨므로 영원히 반복됩니다.

- ETag는 **"확실히 안 바뀌었다"는 빠른 신호로만** 쓸 것 — `If-None-Match`가 맞으면
  304로 끝나니 다운로드가 없습니다.
- ETag가 **다를 때는 반드시 본문을 비교**하고 나서 알릴 것. ETag가 어긋난 시점엔 이미
  200으로 본문을 받아온 뒤라 **추가 비용이 0입니다.**
- 캐시가 비어 있을 때(`!cached`)는 조용히 채우기만 할 것. 페이지는 이미 그 사본으로
  돌고 있으므로 알릴 "업데이트"가 없습니다.
- 검증법: 같은 바이트를 ETag만 번갈아 주는 로컬 서버를 띄우고 앱을 5번 열어
  배너가 한 번도 안 뜨는지 + 본문을 실제로 바꿨을 땐 뜨는지 **둘 다** 확인할 것.

### 함정 7. ⭐ `String.fromCharCode.apply(null, 큰배열)`은 RangeError로 죽는다

백업 암호화가 `"암호화에 실패했어요"`로 실패한 원인입니다. 바이트 배열을 base64로
바꿀 때 `btoa(String.fromCharCode.apply(null, new Uint8Array(b)))`를 쓰면 배열 길이가
**그대로 함수 인자 개수**가 되어 스택을 넘깁니다. 실측 한계(2026-09-07):

| 엔진 | 통과 | 실패 |
|---|---|---|
| Chromium | ~100KB | 128KB 이상 `RangeError: Maximum call stack size exceeded` |
| WebKit(데스크톱) | ~512KB | 1MB 이상 |

iOS의 JSC는 데스크톱보다 스택이 작아 한계가 더 낮습니다. **기록이 쌓여 백업이 이
크기를 넘어가는 순간부터 갑자기 실패**하기 때문에 "어제까진 됐는데"로 보고됩니다.

- 32KB(`0x8000`) 조각으로 잘라서 이어 붙일 것. 작은 입력에서 결과가 기존과 **바이트
  단위로 동일**함을 확인했습니다.
- 복원 쪽 `Uint8Array.from(atob(s), c => c.charCodeAt(0))`는 인자 전개가 없어 안전합니다
  — 같은 패턴을 새로 쓸 땐 이쪽을 따를 것.
- **`catch`에서 에러를 삼키지 말 것.** 원래 `alert("암호화에 실패했어요")`만 띄워서
  진짜 원인(RangeError)이 보이지 않았습니다. 지금은 메시지를 함께 표시합니다.
