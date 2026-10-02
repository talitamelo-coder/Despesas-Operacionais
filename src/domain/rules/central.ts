import { processoAtivo } from "./fluxo";
import type { Contrato, ProcessoContratacao } from "../types";

/** Classificação das abas da Central de Contratos — regra única. */

export const ABAS_CENTRAL = [
  "Todos",
  "Em contratação",
  "Vigentes",
  "Em renovação",
  "Em aditivo",
  "Encerrados",
  "Ações necessárias",
] as const;
export type AbaCentral = (typeof ABAS_CENTRAL)[number];

/** Situação de ciclo do contrato: renovação e aditivo são processos relacionados, não substituem "Vigente". */
export type SituacaoCiclo = "Em renovação" | "Em substituição" | "Em renegociação" | "Em aditivo" | undefined;

export function situacaoCiclo(processosAbertos: Pick<ProcessoContratacao, "tipo">[]): SituacaoCiclo {
  const tipos = new Set(processosAbertos.map((p) => p.tipo));
  if (tipos.has("Renovação")) return "Em renovação";
  if (tipos.has("Substituição de fornecedor")) return "Em substituição";
  if (tipos.has("Renegociação")) return "Em renegociação";
  if (tipos.has("Aditivo")) return "Em aditivo";
  return undefined;
}

export function abasDoContrato(c: Contrato, processosAbertos: ProcessoContratacao[], temAcao: boolean): AbaCentral[] {
  const abas: AbaCentral[] = ["Todos"];
  if (c.status === "Vigente" || c.status === "Suspenso") abas.push("Vigentes");
  if (c.status === "Encerrado" || c.status === "Rescindido") abas.push("Encerrados");
  const sit = situacaoCiclo(processosAbertos);
  if (sit === "Em renovação" || sit === "Em substituição" || sit === "Em renegociação") abas.push("Em renovação");
  if (processosAbertos.some((p) => p.tipo === "Aditivo")) abas.push("Em aditivo");
  if (temAcao) abas.push("Ações necessárias");
  return abas;
}

/** Processos que ainda não têm contrato próprio aparecem na Central como "Em contratação". */
export function processoApareceNaCentral(p: ProcessoContratacao): boolean {
  return processoAtivo(p) && (p.tipo === "Nova contratação" || p.tipo === "Substituição de fornecedor");
}

export function abasDoProcesso(temAcao: boolean): AbaCentral[] {
  return temAcao ? ["Todos", "Em contratação", "Ações necessárias"] : ["Todos", "Em contratação"];
}
