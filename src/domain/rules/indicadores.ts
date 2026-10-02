import { valorAnualBRL } from "./cambio";
import { prazosDoContrato } from "./prazos";
import { processoAtivo } from "./fluxo";
import { composicaoSaving, savingAnual } from "./saving";
import { situacaoCiclo } from "./central";
import type { AcaoNecessaria, Contrato, ISODate, OrigemSaving, ProcessoContratacao, RegrasAlerta } from "../types";

/** Indicadores do Dashboard — cálculo único, reutilizável no backend futuro. */

export interface SerieItem {
  nome: string;
  valor: number;
  quantidade?: number;
}

export interface Indicadores {
  contratosVigentes: number;
  valorAnualContratado: number;
  contratosEmRenovacao: number;
  vencendo30: number;
  vencendo60: number;
  vencendo90: number;
  acoesPendentes: number;
  acoesCriticas: number;
  renovacaoAutomaticaEmRisco: number;
  savingAnualTotal: number;
  savingSuprimentos: number;
  savingPorOrigem: SerieItem[];
  contratosPorEmpresa: SerieItem[];
  contratosPorFornecedor: SerieItem[];
  contratosPorTipo: SerieItem[];
  savingPorAnalista: SerieItem[];
}

interface Nomes {
  empresa: (id: string) => string;
  fornecedor: (id: string) => string;
  tipo: (id: string) => string;
  usuario: (id: string) => string;
}

function agrupar(contratos: Contrato[], chave: (c: Contrato) => string, valor: (c: Contrato) => number): SerieItem[] {
  const m = new Map<string, SerieItem>();
  for (const c of contratos) {
    const k = chave(c);
    const item = m.get(k) ?? { nome: k, valor: 0, quantidade: 0 };
    item.valor += valor(c);
    item.quantidade! += 1;
    m.set(k, item);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

export function calcularIndicadores(
  contratos: Contrato[],
  processos: ProcessoContratacao[],
  acoes: AcaoNecessaria[],
  nomes: Nomes,
  regras?: RegrasAlerta,
  referencia?: ISODate,
): Indicadores {
  const vigentes = contratos.filter((c) => c.status === "Vigente");
  const valor = (c: Contrato) => valorAnualBRL(c.condicoes) ?? 0;
  const saving = (c: Contrato) => (c.saving ? Math.max(0, savingAnual(c.saving)) : 0);

  const abertosPorContrato = new Map<string, ProcessoContratacao[]>();
  for (const p of processos)
    if (p.contrato_anterior_id && processoAtivo(p))
      abertosPorContrato.set(p.contrato_anterior_id, [...(abertosPorContrato.get(p.contrato_anterior_id) ?? []), p]);

  let v30 = 0,
    v60 = 0,
    v90 = 0,
    emRisco = 0,
    emRenovacao = 0;
  for (const c of vigentes) {
    const pz = prazosDoContrato(c, referencia, regras);
    if (pz.diasAteVencimento >= 0 && c.vigencia.tipoVigencia === "Prazo determinado") {
      if (pz.diasAteVencimento <= 30) v30++;
      if (pz.diasAteVencimento <= 60) v60++;
      if (pz.diasAteVencimento <= 90) v90++;
    }
    if (pz.renovacaoAutomaticaEmRisco) emRisco++;
    const sit = situacaoCiclo(abertosPorContrato.get(c.contrato_id) ?? []);
    if (sit && sit !== "Em aditivo") emRenovacao++;
  }

  const porOrigem = new Map<OrigemSaving, number>();
  const porAnalista = new Map<string, number>();
  for (const c of vigentes) {
    if (!c.saving) continue;
    for (const it of composicaoSaving(c.saving).itens) porOrigem.set(it.origem, (porOrigem.get(it.origem) ?? 0) + it.valor);
    const nome = nomes.usuario(c.analistaId);
    porAnalista.set(nome, (porAnalista.get(nome) ?? 0) + saving(c));
  }

  return {
    contratosVigentes: vigentes.length,
    valorAnualContratado: vigentes.reduce((a, c) => a + valor(c), 0),
    contratosEmRenovacao: emRenovacao,
    vencendo30: v30,
    vencendo60: v60,
    vencendo90: v90,
    acoesPendentes: acoes.length,
    acoesCriticas: acoes.filter((a) => a.prioridade === "Crítico").length,
    renovacaoAutomaticaEmRisco: emRisco,
    savingAnualTotal: vigentes.reduce((a, c) => a + saving(c), 0),
    savingSuprimentos: vigentes
      .filter((c) => c.saving?.origemOportunidade === "Suprimentos")
      .reduce((a, c) => a + saving(c), 0),
    savingPorOrigem: [...porOrigem.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    contratosPorEmpresa: agrupar(vigentes, (c) => nomes.empresa(c.empresaId), valor),
    contratosPorFornecedor: agrupar(vigentes, (c) => nomes.fornecedor(c.fornecedorId), valor).slice(0, 10),
    contratosPorTipo: agrupar(vigentes, (c) => nomes.tipo(c.tipoContratoId), valor),
    savingPorAnalista: [...porAnalista.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
  };
}
