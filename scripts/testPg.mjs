// Raw pg 클라이언트로 비번 인증을 직접 테스트
// — 인코딩 이슈 vs 비번 자체 이슈를 분리하기 위함
import pg from "pg";

const { Client } = pg;

const PASSWORD = "Jangboda2026Sec"; // raw, 영숫자만
const HOST = "aws-1-ap-southeast-2.pooler.supabase.com";
const USER = "postgres.feaakjoakgoplytmgyzz";

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
