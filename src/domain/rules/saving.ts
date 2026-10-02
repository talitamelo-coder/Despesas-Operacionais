import type { ComponenteSaving, OrigemSaving, Saving } from "../types";

/**
 * Regras de saving — indicador principal: SAVING ANUAL (BRL).
 *
 * Baseline padrão = valor anual do contrato anterior.
 * Baseline ajustado só com evidência objetiva (ex.: reajuste previsto em contrato).
 * Composição por origem não pode ultrapassar o total (sem dupla contagem).
 */

const TOLERANCIA = 0.01; // centavos

export function savingAnual(s: Pick<Saving, "baselineAnual" | "valorNegociadoAnual">): number {
  return s.baselineAnual - s.valorNegociadoAnual;
}

export function savingPercentual(s: Pick<Saving, "baselineAnual" | "valorNegociadoAnual">): number {
  if (!s.baselineAnual) return 0;
  return (savingAnual(s) / s.baselineAnual) * 100;
}

/** Baseline ajustado a partir do valor anterior e de um reajuste previsto (%). */
export function baselineAjustado(valorAnterior: number, reajustePrevistoPct: number): number {
  return arredondar(valorAnterior * (1 + reajustePrevistoPct / 100));
}

export function totalComponentes(componentes: ComponenteSaving[]): number {
  return componentes.reduce((acc, c) => acc + (c.valorAnual || 0), 0);
}

export interface ComposicaoSaving {
  total: number;
  alocado: number;
  naoAlocado: number;
  itens: { origem: OrigemSaving; valor: number; percentual: number }[];
}

export function composicaoSaving(s: Saving): ComposicaoSaving {
  const total = savingAnual(s);
  // Agrupa por origem para não contar duas vezes a mesma origem.
  const porOrigem = new Map<OrigemSaving, number>();
  for (const c of s.componentes) porOrigem.set(c.origem, (porOrigem.get(c.origem) ?? 0) + c.valorAnual);
  const alocado = totalComponentes(s.componentes);
  const itens = [...porOrigem.entries()]
    .map(([origem, valor]) => ({ origem, valor, percentual: total ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  return { total, alocado, naoAlocado: arredondar(total - alocado), itens };
}

export function validarSaving(s: Saving): string[] {
  const erros: string[] = [];
  if (s.baselineAnual < 0) erros.push("Baseline não pode ser negativo.");
  if (s.valorNegociadoAnual < 0) erros.push("Valor negociado não pode ser negativo.");
  if (s.tipoBaseline === "Baseline ajustado" && !s.evidenciaBaseline?.trim())
    erros.push("Baseline ajustado exige evidência objetiva.");
  if (!s.origemOportunidade) erros.push("Origem da oportunidade é obrigatória.");

  const total = savingAnual(s);
  const alocado = totalComponentes(s.componentes);
  if (s.componentes.some((c) => c.valorAnual < 0) && total >= 0)
    erros.push("Componentes de saving não podem ser negativos.");
  if (total > 0 && alocado - total > TOLERANCIA)
    erros.push("Soma das origens excede o saving anual total (dupla contagem).");
  if (total > 0 && s.componentes.length === 0) erros.push("Informe ao menos uma origem do saving.");
  const origens = s.componentes.map((c) => c.origem);
  if (new Set(origens).size !== origens.length) erros.push("Cada origem de saving deve aparecer uma única vez.");
  return erros;
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}
