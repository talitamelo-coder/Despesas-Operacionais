/**
 * CSV no padrão brasileiro (separador ";" ou ",", decimal com vírgula, BOM do Excel).
 * Totais nunca vêm do arquivo: linhas de total são ignoradas e tudo é recalculado.
 */

export function lerCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') (campo += '"'), i++;
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) linha.push(campo), (campo = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo), linhas.push(linha), (linha = []), (campo = "");
    } else campo += ch;
  }
  if (campo || linha.length) linha.push(campo), linhas.push(linha);
  const [cab, ...corpo] = linhas.filter((l) => l.some((c) => c.trim()));
  if (!cab) return [];
  const chaves = cab.map((c) => normalizarCabecalho(c));
  return corpo.map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? "").trim()])));
}

export function normalizarCabecalho(c: string): string {
  return c
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function escapar(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera CSV com ";" e BOM (abre direto no Excel em pt-BR). Números com vírgula decimal. */
export function gerarCsv(cabecalho: string[], linhas: (string | number | undefined)[][]): string {
  const fmt = (v: string | number | undefined) => (typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v);
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map((v) => escapar(fmt(v))).join(";")).join("\r\n") + "\r\n";
}

/** "1.234,56" | "1234.56" | "1,5" | "R$ 10" → número. Vazio → undefined. */
export function numeroBR(v?: string): number | undefined {
  if (v === undefined) return undefined;
  let s = v.replace(/[R$US\s]/g, "");
  if (!s) return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "2026-03-01" ou "01/03/2026" → ISO. Inválida → "invalida". Vazio → undefined. */
export function dataBR(v?: string): string | undefined {
  if (!v) return undefined;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2].padStart(2, "0"), br[1].padStart(2, "0")] : [];
  if (!y) return "invalida";
  const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== `${y}-${m}-${d}` ? "invalida" : `${y}-${m}-${d}`;
}

export function normalizarTexto(s?: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
