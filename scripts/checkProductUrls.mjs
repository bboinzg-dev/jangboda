import pg from "pg";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const url = env.match(/^DIRECT_URL=["']?([^"'\n]+)/m)?.[1].replace(/[?&]sslmode=[^&]+/g, "");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const r = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE source = 'naver') AS total_naver,
    COUNT(*) FILTER (WHERE source = 'naver' AND "productUrl" IS NOT NULL) AS with_url,
    COUNT(*) FILTER (WHERE source = 'naver' AND "productUrl" IS NULL) AS without_url
  FROM "Price"
`);
console.log("네이버 가격 row 수:", r.rows[0].total_naver);
console.log("  productUrl 있음:", r.rows[0].with_url);
console.log("  productUrl 없음:", r.rows[0].without_url);

await c.end();
