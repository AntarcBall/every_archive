### 프로젝트 명세 (최종)

안녕하세요. 시니어 백엔드 프로그래머입니다. 제공해주신 정보와 기술 스택을 바탕으로 에브리타임 크롤러 프로젝트의 명세를 다음과 같이 구체화했습니다.

-----

### **1. 기술 스택 및 서비스**

  * **백엔드:** **TypeScript**
  * **런타임 환경:** **Google Cloud Run**
  * **데이터베이스:** **Firebase Firestore**
  * **로깅:** **Cloud Logging** (Google Cloud Run과 통합)
  * **API 관리:** **Firebase Functions** 또는 **Cloud Run HTTP 서비스**

Cloud Run을 사용하면 컨테이너화된 크롤링 작업을 실행할 수 있으며, Firebase Firestore는 NoSQL 데이터베이스로 유연한 스키마를 제공하여 동적으로 변하는 게시글의 상태를 관리하기에 적합합니다.

-----

### **2. 시스템 아키텍처**

시스템은 크게 두 가지 부분으로 구성됩니다.

1.  **자동화된 크롤링/아카이빙 서버 (Cloud Run)**:

      * 정해진 주기(예: 1분)마다 실행되어 에브리타임 게시판 API를 호출합니다.
      * 새로운 게시글을 감지하고, 기존 게시글의 상태 변화(좋아요, 댓글 등)를 확인합니다.
      * 변경된 내용을 Firestore에 저장하고, 지정된 형식의 로그를 생성하여 Cloud Logging에 기록합니다.

2.  **로그 요청 API 서버 (Cloud Run/Firebase Functions)**:

      * 개발자가 `localhost`에서 요청을 보내면 Cloud Logging에 기록된 로그를 조회하여 반환합니다.
      * 이 API는 보안을 위해 API 키 또는 인증 절차를 적용할 수 있습니다.

-----

### **3. 데이터베이스 설계 (Firebase Firestore)**

Firebase Firestore는 문서(Document)와 컬렉션(Collection)으로 구성된 NoSQL 데이터베이스입니다. `articles` 컬렉션과 `logs` 컬렉션을 만들어 데이터를 관리합니다.

#### **`articles` 컬렉션**

게시글 하나하나가 문서가 되며, 문서 ID는 \*\*게시글 고유 ID (`article ID`)\*\*를 사용합니다.

  * **영구 필드:**
      * `id`: `string` (게시글 고유 ID, 문서 ID와 동일)
      * `title`: `string`
      * `text`: `string`
      * `created_at`: `timestamp`
  * **변동 필드:**
      * `posvote`: `number` (좋아요)
      * `comment`: `number` (댓글 수)
      * `scrap_count`: `number` (스크랩 수)
  * **메타데이터:**
      * `updated_at`: `timestamp` (마지막으로 변동이 감지된 시간)

#### **`logs` 컬렉션**

각 업데이트 로그가 하나의 문서가 되며, 타임스탬프를 문서 ID로 사용할 수 있습니다.

  * `timestamp`: `string` (MM.DD | HH:MM'SS 형식)
  * `type`: `string` (종류: '글 신규 작성', '글 삭제', '좋아요', '댓글', '스크랩')
  * `details`: `string` (세부사항)
  * `before`: `number` 또는 `string`
  * `after`: `number` 또는 `string`
  * `article_id`: `string` (어떤 게시글의 변화인지 식별)

-----

### **4. 크롤러 동작 로직**

#### **1단계: 초기 아카이빙 (최초 1회 실행)**

1.  `start_num=0`, `limit_num=20` 파라미터로 게시판 API를 호출합니다.
2.  응답받은 XML을 파싱하여 `article` 태그의 `id`, `title`, `text`, `created_at`, `posvote`, `comment`, `scrap_count` 값을 추출합니다.
3.  추출된 20개 게시글을 Firestore의 `articles` 컬렉션에 영구 및 변동 필드를 포함하여 저장합니다.

#### **2단계: 지속적 관측 (Cloud Run Job)**

1.  **신규 글 감지**: `start_num=0`, `limit_num=10` 파라미터로 API를 호출하여 최신 10개 글을 가져옵니다.
2.  **Diff 처리**:
      * 가져온 10개 글의 `id`를 기존 DB에 저장된 글의 `id`와 비교합니다.
      * DB에 없는 `id`가 발견되면, 신규 글로 식별하여 Firestore에 저장하고 `**종류: 글 신규 작성**` 로그를 남깁니다.
3.  **변동값 업데이트**:
      * 기존 DB에 있는 글 중 최신 10개 글의 `posvote`, `comment`, `scrap_count` 값을 API 응답 값과 비교합니다.
      * 값이 변경된 경우, Firestore의 해당 문서 필드를 업데이트하고 변경된 내용을 아래 명세에 따라 로깅합니다.

-----

### **5. 로깅 시스템 및 출력 형식**

**로그는 Cloud Logging에 JSON 형식으로 저장됩니다.** 사용자는 `localhost`에서 API를 호출하여 이 로그를 조회할 수 있습니다.

**API 엔드포인트:** `GET https://[YOUR_CLOUD_RUN_URL]/logs`

**API 응답 형식:**

```json
[
  {
    "timestamp": "MM.DD | HH:MM'SS",
    "type": "종류",
    "details": "세부사항",
    "before": "이전",
    "after": "이후"
  },
  ...
]
```

#### **로그 테이블 형식 (사용자 출력)**

| 타임스탬프 | 종류 | 세부사항 | 이전 | 이후 |
|:---|:---|:---|:---|:---|
| `MM.DD` | `HH:MM'SS` | 글 신규 작성 | `천원의아침밥 신청하슈` | - | - |
| `MM.DD` | `HH:MM'SS` | 좋아요 | `천원의아침밥 신청하슈` | `10` | `11` |
| `MM.DD` | `HH:MM'SS` | 댓글 | `천원의아침밥 신청하슈` | `5` | `6` |
| `MM.DD` | `HH:MM'SS` | 스크랩 | `천원의아침밥 신청하슈` | `2` | `3` |
| `MM.DD` | `HH:MM'SS` | 글 삭제 | `(게시글 제목)` | - | - |