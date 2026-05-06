// public 스키마 모든 테이블에 RLS 활성화 (Supabase 보안 경고 해결)
// .env의 DIRECT_URL을 사용해 마이그레이션용 직접 연결로 실행.
//
// 사용:  node scripts/applyRls.mjs
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";

const { Client } = pg;

function loadEnv() {
  if (!existsSync(".env")) {
    console.error("❌ .env 파일이 없습니다");
    process.exit(1);
  }
  const env = readFileSync(".env", "utf8");
  const direct = env.match(/^DIRECT_URL=["']?([^"'\n]+)/m)?.[1];
  const database = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m)?.[1];
  return direct || database;
}

const url = loadEnv();
if (!url) {
  console.error("❌ .env에 DIRECT_URL/DATABASE_URL이 없습니다");
  process.exit(1);
}

const u = new URL(url);
const client = new Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const ENABLE_RLS_SQL = `
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
`;

const VERIFY_SQL = `
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
`;

try {
  console.log(`연결 중: ${u.hostname}:${u.port || 5432} (사용자: ${u.username})`);
  await client.connect();

  // 현재 사용자가 BYPASSRLS인지 확인 (Prisma가 영향받지 않을지 검증)
  const who = await client.query(
    `SELECT current_user, rolbypassrls
     FROM pg_roles WHERE rolname = current_user`
  );
  const me = who.rows[0];
  console.log(`   현재 사용자: ${me.current_user} (bypassrls: ${me.rolbypassrls})`);
  if (!me.rolbypassrls) {
    console.warn(
      "⚠️  현재 사용자가 BYPASSRLS 권한이 없습니다. RLS 활성화 후 Prisma 쿼리가 막힐 수 있습니다."
    );
    console.warn(
      "   Supabase는 보통 postgres 슈퍼유저로 연결되므로 정상이지만, 다른 역할이면 멈추세요."
    );
  }

  console.log("\nRLS 활성화 중...");
  await client.query(ENABLE_RLS_SQL);

  const { rows } = await client.query(VERIFY_SQL);
  console.log("\n적용 결과:");
  for (const row of rows) {
    const mark = row.rowsecurity ? "✅" : "❌";
    console.log(`  ${mark} ${row.tablename} (rls=${row.rowsecurity})`);
  }
  const off = rows.filter((r) => !r.rowsecurity);
  if (off.length === 0) {
    console.log(`\n✅ 완료 — public 테이블 ${rows.length}개 모두 RLS 활성화됨`);
  } else {
    console.error(`\n❌ ${off.length}개 테이블이 여전히 비활성 상태입니다`);
    process.exit(1);
  }
} catch (e) {
  console.error("❌ 실행 실패:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
