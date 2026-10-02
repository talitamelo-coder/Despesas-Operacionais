import type { CondicoesComerciais, Cotacao, Moeda } from "../types";

/** Conversões cambiais — a cotação é sempre informada manualmente por Suprimentos. */

export function converterParaBRL(valor: number, moeda: Moeda, cotacao?: Pick<Cotacao, "valor">): number | undefined {
  if (moeda === "BRL") return valor;
  if (!cotacao || !cotacao.valor) return undefined; // sem cotação não há conversão (não chutar)
  return valor * cotacao.valor;
}

export function valorAnualBRL(c: Pick<CondicoesComerciais, "valorAnual" | "moeda" | "cotacao">): number | undefined {
  return converterParaBRL(c.valorAnual, c.moeda, c.cotacao);
}

export interface DecomposicaoVariacao {
  impactoPreco: number;
  impactoVolume: number;
  impactoCambial: number;
  variacaoLiquidaBRL: number;
}

export interface CenarioComercial {
  quantidade: number;
  precoUnitario: number; // na moeda do contrato
  taxa: number; // BRL por unidade de moeda (1 para BRL)
}

/**
 * Decompõe a variação de custo anual em BRL entre dois cenários.
 * Ordem: preço (volume e câmbio anteriores) → volume (preço novo, câmbio anterior) → câmbio (cenário novo).
 * A soma dos três impactos é exatamente a variação líquida.
 *
 * Aumento de demanda aparece como impacto de VOLUME, não como piora de desempenho de Suprimentos.
 */
export function decomporVariacao(anterior: CenarioComercial, novo: CenarioComercial): DecomposicaoVariacao {
  const impactoPreco = (novo.precoUnitario - anterior.precoUnitario) * anterior.quantidade * anterior.taxa;
  const impactoVolume = (novo.quantidade - anterior.quantidade) * novo.precoUnitario * anterior.taxa;
  const impactoCambial = (novo.taxa - anterior.taxa) * novo.quantidade * novo.precoUnitario;
  const variacaoLiquidaBRL =
    novo.quantidade * novo.precoUnitario * novo.taxa - anterior.quantidade * anterior.precoUnitario * anterior.taxa;
  return { impactoPreco, impactoVolume, impactoCambial, variacaoLiquidaBRL };
}

export function cenarioDe(c: CondicoesComerciais): CenarioComercial | undefined {
  const taxa = c.moeda === "BRL" ? 1 : c.cotacao?.valor;
  if (!taxa) return undefined;
  const quantidade = c.quantidade ?? 1;
  const precoUnitario = c.precoUnitario ?? c.valorAnual / quantidade;
  return { quantidade, precoUnitario, taxa };
}
