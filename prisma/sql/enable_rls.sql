-- public 스키마 모든 테이블에 RLS(행 수준 보안) 활성화
-- 정책은 추가하지 않음 → anon/authenticated 역할은 자동 거부 (deny by default)
-- Prisma는 DATABASE_URL의 postgres(BYPASSRLS) 사용자로 연결되므로 영향 없음
--
-- 적용 방법 (택1):
--   1) Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣고 RUN
--   2) 로컬에서: node scripts/applyRls.mjs
--
-- 결과: anon key로 PostgREST(/rest/v1/*)를 통한 무단 읽기/쓰기 차단

DO $$
DECLARE
  r record;
  cnt int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      r.schemaname, r.tablename
    );
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'RLS 활성화 완료: % 개 테이블', cnt;
END $$;

-- 검증: 모든 public 테이블의 RLS 상태 확인 (rowsecurity = true 여야 함)
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
