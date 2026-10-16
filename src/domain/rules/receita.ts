import { addMeses } from "../datas";
import { errosVigencia } from "./prazos";
import type { AditivoContrato, Contrato, ISODate, ValoresReceita } from "../types";

/**
 * Contratos de receita (clientes) — ÚNICA fonte destas regras.
 * O módulo de contratos registra o contratado e o saldo; faturamento e medição ficam com Contas a receber.
 * Valores só mudam por aditivo (o escalonamento é a mudança já prevista no próprio contrato).
 */

/** Valor mensal fixo vigente na data (aplica o escalonamento previsto no contrato). */
export function valorMensalFixoNaData(r: ValoresReceita, data: ISODate): number {
  let v = r.valorMensalFixo ?? 0;
  for (const e of [...(r.escalonamento ?? [])].sort((a, b) => a.aPartirDe.localeCompare(b.aPartirDe))) if (e.aPartirDe <= data) v = e.valorMensalFixo;
  return v;
}

/** Receita mensal estimada na data: fixo vigente + variável estimado. */
export function receitaMensalNaData(r: ValoresReceita, data: ISODate): number {
  if (r.contratoPrincipalId) return 0; // apurada no contrato principal: não soma de novo
  return valorMensalFixoNaData(r, data) + (r.valorMensalVariavelEstimado ?? 0);
}

/** Valor anual de referência (listas e totais): receita mensal inicial × 12. */
export function valorAnualReceita(r: ValoresReceita): number {
  return r.contratoPrincipalId ? 0 : ((r.valorMensalFixo ?? 0) + (r.valorMensalVariavelEstimado ?? 0)) * 12;
}

/** Soma do fixo mês a mês entre duas datas (inclusive), com escalonamento. */
export function fixoNoPeriodo(r: ValoresReceita, inicio: ISODate, fim: ISODate): number {
  let total = 0;
  for (let d = inicio.slice(0, 8) + "01"; d <= fim; d = addMeses(d, 1)) total += valorMensalFixoNaData(r, d < inicio ? inicio : d);
  return total;
}

export function errosContratoReceita(c: Partial<Contrato>): string[] {
  const e: string[] = [];
  if (!c.clienteId) e.push("Informe o cliente.");
  if (!c.empresaId) e.push("Informe a empresa do grupo.");
  if (!c.objeto?.trim()) e.push("Informe o objeto.");
  if (!c.gestorId) e.push("Informe o responsável pelo contrato.");
  if (c.vigencia) e.push(...errosVigencia(c.vigencia));
  const r = c.receita;
  if (!r) return [...e, "Informe os valores contratados."];
  if (!r.contratoPrincipalId) {
    if (r.tipoReceita !== "Variável" && !(r.valorMensalFixo && r.valorMensalFixo > 0)) e.push("Informe o valor mensal fixo.");
    if (r.tipoReceita !== "Fixa" && r.valorMensalVariavelEstimado === undefined && !r.valorTotalContratado) e.push("Informe a estimativa mensal da parte variável ou o valor total do contrato.");
  }
  if (r.valorTotalContratado !== undefined && !(r.valorTotalContratado > 0)) e.push("O valor total contratado deve ser maior que zero.");
  for (const x of r.escalonamento ?? []) {
    if (!x.aPartirDe || !(x.valorMensalFixo >= 0)) e.push("Escalonamento: informe a data e o novo valor mensal.");
    else if (c.vigencia?.dataInicio && x.aPartirDe <= c.vigencia.dataInicio) e.push("Escalonamento deve começar depois do início da vigência.");
  }
  return e;
}

export type NovoAditivo = Omit<AditivoContrato, "id" | "antes" | "depois" | "registradoPorId" | "registradoEm">;

/**
 * Aplica o aditivo ao próprio contrato (valor e/ou prazo) e devolve o resumo antes/depois.
 * Variação de valor total vira saldo adicionado (aporte ligado ao número do aditivo).
 */
export function aplicarAditivoRegistrado(c: Contrato, a: NovoAditivo): { contrato: Contrato; antes: string; depois: string; erros: string[] } {
  const erros: string[] = [];
  if (!a.numero?.trim()) erros.push("Informe o número do aditivo.");
  if (!a.data) erros.push("Informe a data do aditivo.");
  if (!a.descricao?.trim()) erros.push("Descreva o aditivo.");
  const mudaValor = a.variacaoValorTotal !== undefined || a.novoValorMensalFixo !== undefined || a.novoValorAnual !== undefined;
  const mudaPrazo = Boolean(a.novaDataFim);
  if ((a.tipo === "Valor" || a.tipo === "Valor e prazo") && !mudaValor) erros.push("Informe o novo valor ou a variação do valor total.");
  if ((a.tipo === "Prazo" || a.tipo === "Valor e prazo") && !mudaPrazo) erros.push("Informe a nova data de fim.");
  if (a.novoValorMensalFixo !== undefined && !a.aPartirDe) erros.push("Informe a partir de quando vale o novo valor mensal.");
  if (a.novaDataFim && c.vigencia.dataInicio && a.novaDataFim <= c.vigencia.dataInicio) erros.push("A nova data de fim deve ser posterior ao início da vigência.");
  const novo: Contrato = structuredClone(c);
  const antes: string[] = [];
  const depois: string[] = [];
  if (a.novaDataFim) {
    antes.push(`fim ${c.vigencia.dataFim || "indeterminado"}`);
    depois.push(`fim ${a.novaDataFim}`);
    novo.vigencia = { ...novo.vigencia, dataFim: a.novaDataFim, tipoVigencia: "Prazo determinado" };
  }
  if (a.novoValorMensalFixo !== undefined && a.aPartirDe) {
    if (!novo.receita) erros.push("Novo valor mensal fixo só se aplica a contrato de cliente.");
    else {
      antes.push(`fixo ${valorMensalFixoNaData(novo.receita, a.aPartirDe)}/mês`);
      depois.push(`fixo ${a.novoValorMensalFixo}/mês a partir de ${a.aPartirDe}`);
      novo.receita = { ...novo.receita, escalonamento: [...(novo.receita.escalonamento ?? []).filter((e) => e.aPartirDe !== a.aPartirDe), { aPartirDe: a.aPartirDe, valorMensalFixo: a.novoValorMensalFixo }] };
    }
  }
  if (a.novoValorAnual !== undefined) {
    antes.push(`valor anual ${c.condicoes.valorAnual}`);
    depois.push(`valor anual ${a.novoValorAnual}`);
    novo.condicoes = { ...novo.condicoes, valorAnual: a.novoValorAnual };
  }
  if (a.variacaoValorTotal) depois.push(`${a.variacaoValorTotal > 0 ? "+" : ""}${a.variacaoValorTotal} no valor total`);
  return { contrato: novo, antes: antes.join("; ") || "—", depois: depois.join("; ") || "—", erros };
}
