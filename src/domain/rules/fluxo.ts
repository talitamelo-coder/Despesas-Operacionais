import type {
  Aprovacao,
  Documento,
  ProcessoContratacao,
  PropostaFornecedor,
  StatusProcesso,
  TipoProcesso,
} from "../types";

/**
 * Fluxo do processo de contratação e campos obrigatórios POR ETAPA.
 * Regra geral: não obrigar dezenas de campos na criação — cada etapa exige só o necessário.
 */

const FLUXO_COMPLETO: StatusProcesso[] = [
  "Rascunho",
  "Validação de Suprimentos",
  "Em cotação",
  "Em negociação",
  "Aguardando aprovação comercial",
  "Em análise jurídica",
  "Aguardando assinatura",
  "Concluído",
];

/** Etapas por tipo de processo. Renovação nasce no módulo e não passa por validação de JIRA. */
export const FLUXO_POR_TIPO: Record<TipoProcesso, StatusProcesso[]> = {
  "Nova contratação": FLUXO_COMPLETO,
  "Substituição de fornecedor": FLUXO_COMPLETO.filter((s) => s !== "Validação de Suprimentos"),
  Renovação: FLUXO_COMPLETO.filter((s) => s !== "Validação de Suprimentos" && s !== "Em cotação"),
  Renegociação: FLUXO_COMPLETO.filter((s) => s !== "Validação de Suprimentos" && s !== "Em cotação"),
  Aditivo: FLUXO_COMPLETO.filter((s) => s !== "Validação de Suprimentos" && s !== "Em cotação"),
};

export const STATUS_ENCERRADOS: StatusProcesso[] = ["Concluído", "Cancelado"];

export function processoAtivo(p: Pick<ProcessoContratacao, "status">): boolean {
  return !STATUS_ENCERRADOS.includes(p.status);
}

export function etapasDoProcesso(p: Pick<ProcessoContratacao, "tipo">): StatusProcesso[] {
  return FLUXO_POR_TIPO[p.tipo];
}

export function proximoStatus(p: Pick<ProcessoContratacao, "tipo" | "status">): StatusProcesso | undefined {
  const etapas = etapasDoProcesso(p);
  const i = etapas.indexOf(p.status);
  return i >= 0 && i < etapas.length - 1 ? etapas[i + 1] : undefined;
}

export function indiceEtapa(p: Pick<ProcessoContratacao, "tipo" | "status" | "statusAntesSuspensao">): number {
  const status = p.status === "Suspenso" ? p.statusAntesSuspensao ?? "Rascunho" : p.status;
  return etapasDoProcesso(p).indexOf(status);
}

/** Processo já saiu da decisão do gestor e está com Suprimentos/negociação. */
export function processoAvancouParaSuprimentos(p: Pick<ProcessoContratacao, "status">): boolean {
  return p.status !== "Rascunho" && p.status !== "Cancelado";
}

// ---------------------------------------------------------------- Aprovações

/** Modelo simples: Gestor e Suprimentos aprovam; Diretor dá ciência (aprova só em exceção). */
export function aprovacoesPadrao(
  p: Pick<ProcessoContratacao, "gestorId" | "analistaId" | "diretorId" | "excecao">,
): Aprovacao[] {
  const lista: Aprovacao[] = [];
  if (p.gestorId) lista.push({ papel: "Gestor", tipo: "Aprovação", status: "Pendente", usuarioId: p.gestorId });
  if (p.analistaId) lista.push({ papel: "Suprimentos", tipo: "Aprovação", status: "Pendente", usuarioId: p.analistaId });
  if (p.diretorId)
    lista.push({
      papel: "Diretor",
      tipo: p.excecao ? "Aprovação" : "Ciência",
      status: "Pendente",
      usuarioId: p.diretorId,
    });
  return lista;
}

/** Aprovação comercial concluída: todas as APROVAÇÕES aprovadas e nenhuma reprovação. Ciência não bloqueia. */
export function aprovacaoComercialConcluida(p: Pick<ProcessoContratacao, "aprovacoes">): boolean {
  const aprov = p.aprovacoes.filter((a) => a.tipo === "Aprovação");
  return (
    aprov.length >= 2 &&
    aprov.every((a) => a.status === "Aprovado") &&
    !p.aprovacoes.some((a) => a.status === "Reprovado")
  );
}

// ---------------------------------------------------------------- Valores

export function propostaRecomendada(p: Pick<ProcessoContratacao, "propostas" | "propostaRecomendadaId">): PropostaFornecedor | undefined {
  return p.propostas.find((x) => x.id === p.propostaRecomendadaId);
}

export function valorNegociado(p: Pick<ProcessoContratacao, "propostas" | "propostaRecomendadaId">): number | undefined {
  const r = propostaRecomendada(p);
  return r ? r.propostaFinalAnual ?? r.propostaInicialAnual : undefined;
}

// ---------------------------------------------------------------- Requisitos por etapa

export interface Pendencia {
  campo: string;
  mensagem: string;
}

type Docs = Pick<Documento, "categoria">[];

function vazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Para INICIAR o processo (sair do rascunho): origem, empresa, objeto, gestor. */
export function requisitosInicio(p: ProcessoContratacao): Pendencia[] {
  const r: Pendencia[] = [];
  if (vazio(p.origemOportunidade)) r.push({ campo: "origemOportunidade", mensagem: "Origem da oportunidade" });
  if (vazio(p.empresaId)) r.push({ campo: "empresaId", mensagem: "Empresa" });
  if (vazio(p.objeto)) r.push({ campo: "objeto", mensagem: "Objeto" });
  if (vazio(p.gestorId)) r.push({ campo: "gestorId", mensagem: "Gestor" });
  if (p.tipo !== "Nova contratação" && vazio(p.contrato_anterior_id))
    r.push({ campo: "contrato_anterior_id", mensagem: "Contrato anterior" });
  if (p.tipo === "Substituição de fornecedor" && vazio(p.motivoSubstituicao))
    r.push({ campo: "motivoSubstituicao", mensagem: "Motivo da substituição" });
  return r;
}

export function requisitosCotacao(p: ProcessoContratacao): Pendencia[] {
  const r: Pendencia[] = [];
  if (p.tipo === "Nova contratação" && !p.validacao?.validadoEm)
    r.push({ campo: "validacao", mensagem: "Validação de Suprimentos dos dados do JIRA" });
  return r;
}

/** Para APROVAÇÃO: fornecedor recomendado, proposta, valor negociado, justificativa, condições comerciais. */
export function requisitosAprovacao(p: ProcessoContratacao): Pendencia[] {
  const r: Pendencia[] = [];
  if (p.propostas.length === 0) r.push({ campo: "propostas", mensagem: "Ao menos uma proposta" });
  const rec = propostaRecomendada(p);
  if (!rec) r.push({ campo: "propostaRecomendadaId", mensagem: "Fornecedor recomendado" });
  else if (!rec.fornecedorId)
    r.push({ campo: "propostaRecomendadaId", mensagem: "Fornecedor recomendado precisa estar cadastrado" });
  if (vazio(valorNegociado(p))) r.push({ campo: "valorNegociado", mensagem: "Valor negociado" });
  if (vazio(p.justificativa)) r.push({ campo: "justificativa", mensagem: "Justificativa" });
  const c = p.condicoes ?? {};
  if (vazio(c.moeda) || vazio(c.condicaoPagamento) || vazio(c.periodicidadePagamento))
    r.push({ campo: "condicoes", mensagem: "Condições comerciais (moeda, periodicidade e condição de pagamento)" });
  if (c.moeda && c.moeda !== "BRL" && !c.cotacao?.valor)
    r.push({ campo: "condicoes.cotacao", mensagem: "Cotação de câmbio (moeda estrangeira)" });
  return r;
}

/** Para JURÍDICO: aprovação comercial concluída + minuta. */
export function requisitosJuridico(p: ProcessoContratacao, docs: Docs): Pendencia[] {
  const r: Pendencia[] = [];
  if (!aprovacaoComercialConcluida(p))
    r.push({ campo: "aprovacoes", mensagem: "Aprovação comercial concluída (Gestor e Suprimentos)" });
  if (!docs.some((d) => d.categoria === "Minuta" || d.categoria === "Contrato"))
    r.push({ campo: "documentos", mensagem: "Documento/minuta anexado" });
  return r;
}

export function requisitosAssinatura(p: ProcessoContratacao): Pendencia[] {
  return p.juridico.status === "Parecer emitido" || p.juridico.status === "Ressalvas"
    ? []
    : [{ campo: "juridico", mensagem: "Parecer jurídico emitido" }];
}

/** Para CONTRATO VIGENTE: contrato assinado, fornecedor, valor final, data início e fim. */
export function requisitosContratoVigente(p: ProcessoContratacao, docs: Docs): Pendencia[] {
  const r: Pendencia[] = [];
  if (!docs.some((d) => d.categoria === "Contrato assinado"))
    r.push({ campo: "documentos", mensagem: "Contrato assinado anexado" });
  if (!propostaRecomendada(p)?.fornecedorId) r.push({ campo: "fornecedor", mensagem: "Fornecedor" });
  if (vazio(valorNegociado(p))) r.push({ campo: "valorFinal", mensagem: "Valor final" });
  if (vazio(p.vigencia?.dataInicio)) r.push({ campo: "vigencia.dataInicio", mensagem: "Data de início" });
  if (vazio(p.vigencia?.dataFim)) r.push({ campo: "vigencia.dataFim", mensagem: "Data de fim" });
  if (vazio(p.tipoContratoId)) r.push({ campo: "tipoContratoId", mensagem: "Tipo de contrato" });
  if (vazio(p.analistaId)) r.push({ campo: "analistaId", mensagem: "Analista de Suprimentos" });
  return r;
}

/** Pendências para entrar no status de destino. Lista vazia = pode avançar. */
export function requisitosPara(destino: StatusProcesso, p: ProcessoContratacao, docs: Docs): Pendencia[] {
  switch (destino) {
    case "Validação de Suprimentos":
    case "Em negociação":
      return requisitosInicio(p);
    case "Em cotação":
      return [...requisitosInicio(p), ...requisitosCotacao(p)];
    case "Aguardando aprovação comercial":
      return requisitosAprovacao(p);
    case "Em análise jurídica":
      return requisitosJuridico(p, docs);
    case "Aguardando assinatura":
      return requisitosAssinatura(p);
    case "Concluído":
      return requisitosContratoVigente(p, docs);
    default:
      return [];
  }
}
