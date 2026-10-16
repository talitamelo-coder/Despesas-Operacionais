import type { Contrato, Fornecedor, Rescisao } from "../types";

/**
 * Completude do cadastro de contrato — usada para contratos importados de planilhas.
 * Dados faltantes são calculados (somem sozinhos quando preenchidos); confirmações vindas da
 * importação ficam em `confirmacoesPendentes` até alguém revisar o contrato.
 */
export function pendenciasCadastro(c: Contrato, fornecedor?: Fornecedor, tipoNome?: string): string[] {
  const p: string[] = [];
  if (!c.vigencia.dataInicio) p.push("Data de início");
  if (!c.vigencia.dataFim && c.vigencia.tipoVigencia === "Prazo determinado") p.push("Data de fim");
  if (c.natureza !== "Receita" && !(c.condicoes.valorAnual > 0)) p.push("Valor anual");
  if (c.condicoes.moeda !== "BRL" && !c.condicoes.cotacao?.valor) p.push("Cotação da moeda");
  if (!c.objeto?.trim()) p.push("Objeto");
  if (fornecedor && !fornecedor.cnpj && !fornecedor.estrangeiro) p.push("CNPJ do fornecedor (ou marcar como fornecedor no exterior)");
  if (tipoNome === TIPO_NAO_CLASSIFICADO) p.push("Tipo de contrato");
  return [...p, ...(c.confirmacoesPendentes ?? [])];
}

export const TIPO_NAO_CLASSIFICADO = "Não classificado";

/** Unidades da quantidade contratada (lista padrão; editável em Administração → Listas auxiliares → Unidades). */
export const UNIDADES_PADRAO = ["Unidade", "Licença", "Usuário", "Assinatura", "Mês", "Hora", "Diária", "Posto", "Serviço", "Projeto", "Lote", "Linha", "Equipamento", "Kit", "Metro quadrado", "Quilômetro"];

/** Texto da multa rescisória: descrição livre; contratos antigos podem ter só percentual/valor. */
export function descricaoMulta(r: Pick<Rescisao, "possuiMulta" | "descricaoMulta" | "percentual" | "valor">, formatarValor: (v: number) => string): string {
  if (!r.possuiMulta) return "Não";
  if (r.descricaoMulta?.trim()) return r.descricaoMulta.trim();
  const partes = [r.percentual ? `${String(r.percentual).replace(".", ",")}%` : "", r.valor ? formatarValor(r.valor) : ""].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sim (descrição não informada)";
}

/**
 * Depois da contratação, valor e prazo só mudam por aditivo, renegociação ou novo contrato.
 * A edição direta fica liberada apenas para completar/corrigir cadastro importado (com pendências).
 */
export function camposDeValorAlterados(antes: Contrato, depois: Contrato): string[] {
  const r: string[] = [];
  if (antes.condicoes.valorAnual !== depois.condicoes.valorAnual) r.push("valor anual");
  if (antes.condicoes.moeda !== depois.condicoes.moeda) r.push("moeda");
  if (antes.vigencia.dataInicio !== depois.vigencia.dataInicio) r.push("início da vigência");
  if (antes.vigencia.dataFim !== depois.vigencia.dataFim) r.push("fim da vigência");
  if (antes.vigencia.tipoVigencia !== depois.vigencia.tipoVigencia) r.push("tipo de vigência");
  if (JSON.stringify(antes.receita ?? null) !== JSON.stringify(depois.receita ?? null)) r.push("valores de receita");
  return r;
}
