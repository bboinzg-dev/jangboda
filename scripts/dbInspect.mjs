// DB 성능/사용량 진단
import pg from "pg";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const url = env.match(/^DIRECT_URL=["']?([^"'\n]+)/m)?.[1];
if (!url) {
  console.error("DIRECT_URL 못 찾음");
  process.exit(1);
}

// sslmode 파라미터 제거 + ssl false 처리 (Supabase pooler는 SSL 필수지만 self-signed)
const cleanUrl = url.replace(/[?&]sslmode=[^&]+/g, "");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const client = new pg.Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const r1 = await client.query(`
  SELECT schemaname, relname, n_live_tup AS rows
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY n_live_tup DESC LIMIT 15
`);
console.log("\n=== 테이블 row 수 ===");
r1.rows.forEach((r) => console.log(`  ${r.relname.padEnd(25)} ${r.rows}`));

const r2 = await client.query(`
  SELECT relname, idx_scan, seq_scan, n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'public' AND seq_scan > COALESCE(idx_scan, 0) AND n_live_tup > 10
  ORDER BY seq_scan DESC LIMIT 10
`);
console.log("\n=== 인덱스 부족 (seq_scan > idx_scan) ===");
if (r2.rows.length === 0) console.log("  (없음 — 인덱스 잘 활용)");
else
  r2.rows.forEach((r) =>
    console.log(`  ${r.relname.padEnd(20)} seq=${r.seq_scan} idx=${r.idx_scan ?? 0} rows=${r.n_live_tup}`)
  );

const r3 = await client.query(
  `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
);
console.log(`\n=== DB 사이즈: ${r3.rows[0].size}`);

// 인덱스 별 사용 통계
const r4 = await client.query(`
  SELECT relname, indexrelname, idx_scan
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
  ORDER BY idx_scan DESC LIMIT 15
`);
console.log("\n=== 인덱스 사용 횟수 ===");
r4.rows.forEach((r) =>
  console.log(`  ${r.relname.padEnd(15)} ${r.indexrelname.padEnd(40)} ${r.idx_scan}`)
);

await client.end();
