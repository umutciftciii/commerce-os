import os from "node:os";

/**
 * TODO-173-TI (test-infra hardening) — TEK ve kontrollü vitest fork/concurrency politikası.
 *
 * KÖK NEDEN: jsdom + @testing-library suite'leri fork başına event-loop açısından ağırdır. Vitest'in
 * varsayılan `forks` havuzu maxForks ≈ çekirdek sayısı kadar açar; buna ek olarak `turbo run test`
 * varsayılan olarak birçok paket suite'ini AYNI ANDA koşturur → toplam fork sayısı çekirdeği KAT KAT
 * aşar (aşırı-abonelik). Yük altında en ağır async RTL/RSC akışları 5000ms test timeout'unu aşabilir
 * (flaky). İki yüzey birlikte çözülür:
 *   1) ORKESTRASYON: kök `test` script'i `turbo run test --concurrency=1` ile suite'leri SIRALI koşar —
 *      DB integration suite'i ile UI suite'leri ARTIK aynı anda kaynak tüketmez (cross-suite yok).
 *   2) INTRA-SUITE (bu helper): tek suite içindeki fork sayısını çekirdeğe göre SINIRLAR. jsdom/RTL
 *      suite'leri (`heavy`) fork başına daha ağır olduğundan daha sıkı sınırlanır.
 *
 * Bu bir DAVRANIŞ değil ZAMANLAMA/KAYNAK düzeltmesidir: test TIMEOUT'ları ARTIRILMAZ, `.skip`/retry/
 * flaky-suppression KULLANILMAZ; yalnız her fork'a event-loop baş-boşluğu bırakılır (TD-199 deseninin
 * repo-geneli, ortak-helper hâli). Çekirdek sayısı hem CI (2–4 çekirdek) hem local (çok çekirdek) için
 * deterministik bir sınır üretir.
 */
function coreCount(): number {
  return typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
}

export interface BoundedPoolOptions {
  /** jsdom/@testing-library (React) suite'i mi? Öyleyse fork sayısı daha sıkı sınırlanır. */
  heavy?: boolean;
}

/**
 * Çekirdeğe göre sınırlı `forks` havuzu döndürür. `heavy` (UI/jsdom) suite'leri en fazla 4 fork; diğer
 * (backend/.ts) suite'ler çekirdek−2. Suite'ler `--concurrency=1` ile sıralı koştuğundan bu sınırlar
 * intra-suite açlığı önler. Değerler alt-sınırı 1'dir (tek-çekirdek CI'da bile geçerli).
 */
export function boundedForkPool(opts: BoundedPoolOptions = {}) {
  const cores = coreCount();
  const maxForks = opts.heavy
    ? Math.max(1, Math.min(4, cores - 1))
    : Math.max(1, cores - 2);
  return {
    pool: "forks" as const,
    poolOptions: { forks: { maxForks, minForks: 1 } },
  };
}
