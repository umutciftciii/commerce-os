/**
 * PB-2/PB-3 — PostgreSQL araç çalıştırıcı (pg_dump / pg_restore / psql).
 *
 * GÜVENLİK (spec §13):
 *  - Komutlar ASLA shell string olarak birleştirilmez → daima `spawn(cmd, argsArray)`; shell:false.
 *    Kullanıcı/config kaynaklı hiçbir değer shell'e enjekte edilmez (command injection engellenir).
 *  - Parola argv'ye KONMAZ (ps'te görünmez) → `PGPASSWORD` child env'ine verilir. DATABASE_URL loglanmaz.
 *  - Hata çıktısı redaction'dan geçmeden yükseltilmez (çağıran servisler redakte eder).
 *
 * İKİ MOD:
 *  - direct: pg_dump/pg_restore/psql PATH'te (üretim scheduler; DATABASE_URL host'una ağ üzerinden).
 *  - docker: host'ta pg client yoksa `docker run --rm <image>` ile sürüm-eşli (postgres:16) araçları çalıştırır
 *    (yerel dev + canlı DR smoke). Parola `-e PGPASSWORD` ile container env'ine verilir.
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";

export interface PgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslmode?: string;
}

/** DATABASE_URL'i PG bağlantı bileşenlerine çözer (parola bileşen olarak tutulur, log'a girmez). */
export function parsePgConnection(databaseUrl: string): PgConnection {
  const u = new URL(databaseUrl);
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    throw new Error(`parsePgConnection: postgres(ql) şeması bekleniyor (${u.protocol}).`);
  }
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username || "postgres"),
    password: decodeURIComponent(u.password || ""),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    sslmode: u.searchParams.get("sslmode") ?? undefined,
  };
}

export interface SpawnOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunOptions {
  /** stdout'u bu dosyaya yaz (pg_dump). Verilmezse belleğe toplanır. */
  stdoutFile?: string;
  /** bu dosyayı child stdin'ine akıt (pg_restore). */
  stdinFile?: string;
}

function pgEnv(conn: PgConnection): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGUSER: conn.user,
    PGPASSWORD: conn.password,
    PGDATABASE: conn.database,
  };
  if (conn.sslmode) env.PGSSLMODE = conn.sslmode;
  return env;
}

function runProcess(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  opts: RunOptions = {},
): Promise<SpawnOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, shell: false });
    let stdout = "";
    let stderr = "";
    if (opts.stdoutFile) {
      const ws = createWriteStream(opts.stdoutFile, { mode: 0o600 });
      child.stdout.pipe(ws);
      ws.on("error", reject);
    } else {
      child.stdout.on("data", (d) => (stdout += d.toString()));
    }
    child.stderr.on("data", (d) => (stderr += d.toString()));
    if (opts.stdinFile) {
      const rs = createReadStream(opts.stdinFile);
      rs.on("error", reject);
      rs.pipe(child.stdin);
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export interface PgToolRunner {
  readonly describe: string;
  /** pg_dump → custom (`-Fc`) ya da plain(+gzip harici) format dosyaya. */
  dump(conn: PgConnection, destPath: string, format: "custom" | "plain"): Promise<void>;
  /** pg_restore/psql: dosyadan hedefe geri yükleme. */
  restoreFromFile(conn: PgConnection, sourcePath: string, format: "custom" | "plain"): Promise<void>;
  /** psql -tAc: tek satırlık skaler sorgu (kontrollü SQL; kullanıcı girdisi enjekte edilmez). */
  query(conn: PgConnection, sql: string): Promise<string>;
  /** Sunucu sürümü (`SHOW server_version`). */
  serverVersion(conn: PgConnection): Promise<string>;
  /** Hedefi boş public şemaya sıfırlar (yıkıcı — restore-service guard'larının ARDINDAN çağrılır). */
  resetPublicSchema(conn: PgConnection): Promise<void>;
}

function assertOk(outcome: SpawnOutcome, label: string): void {
  if (outcome.code !== 0) {
    // stderr host/DB adı içerebilir ama parola/URL içermez (env ile geçildi); çağıran ayrıca redakte eder.
    throw new Error(`${label} başarısız (exit ${outcome.code}): ${outcome.stderr.trim().slice(0, 800)}`);
  }
}

// ── Direct mode ────────────────────────────────────────────────────────────
export function createDirectPgToolRunner(binDir?: string): PgToolRunner {
  const bin = (name: string) => (binDir ? `${binDir}/${name}` : name);
  return {
    describe: `direct(${binDir ?? "PATH"})`,
    async dump(conn, destPath, format) {
      const args = format === "custom" ? ["-Fc", "-Z", "6"] : ["-Fp"];
      assertOk(await runProcess(bin("pg_dump"), [...args, "--no-owner", "--no-privileges"], pgEnv(conn), { stdoutFile: destPath }), "pg_dump");
    },
    async restoreFromFile(conn, sourcePath, format) {
      if (format === "custom") {
        assertOk(
          await runProcess(bin("pg_restore"), ["--no-owner", "--no-privileges", "--exit-on-error", "-d", conn.database], pgEnv(conn), { stdinFile: sourcePath }),
          "pg_restore",
        );
      } else {
        assertOk(await runProcess(bin("psql"), ["-v", "ON_ERROR_STOP=1", "-d", conn.database], pgEnv(conn), { stdinFile: sourcePath }), "psql restore");
      }
    },
    async query(conn, sql) {
      const out = await runProcess(bin("psql"), ["-tAqc", sql], pgEnv(conn));
      assertOk(out, "psql query");
      return out.stdout.trim();
    },
    async serverVersion(conn) {
      const out = await runProcess(bin("psql"), ["-tAqc", "SHOW server_version"], pgEnv(conn));
      assertOk(out, "psql server_version");
      return out.stdout.trim();
    },
    async resetPublicSchema(conn) {
      assertOk(
        await runProcess(bin("psql"), ["-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"], pgEnv(conn)),
        "psql reset schema",
      );
    },
  };
}

// ── Docker mode ────────────────────────────────────────────────────────────
export interface DockerPgOptions {
  image: string;
  network?: string;
}

export function createDockerPgToolRunner(opts: DockerPgOptions): PgToolRunner {
  // Bağlantı bilgisini container arg + env olarak geçir; parola -e PGPASSWORD (argv değil container env).
  const connArgs = (conn: PgConnection): string[] => [
    "-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database,
  ];
  const dockerBase = (conn: PgConnection, interactive: boolean): string[] => {
    const base = ["run", "--rm"];
    if (interactive) base.push("-i");
    if (opts.network) base.push("--network", opts.network);
    base.push("-e", `PGPASSWORD=${conn.password}`);
    if (conn.sslmode) base.push("-e", `PGSSLMODE=${conn.sslmode}`);
    base.push(opts.image);
    return base;
  };
  return {
    describe: `docker(${opts.image}${opts.network ? `,net=${opts.network}` : ""})`,
    async dump(conn, destPath, format) {
      const fmtArgs = format === "custom" ? ["-Fc", "-Z", "6"] : ["-Fp"];
      const args = [...dockerBase(conn, false), "pg_dump", ...connArgs(conn), ...fmtArgs, "--no-owner", "--no-privileges"];
      assertOk(await runProcess("docker", args, process.env, { stdoutFile: destPath }), "docker pg_dump");
    },
    async restoreFromFile(conn, sourcePath, format) {
      if (format === "custom") {
        const args = [...dockerBase(conn, true), "pg_restore", ...connArgs(conn), "--no-owner", "--no-privileges", "--exit-on-error"];
        assertOk(await runProcess("docker", args, process.env, { stdinFile: sourcePath }), "docker pg_restore");
      } else {
        const args = [...dockerBase(conn, true), "psql", ...connArgs(conn), "-v", "ON_ERROR_STOP=1"];
        assertOk(await runProcess("docker", args, process.env, { stdinFile: sourcePath }), "docker psql restore");
      }
    },
    async query(conn, sql) {
      const args = [...dockerBase(conn, false), "psql", ...connArgs(conn), "-tAqc", sql];
      const out = await runProcess("docker", args, process.env);
      assertOk(out, "docker psql query");
      return out.stdout.trim();
    },
    async serverVersion(conn) {
      const args = [...dockerBase(conn, false), "psql", ...connArgs(conn), "-tAqc", "SHOW server_version"];
      const out = await runProcess("docker", args, process.env);
      assertOk(out, "docker psql server_version");
      return out.stdout.trim();
    },
    async resetPublicSchema(conn) {
      const args = [...dockerBase(conn, false), "psql", ...connArgs(conn), "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"];
      assertOk(await runProcess("docker", args, process.env), "docker psql reset schema");
    },
  };
}
