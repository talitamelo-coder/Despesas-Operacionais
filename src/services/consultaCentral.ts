import { abasDoContrato, abasDoProcesso, ABAS_CENTRAL, processoApareceNaCentral, situacaoCiclo, type AbaCentral } from "@/domain/rules/central";
import { ORDEM_PRIORIDADE, maiorPrioridade, prioridadeDosPrazos } from "@/domain/rules/acoes";
import { converterParaBRL, valorAnualBRL } from "@/domain/rules/cambio";
import { processoAtivo, valorNegociado } from "@/domain/rules/fluxo";
import { decisaoRegistrada, prazosDoContrato } from "@/domain/rules/prazos";
import { normalizarBusca } from "@/domain/formatacao";
import type { AcaoNecessaria, Contrato, Empresa, Fornecedor, Prioridade, ProcessoContratacao, RegrasAlerta, Usuario } from "@/domain/types";
import type { FiltrosCentral, LinhaCentral, Ordenacao, ResultadoCentral } from "./api";

/**
 * Motor de consulta da Central (filtro, busca, ordenação e paginação).
 * No mock roda no navegador; na API futura o mesmo contrato é atendido pelo backend
 * (paginação server-side), sem mudança na UI.
 */

interface Base {
  contratos: Contrato[];
  processos: ProcessoContratacao[];
  usuarios: Usuario[];
  empresas: Empresa[];
  fornecedores: Fornecedor[];
  acoes: AcaoNecessaria[];
  regras: RegrasAlerta;
}

interface LinhaIndexada extends LinhaCentral {
  abas: AbaCentral[];
  textoBusca: string;
  empresaId?: string;
  fornecedorId?: string;
  gestorId?: string;
  analistaId?: string;
  tipoContratoId?: string;
  tiposProcesso: string[];
  renovacaoAutomatica: boolean;
}

export function montarLinhas(b: Base): LinhaIndexada[] {
  const usuario = new Map(b.usuarios.map((u) => [u.id, u.nome]));
  const empresa = new Map(b.empresas.map((e) => [e.id, e.nome]));
  const fornecedor = new Map(b.fornecedores.map((f) => [f.fornecedor_id, f]));
  const acoesPorRef = new Map<string, AcaoNecessaria[]>();
  for (const a of b.acoes) acoesPorRef.set(a.referencia.id, [...(acoesPorRef.get(a.referencia.id) ?? []), a]);
  const abertos = new Map<string, ProcessoContratacao[]>();
  for (const p of b.processos)
    if (p.contrato_anterior_id && processoAtivo(p)) abertos.set(p.contrato_anterior_id, [...(abertos.get(p.contrato_anterior_id) ?? []), p]);

  const linhas: LinhaIndexada[] = [];

  for (const c of b.contratos) {
    const f = fornecedor.get(c.fornecedorId);
    const procs = abertos.get(c.contrato_id) ?? [];
    // Ações do contrato + ações dos processos relacionados.
    const acoes = [...(acoesPorRef.get(c.contrato_id) ?? []), ...procs.flatMap((p) => acoesPorRef.get(p.processo_id) ?? [])];
    const prazos = prazosDoContrato(c, undefined, b.regras);
    let prioridade: Prioridade = c.status === "Vigente" && !c.sucessor_id ? prioridadeDosPrazos(prazos, decisaoRegistrada(c)) : "Normal";
    for (const a of acoes) prioridade = maiorPrioridade(prioridade, a.prioridade);
    const sucessor = c.sucessor_id ? b.contratos.find((x) => x.contrato_id === c.sucessor_id) : undefined;
    const proximaAcao = acoes.sort((x, y) => ORDEM_PRIORIDADE[x.prioridade] - ORDEM_PRIORIDADE[y.prioridade])[0]?.acao
      ?? (sucessor ? `${c.relacaoAnterior === "Substituição" || sucessor.relacaoAnterior === "Substituição" ? "Substituído" : "Renovado"} por ${sucessor.codigo}` : c.status === "Vigente" ? "Acompanhar vigência" : "—");
    linhas.push({
      id: c.contrato_id,
      tipo: "contrato",
      codigo: c.codigo,
      link: `/contratos/${c.contrato_id}`,
      fornecedor: f?.razaoSocial ?? "—",
      cnpj: f?.cnpj,
      empresa: empresa.get(c.empresaId) ?? "—",
      objeto: c.objeto,
      gestor: usuario.get(c.gestorId) ?? "—",
      analista: usuario.get(c.analistaId) ?? "—",
      valorAnualBRL: valorAnualBRL(c.condicoes),
      moeda: c.condicoes.moeda,
      dataFim: c.vigencia.dataFim,
      diasAteVencimento: prazos.diasAteVencimento,
      status: c.status,
      situacao: situacaoCiclo(procs),
      proximaAcao,
      prioridade,
      renovacaoAutomaticaEmRisco: prazos.renovacaoAutomaticaEmRisco,
      jira_key: c.jira_key,
      projeto: c.projeto,
      abas: abasDoContrato(c, procs, acoes.length > 0),
      textoBusca: normalizarBusca([c.codigo, f?.razaoSocial, f?.nomeFantasia, f?.cnpj, c.objeto, c.jira_key, c.projeto, ...procs.map((p) => p.codigo)].filter(Boolean).join(" ")),
      empresaId: c.empresaId,
      fornecedorId: c.fornecedorId,
      gestorId: c.gestorId,
      analistaId: c.analistaId,
      tipoContratoId: c.tipoContratoId,
      tiposProcesso: procs.map((p) => p.tipo),
      renovacaoAutomatica: c.vigencia.renovacaoAutomatica,
    });
  }

  for (const p of b.processos.filter(processoApareceNaCentral)) {
    const rec = p.propostas.find((x) => x.id === p.propostaRecomendadaId);
    const f = rec?.fornecedorId ? fornecedor.get(rec.fornecedorId) : undefined;
    const acoes = acoesPorRef.get(p.processo_id) ?? [];
    let prioridade: Prioridade = "Normal";
    for (const a of acoes) prioridade = maiorPrioridade(prioridade, a.prioridade);
    const valor = valorNegociado(p) ?? p.validacao?.valorValidado ?? p.demandaJira?.valorEstimado;
    const moeda = rec?.moeda ?? p.condicoes?.moeda ?? "BRL";
    linhas.push({
      id: p.processo_id,
      tipo: "processo",
      codigo: p.codigo,
      link: `/processos/${p.processo_id}`,
      fornecedor: f?.razaoSocial ?? rec?.fornecedorPotencial ?? "A definir",
      cnpj: f?.cnpj,
      empresa: p.empresaId ? empresa.get(p.empresaId) ?? "—" : "—",
      objeto: p.objeto ?? "—",
      gestor: p.gestorId ? usuario.get(p.gestorId) ?? "—" : "—",
      analista: p.analistaId ? usuario.get(p.analistaId) ?? "—" : "—",
      valorAnualBRL: valor !== undefined ? converterParaBRL(valor, moeda, p.condicoes?.cotacao) : undefined,
      moeda,
      dataFim: p.vigencia?.dataFim,
      status: p.status,
      situacao: p.tipo,
      proximaAcao: acoes[0]?.acao ?? "—",
      prioridade,
      renovacaoAutomaticaEmRisco: false,
      jira_key: p.jira_key,
      projeto: p.projeto,
      abas: abasDoProcesso(acoes.length > 0),
      textoBusca: normalizarBusca([p.codigo, f?.razaoSocial, rec?.fornecedorPotencial, f?.cnpj, p.objeto, p.jira_key, p.projeto].filter(Boolean).join(" ")),
      empresaId: p.empresaId,
      fornecedorId: rec?.fornecedorId,
      gestorId: p.gestorId,
      analistaId: p.analistaId,
      tipoContratoId: p.tipoContratoId,
      tiposProcesso: [p.tipo],
      renovacaoAutomatica: Boolean(p.vigencia?.renovacaoAutomatica),
    });
  }
  return linhas;
}

function passaFiltros(l: LinhaIndexada, f: FiltrosCentral, termos: string[]): boolean {
  if (f.empresaId && l.empresaId !== f.empresaId) return false;
  if (f.fornecedorId && l.fornecedorId !== f.fornecedorId) return false;
  if (f.gestorId && l.gestorId !== f.gestorId) return false;
  if (f.analistaId && l.analistaId !== f.analistaId) return false;
  if (f.status && l.status !== f.status) return false;
  if (f.tipoContratoId && l.tipoContratoId !== f.tipoContratoId) return false;
  if (f.tipoProcesso && !l.tiposProcesso.includes(f.tipoProcesso)) return false;
  if (f.moeda && l.moeda !== f.moeda) return false;
  if (f.projeto && l.projeto !== f.projeto) return false;
  if (f.renovacaoAutomatica && l.renovacaoAutomatica !== (f.renovacaoAutomatica === "sim")) return false;
  if (f.vencimento) {
    if (l.diasAteVencimento === undefined) return false;
    if (f.vencimento === "vencidos") {
      if (l.diasAteVencimento >= 0) return false;
    } else if (l.diasAteVencimento < 0 || l.diasAteVencimento > Number(f.vencimento)) return false;
  }
  return termos.every((t) => l.textoBusca.includes(t));
}

const CHAVE_ORDENACAO: Record<Ordenacao["coluna"], (l: LinhaCentral) => string | number> = {
  codigo: (l) => l.codigo,
  fornecedor: (l) => l.fornecedor,
  empresa: (l) => l.empresa,
  objeto: (l) => l.objeto,
  gestor: (l) => l.gestor,
  analista: (l) => l.analista,
  valorAnual: (l) => l.valorAnualBRL ?? -1,
  dataFim: (l) => l.dataFim ?? "9999",
  status: (l) => l.status,
  prioridade: (l) => ORDEM_PRIORIDADE[l.prioridade],
};

export function consultar(
  linhas: LinhaIndexada[],
  filtros: FiltrosCentral,
  ordenacao: Ordenacao,
  pagina: number,
  tamanhoPagina: number,
): ResultadoCentral {
  const termos = normalizarBusca(filtros.busca ?? "").split(/\s+/).filter(Boolean);
  const filtradas = linhas.filter((l) => passaFiltros(l, filtros, termos));
  const contagemPorAba = Object.fromEntries(ABAS_CENTRAL.map((a) => [a, 0])) as Record<AbaCentral, number>;
  for (const l of filtradas) for (const a of l.abas) contagemPorAba[a]++;
  const daAba = filtradas.filter((l) => l.abas.includes(filtros.aba));
  const chave = CHAVE_ORDENACAO[ordenacao.coluna];
  const dir = ordenacao.direcao === "asc" ? 1 : -1;
  daAba.sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return r * dir || a.codigo.localeCompare(b.codigo);
  });
  const inicio = pagina * tamanhoPagina;
  return {
    linhas: daAba.slice(inicio, inicio + tamanhoPagina).map(({ abas: _a, textoBusca: _t, ...l }) => l),
    total: daAba.length,
    contagemPorAba,
  };
}
