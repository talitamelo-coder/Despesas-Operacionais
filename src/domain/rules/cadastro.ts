import type { Contrato, Fornecedor } from "../types";

/**
 * Completude do cadastro de contrato — usada para contratos importados de planilhas.
 * Dados faltantes são calculados (somem sozinhos quando preenchidos); confirmações vindas da
 * importação ficam em `confirmacoesPendentes` até alguém revisar o contrato.
 */
export function pendenciasCadastro(c: Contrato, fornecedor?: Fornecedor, tipoNome?: string): string[] {
  const p: string[] = [];
  if (!c.vigencia.dataInicio) p.push("Data de início");
  if (!c.vigencia.dataFim && c.vigencia.tipoVigencia === "Prazo determinado") p.push("Data de fim");
  if (!(c.condicoes.valorAnual > 0)) p.push("Valor anual");
  if (c.condicoes.moeda !== "BRL" && !c.condicoes.cotacao?.valor) p.push("Cotação da moeda");
  if (!c.objeto?.trim()) p.push("Objeto");
  if (fornecedor && !fornecedor.cnpj && !fornecedor.estrangeiro) p.push("CNPJ do fornecedor");
  if (tipoNome === TIPO_NAO_CLASSIFICADO) p.push("Tipo de contrato");
  return [...p, ...(c.confirmacoesPendentes ?? [])];
}

export const TIPO_NAO_CLASSIFICADO = "Não classificado";
