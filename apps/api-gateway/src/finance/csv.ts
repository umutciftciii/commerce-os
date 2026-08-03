/**
 * Financial Reporting (ADR-268 §11) — SAF CSV üretimi. Server-side; formül-injection
 * korumalı; TR Excel uyumu için UTF-8 BOM. Sayısal minor-unit alanlar HAM (String)
 * yazılır (locale ondalık YOK — makine-okur); metin alanları `csvCell` ile kaçışlanır.
 * Satır sonu \r\n; content-type "text/csv; charset=utf-8".
 *
 * NOT: Repoda paylaşılan CSV yardımcısı yoktu (influencer/sponsored her biri kendi
 * `csvCell`'ini kopyalıyordu); bu modül finans export'ları için tek kaynağı sağlar.
 */

/** UTF-8 BOM — TR Excel'in dosyayı UTF-8 açması için (ADR-268 §11). */
export const UTF8_BOM = "﻿";

/**
 * Bir CSV hücresini güvenli kaçışlar. Formül-injection önlemi: `=`, `+`, `-`, `@`,
 * TAB, CR ile başlayan değerlere tek-tırnak öneki eklenir (Excel/Sheets formül
 * çalıştırmasın). Tırnak/virgül/newline içeren değerler çift-tırnakla sarılır.
 */
export function csvCell(value: string | number | null | undefined): string {
  let v = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Başlık + satırlardan tam CSV metni üretir (BOM önekli). Her hücre `csvCell` ile
 * kaçışlanır (sayılar dahil — güvenli, injection öneki sayıları etkilemez).
 */
export function buildCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines: string[] = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  return UTF8_BOM + lines.join("\r\n");
}
