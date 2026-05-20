# SQLDev — Oracle DB 관리 도구

DBeaver와 유사한 Oracle Database 웹 관리 도구입니다.  
브라우저에서 Oracle DB에 접속하여 테이블 조회, 프로시저 분석, SQL 실행 등을 할 수 있습니다.

---

## 화면 구성

```
┌────────────────┬─────────────────────────────────────────────┐
│  연결 관리     │  탭 영역 (테이블 상세 / SQL 편집기 등)       │
│                │                                             │
│  ● Production  │  [컬럼] [데이터] [DDL] [참조키]             │
│  ○ Dev DB      │                                             │
│                │                                             │
│  오브젝트 탐색 │                                             │
│  └ SCOTT       │                                             │
│    └ Tables    │                                             │
│      └ EMP     │                                             │
└────────────────┴─────────────────────────────────────────────┘
│  상태바                                                       │
└───────────────────────────────────────────────────────────────┘
```

---

## 사전 요구사항

| 항목 | 버전 | 확인 방법 |
|------|------|-----------|
| Node.js | 18 이상 | `node --version` |
| npm | 8 이상 | `npm --version` |
| Oracle DB | 접속 가능한 DB | — |

> Oracle Instant Client **불필요** — oracledb Thin Mode로 동작합니다.

---

## 설치 및 실행

### 1단계 — 소스 다운로드

```bash
git clone <저장소 URL>
cd sqlDev
```

### 2단계 — 패키지 설치

```bash
npm run install:all
```

> 루트, backend, frontend 세 곳의 패키지를 한 번에 설치합니다.

### 3단계 — 개발 서버 실행

```bash
npm run dev
```

실행 후 아래 두 서버가 동시에 시작됩니다.

| 서버 | 주소 | 설명 |
|------|------|------|
| 프론트엔드 | http://localhost:5173 | 브라우저에서 접속 |
| 백엔드 API | http://localhost:3001 | 자동으로 연결됨 |

브라우저에서 **http://localhost:5173** 을 열면 됩니다.

---

## 운영 환경 배포

```bash
# 프론트엔드 빌드
npm run build --prefix frontend

# 백엔드 단독 실행 (빌드된 정적 파일 서빙 포함)
npm start
```

---

## 처음 사용하기

### 1. DB 연결 추가

1. 좌측 상단 **`+ 새 연결`** 버튼 클릭
2. 접속 정보 입력

   | 항목 | 예시 | 설명 |
   |------|------|------|
   | Host | `192.168.1.100` | Oracle 서버 IP 또는 도메인 |
   | Port | `1521` | 기본값 1521 |
   | Service Name | `ORCL` | SID 대신 서비스명 사용 |
   | Username | `SCOTT` | DB 계정 |
   | Password | `tiger` | DB 비밀번호 |

3. **`연결 테스트`** 클릭 → 성공 메시지 확인
4. **`저장`** 또는 **`저장 & 연결`** 클릭

> 비밀번호는 AES-256-GCM으로 암호화되어 서버에 저장됩니다.

### 2. 연결하기

- 저장된 연결 항목 클릭 → **`연결`** 버튼 클릭
- 연결되면 왼쪽 아이콘이 초록색 `●`으로 바뀝니다
- 이미 저장된 연결은 앱을 껐다 켜도 목록에 유지됩니다

### 3. 오브젝트 탐색

연결 후 좌측 트리에서 스키마를 펼치면 아래 항목들이 나타납니다.

```
└ SCOTT
  ├ Tables       ← 테이블
  ├ Views        ← 뷰
  ├ Procedures   ← 프로시저
  ├ Functions    ← 함수
  ├ Packages     ← 패키지
  ├ Triggers     ← 트리거
  ├ Sequences    ← 시퀀스
  └ Synonyms     ← 시노님
```

항목을 클릭하면 우측에 상세 탭이 열립니다.

---

## 기능별 사용법

### 테이블 / 뷰

테이블 또는 뷰를 클릭하면 우측에 아래 탭이 나타납니다.

| 탭 | 내용 |
|----|------|
| **컬럼** | 컬럼명, 데이터 타입, NULL 여부, 기본값 |
| **데이터** | 실제 데이터 조회 (페이지네이션, 정렬 지원) |
| **DDL** | CREATE TABLE 전체 스크립트 |
| **참조키** | 이 테이블을 참조하는 FK 목록 |

**데이터 탭 사용법**
- 컬럼 헤더 클릭 → 정렬
- 하단 `◀ ▶` 버튼 → 페이지 이동
- `새로고침` 버튼 → 최신 데이터 다시 조회

### 프로시저 / 함수 / 패키지 / 트리거

소스가 있는 오브젝트를 클릭하면 아래 탭이 나타납니다.

| 탭 | 내용 |
|----|------|
| **📊 분석기** | 데이터 흐름도 자동 생성 (Mermaid 다이어그램) |
| **📝 설명** | 분석 결과 기반 한국어 설명 자동 생성 |
| **Source** | 원본 PL/SQL 소스 코드 (줄 번호 포함) |
| **Properties** | 오브젝트 상태, 생성일, 유효성 등 |

#### 📊 분석기 사용법

프로시저/함수를 선택하면 자동으로 데이터 흐름도가 생성됩니다.

- **`−` / `+` 버튼** — 다이어그램 축소/확대
- **`리셋` 버튼** — 100% 크기로 초기화
- **`📋 요약` 탭** — 파라미터, 테이블, 호출 목록을 표로 확인
- **`🔤 Mermaid` 탭** — 다이어그램 소스 코드 복사

색상 의미:
| 색상 | 의미 |
|------|------|
| 파란색 | 시작/입력 파라미터 |
| 노란색 | SELECT (읽기) 테이블 |
| 빨간색 | DML (쓰기) 테이블 |
| 초록색 | 출력 파라미터 / 반환값 |
| 회색 | 예외 처리 |

#### 📝 설명 탭

추가 설치 없이 분석 결과를 바탕으로 한국어 설명을 자동 생성합니다.

- 핵심 목적, 입력 데이터, 처리 로직, 출력/반환값, 예외 처리, 특이사항 순서로 표시됩니다
- **`↻ 새로고침`** 버튼으로 재생성 가능

### SQL 편집기

우측 상단 **`SQL 편집기`** 탭을 클릭하거나, 오브젝트 탐색 중 SQL 편집기 버튼을 누르면 열립니다.

- **`F5`** 또는 **`실행` 버튼** — SQL 실행
- 여러 SQL 입력 시 커서가 있는 구문만 실행됩니다
- 결과는 하단 그리드에 표시됩니다
- 스키마는 좌측 트리에서 선택한 스키마가 기본으로 사용됩니다

---

## 데이터 저장 위치

연결 정보는 아래 파일에 JSON 형식으로 저장됩니다.

```
backend/data/connections.json
```

- 비밀번호는 암호화되어 저장됩니다 (평문 저장 없음)
- 이 파일은 `.gitignore`에 포함되어 Git에 올라가지 않습니다

---

## NJS-116 오류 해결 (구형 Oracle 인증 방식)

`NJS-116: password verifier type 0x939 is not supported` 오류는 Oracle DB가 구형 10g 인증 방식을 사용할 때 발생합니다.  
DBeaver(JDBC)는 이 방식을 지원하지만, oracledb Thin Mode는 지원하지 않습니다.

### 방법 1 — DBA에게 비밀번호 재설정 요청 (간단)

비밀번호를 동일하게 재설정하면 Oracle이 새 인증 방식(11g/12c)을 함께 생성합니다.

```sql
-- DBA가 실행 (비밀번호 내용은 동일하게 유지됨)
ALTER USER wmssj IDENTIFIED BY <현재비밀번호>;
```

### 방법 2 — Oracle Instant Client 설치 후 Thick Mode 전환

Instant Client가 있으면 DBeaver처럼 모든 Oracle 인증 방식을 지원합니다.

**1) Oracle Instant Client 다운로드 및 설치**

Oracle 공식 사이트 또는 사내 배포본에서 Instant Client Basic 패키지를 설치합니다.

- Linux 예시: `/opt/oracle/instantclient_21_1/`
- Windows 예시: `C:\oracle\instantclient_21_1\`

**2) 환경변수 설정 후 서버 실행**

```bash
# Linux / Mac
export ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_21_1
npm run dev

# Windows (PowerShell)
$env:ORACLE_CLIENT_LIB_DIR = "C:\oracle\instantclient_21_1"
npm run dev
```

또는 `backend/.env` 파일에 저장:

```
ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_21_1
```

서버 시작 시 아래 로그가 나오면 Thick Mode 활성화 성공입니다.

```
[Oracle] Thick Mode 활성화: /opt/oracle/instantclient_21_1
```

---

## 자주 발생하는 오류

### `연결 테스트 실패 - ORA-12541`

Oracle 서버 주소 또는 포트가 잘못되었거나 방화벽이 막힌 경우입니다.

```
확인 사항:
1. Host IP / Port 번호 재확인
2. 서버에서 Oracle Listener가 실행 중인지 확인
3. 방화벽에서 1521 포트 허용 여부 확인
```

### `연결 테스트 실패 - ORA-12514`

Service Name이 잘못된 경우입니다.

```sql
-- Oracle 서버에서 서비스명 확인
SELECT value FROM v$parameter WHERE name = 'service_names';
```

### `포트 3001 이미 사용 중`

다른 프로세스가 3001 포트를 사용 중입니다.

```bash
# 사용 중인 프로세스 확인 후 종료
lsof -i :3001
kill -9 <PID>
```

### `프론트엔드가 뜨지 않음 (포트 5173)`

```bash
# 프론트엔드만 단독 실행
npm run dev --prefix frontend
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18, Vite, Mermaid.js |
| 백엔드 | Node.js, Express |
| DB 드라이버 | oracledb (Thin Mode) |
| 암호화 | AES-256-GCM (Node.js 내장 crypto) |
| 다이어그램 | Mermaid.js (flowchart TD) |
