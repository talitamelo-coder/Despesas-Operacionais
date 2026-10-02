import type { Moeda } from "./types";

const formatadores = new Map<string, Intl.NumberFormat>();

function fmt(moeda: Moeda, compacto: boolean): Intl.NumberFormat {
  const chave = `${moeda}-${compacto}`;
  let f = formatadores.get(chave);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
      notation: compacto ? "compact" : "standard",
      maximumFractionDigits: compacto ? 1 : 2,
    });
    formatadores.set(chave, f);
  }
  return f;
}

export function formatarMoeda(valor: number | undefined | null, moeda: Moeda = "BRL", compacto = false): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return "—";
  return fmt(moeda, compacto).format(valor);
}

export function formatarNumero(valor: number | undefined | null, casas = 0): string {
  if (valor === undefined || valor === null) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarPercentual(valor: number | undefined | null, casas = 1): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return "—";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function formatarCnpj(cnpj?: string): string {
  if (!cnpj) return "—";
  const d = somenteDigitos(cnpj);
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** Normaliza texto para busca: minúsculas, sem acentos. */
export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
