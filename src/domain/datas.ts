import type { ISODate } from "./types";

/**
 * Utilitários de data em ISO (YYYY-MM-DD), sem fuso: todas as regras de prazo
 * operam em dias corridos e não dependem do horário local.
 */

const MS_DIA = 86_400_000;

export function parseISO(d: ISODate): Date {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDias(d: ISODate, dias: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + dias * MS_DIA));
}

export function addMeses(d: ISODate, meses: number): ISODate {
  const base = parseISO(d);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + meses;
  const dia = base.getUTCDate();
  // Ajusta para o último dia do mês quando necessário (31/01 + 1 mês = 28/02).
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(y, m, Math.min(dia, ultimoDia))));
}

/** b - a em dias (positivo se b estiver no futuro em relação a a). */
export function diffDias(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_DIA);
}

export function anoDe(d: ISODate): number {
  return parseISO(d).getUTCFullYear();
}

/** Relógio único da aplicação — substituível em testes. */
let hojeFixo: ISODate | null = null;
export function hoje(): ISODate {
  return hojeFixo ?? toISO(new Date());
}
export function fixarHoje(d: ISODate | null): void {
  hojeFixo = d;
}

export function formatarData(d?: ISODate | null): string {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

export function formatarDataHora(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
