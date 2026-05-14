# 새 크롤 사이트 추가 가이드

> **2026-05-05 부로 크롤러는 별도 리포로 분리됨** → [`endurance-ai/crawler`](https://github.com/endurance-ai/crawler)

새 자사몰 추가 / 파서 작성 가이드는 `endurance-ai/crawler` 리포의 `README.md` 와 `src/lib/parsers/` 를 참고.

## DB 스키마 변경이 필요한 경우만

새 플랫폼 추가가 kiko.ai 의 DB 스키마 변경을 동반하면 (예: 새 컬럼, 새 enum 값):

1. kiko.ai 에서 `database/migrations/NNN_*.sql` 작성 + 적용
2. kiko.ai 의 검색·어드민 코드를 신규 컬럼 대응
3. crawler 리포에서 `supabase gen types` 재실행 후 PR
4. 두 리포 모두 머지된 후 크롤 실행

스키마 변경 없이 단순 사이트 1개 추가는 crawler 리포에서만 작업.
