// Raw pg 클라이언트로 비번 인증을 직접 테스트
// — 인코딩 이슈 vs 비번 자체 이슈를 분리하기 위함
// 환경변수 PG_TEST_* 또는 .env의 DATABASE_URL을 파싱해 사용
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";

const { Client } = pg;

// .env에서 DATABASE_URL 읽어와서 host/user/password 추출
function loadFromEnv() {
  if (!existsSync(".env")) return null;
  const env = readFileSync(".env", "utf8");
  const m = env.match(/^DATABASE_URL=["']?([^"'\n]+)/m);
  if (!m) return null;
  try {
    const u = new URL(m[1]);
    return {
      host: u.hostname,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    return null;
  }
}

const cfg = loadFromEnv();
if (!cfg) {
  console.error("❌ .env에 DATABASE_URL이 없거나 파싱 불가");
  process.exit(1);
}

const PASSWORD = cfg.password;
const HOST = cfg.host;
const USER = cfg.user;

async function tryConnect(port, label) {
  const client = new Client({
    host: HOST,
    port,
    user: USER,
    password: PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const r = await client.query("SELECT current_user, version()");
    console.log(`✅ ${label} (port ${port}) — 연결 성공`);
    console.log("   ", r.rows[0]);
    await client.end();
    return true;
  } catch (e) {
    console.log(`❌ ${label} (port ${port}) — ${e.message}`);
    return false;
  }
}

console.log(`\n비번: "${PASSWORD}" (raw, ${PASSWORD.length}자)`);
console.log(`호스트: ${HOST}`);
console.log(`사용자: ${USER}\n`);

await tryConnect(6543, "Transaction pooler");
await tryConnect(5432, "Session pooler");
