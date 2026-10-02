import { valorAnualBRL } from "./cambio";
import type { Contrato, MapaOrigens, ProcessoContratacao, TipoProcesso } from "../types";

/**
 * Herança de dados do contrato anterior para um novo processo (renovação, substituição,
 * renegociação, aditivo). Todos os campos herdados permanecem editáveis no novo processo.
 */

export const CAMPOS_HERDADOS = [
  "empresaId",
  "fornecedor",
  "objeto",
  "gestorId",
  "diretorId",
  "centroCusto",
  "projeto",
  "tipoContratoId",
  "condicoes.moeda",
  "condicoes.quantidade",
  "condicoes.valorAnterior",
  "condicoes.periodicidadePagamento",
  "condicoes.cotacao",
  "condicoes.condicaoPagamento",
  "reajuste",
  "rescisao",
  "vigencia.avisoPrevioDias",
] as const;

export type DadosHerdados = Pick<
  ProcessoContratacao,
  | "empresaId"
  | "objeto"
  | "gestorId"
  | "diretorId"
  | "analistaId"
  | "centroCusto"
  | "projeto"
  | "tipoContratoId"
  | "condicoes"
  | "vigencia"
  | "reajuste"
  | "rescisao"
  | "propostas"
  | "propostaRecomendadaId"
  | "saving"
  | "contrato_anterior_id"
  | "origens"
>;

export function herdarDeContrato(c: Contrato, tipo: TipoProcesso, novoIdProposta: () => string): DadosHerdados {
  const origens: MapaOrigens = {};
  for (const campo of CAMPOS_HERDADOS) origens[campo] = "herdado";

  const valorAnteriorBRL = valorAnualBRL(c.condicoes) ?? 0;
  const mantemFornecedor = tipo !== "Substituição de fornecedor";

  // Renovação/renegociação/aditivo: fornecedor atual entra como proposta inicial (herdada).
  const propostas = mantemFornecedor
    ? [
        {
          id: novoIdProposta(),
          fornecedorId: c.fornecedorId,
          moeda: c.condicoes.moeda,
          propostaInicialAnual: c.condicoes.valorAnual,
          observacao: "Valor do contrato anterior (herdado)",
        },
      ]
    : [];

  return {
    contrato_anterior_id: c.contrato_id,
    empresaId: c.empresaId,
    objeto: c.objeto,
    gestorId: c.gestorId,
    diretorId: c.diretorId,
    analistaId: c.analistaId,
    centroCusto: c.centroCusto,
    projeto: c.projeto,
    tipoContratoId: c.tipoContratoId,
    condicoes: {
      moeda: c.condicoes.moeda,
      quantidade: c.condicoes.quantidade,
      unidade: c.condicoes.unidade,
      precoUnitario: c.condicoes.precoUnitario,
      valorAnual: c.condicoes.valorAnual,
      periodicidadePagamento: c.condicoes.periodicidadePagamento,
      condicaoPagamento: c.condicoes.condicaoPagamento,
      cotacao: c.condicoes.cotacao ? { ...c.condicoes.cotacao } : undefined,
    },
    vigencia: {
      tipoVigencia: c.vigencia.tipoVigencia,
      avisoPrevioDias: c.vigencia.avisoPrevioDias,
      renovacaoAutomatica: c.vigencia.renovacaoAutomatica,
      prazoGestorDias: c.vigencia.prazoGestorDias,
      periodicidadeRenovacaoMeses: c.vigencia.periodicidadeRenovacaoMeses,
    },
    reajuste: { ...c.reajuste },
    rescisao: { ...c.rescisao },
    propostas,
    propostaRecomendadaId: mantemFornecedor ? propostas[0].id : undefined,
    // Baseline padrão = valor anual anterior (BRL).
    saving: {
      tipoBaseline: "Contrato anterior",
      baselineAnual: valorAnteriorBRL,
      valorNegociadoAnual: valorAnteriorBRL,
      componentes: [],
      origemOportunidade: "Suprimentos",
    },
    origens,
  };
}
