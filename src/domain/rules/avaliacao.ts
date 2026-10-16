import type { AvaliacaoRenovacao, TipoVigencia } from "../types";

/**
 * Desfecho da avaliação de renovação — regra única.
 * - Substituir → processo de substituição de fornecedor.
 * - Renovar → processo de renovação (prazo determinado) ou fornecedor mantido (revisão anual do indeterminado).
 * - Nem renovar nem substituir (ou encerrar) → contrato Cancelado.
 */
export type DesfechoAvaliacao = "Substituição de fornecedor" | "Renovação" | "Manter fornecedor" | "Cancelar contrato";

export function desfechoAvaliacao(a: AvaliacaoRenovacao, tipoVigencia: TipoVigencia): DesfechoAvaliacao | undefined {
  if (a.desejaSubstituir === "Sim") return "Substituição de fornecedor";
  if (a.desejaRenovar === "Sim") return tipoVigencia === "Prazo indeterminado" ? "Manter fornecedor" : "Renovação";
  if (a.desejaEncerrar === "Sim" || (a.desejaRenovar === "Não" && a.desejaSubstituir === "Não")) return "Cancelar contrato";
  return undefined;
}
