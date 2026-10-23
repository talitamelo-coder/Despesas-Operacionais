import type {
  Aprovacao,
  Configuracao,
  FluxoProcessoConfig,
  Documento,
  ProcessoContratacao,
  PropostaFornecedor,
  StatusProcesso,
  TipoAditivo,
  TipoProcesso,
} from "../types";

/**
 * Fluxo do processo de contratação e campos obrigatórios POR ETAPA.
 * Regra geral: não obrigar dezenas de campos na criação — cada etapa exige só o necessário.
 */

/** Etapas do fluxo na ordem. Aprovação comercial e análise jurídica são opcionais (Administração). */
const ORDEM_ETAPAS: StatusProcesso[] = [
  "Rascunho",
  "Com Suprimentos",
  "Aguardando aprovação comercial",
  "Em análise jurídica",
  "Aguardando assinatura",
  "Concluído",
];

/** Tipos oferecidos. Renegociação entra como Aditivo (tipo de aditivo "Renegociação"): altera o próprio contrato. */
export const TIPOS_PROCESSO: TipoProcesso[] = ["Nova contratação", "Renovação", "Substituição de fornecedor", "Aditivo"];

export const TIPOS_ADITIVO: TipoAditivo[] = ["Valor", "Prazo", "Valor e prazo", "Escopo", "Renegociação"];

/**
 * Etapas opcionais ligadas em Administração. Padrão: desligadas — a aprovação é feita no JIRA
 * e o jurídico não participa por enquanto.
 */
export function opcoesFluxo(cfg?: Pick<Configuracao, "fluxoProcesso">): FluxoProcessoConfig {
  return { exigirAprovacao: Boolean(cfg?.fluxoProcesso?.exigirAprovacao), exigirJuridico: Boolean(cfg?.fluxoProcesso?.exigirJuridico) };
}

function etapaLigada(s: StatusProcesso, op: FluxoProcessoConfig): boolean {
  if (s === "Aguardando aprovação comercial") return op.exigirAprovacao;
  if (s === "Em análise jurídica") return op.exigirJuridico;
  return true;
}

export const STATUS_ENCERRADOS: StatusProcesso[] = ["Concluído", "Cancelado"];

export function processoAtivo(p: Pick<ProcessoContratacao, "status">): boolean {
  return !STATUS_ENCERRADOS.includes(p.status);
}

/** Mesmo fluxo para todos os tipos: Rascunho → Com Suprimentos → [aprovação] → [jurídico] → assinatura → concluído. */
export function etapasDoProcesso(_p: Pick<ProcessoContratacao, "tipo">, op: FluxoProcessoConfig = opcoesFluxo()): StatusProcesso[] {
  return ORDEM_ETAPAS.filter((s) => etapaLigada(s, op));
}

/** Próxima etapa ligada. Processo parado numa etapa desligada depois segue para a seguinte. */
export function proximoStatus(p: Pick<ProcessoContratacao, "tipo" | "status">, op: FluxoProcessoConfig = opcoesFluxo()): StatusProcesso | undefined {
  const i = ORDEM_ETAPAS.indexOf(p.status);
  if (i < 0) return undefined;
  return ORDEM_ETAPAS.slice(i + 1).find((s) => etapaLigada(s, op));
}

export function indiceEtapa(p: Pick<ProcessoContratacao, "tipo" | "status" | "statusAntesSuspensao">, op: FluxoProcessoConfig = opcoesFluxo()): number {
  const status = p.status === "Suspenso" ? p.statusAntesSuspensao ?? "Rascunho" : p.status;
  const i = ORDEM_ETAPAS.indexOf(status);
  // Etapa desligada: mostra a última etapa ligada anterior.
  return i < 0 ? -1 : ORDEM_ETAPAS.slice(0, i + 1).filter((s) => etapaLigada(s, op)).length - 1;
}

/**
 * Processo de renegociação em andamento vira Aditivo (tipo "Renegociação"): ao concluir, altera o próprio
 * contrato. Processos encerrados mantêm o tipo original (histórico).
 */
export function migrarTipo(p: Pick<ProcessoContratacao, "tipo" | "status" | "tipoAditivo">): { tipo: TipoProcesso; tipoAditivo?: TipoAditivo; descricao: string } | undefined {
  if (p.tipo !== "Renegociação" || !processoAtivo(p)) return undefined;
  return { tipo: "Aditivo", tipoAditivo: p.tipoAditivo ?? "Renegociação", descricao: "Renegociação passou a ser tratada como Aditivo (tipo Renegociação): ao concluir, altera o próprio contrato" };
}

/** Status antigos (fluxo anterior) → etapa atual. */
const STATUS_LEGADOS: Record<string, StatusProcesso> = {
  "Validação de Suprimentos": "Com Suprimentos",
  "Em cotação": "Com Suprimentos",
  "Em negociação": "Com Suprimentos",
};

/**
 * Leva o processo para o fluxo vigente: status antigos viram "Com Suprimentos"; processo parado em
 * etapa desligada segue para a próxima etapa ligada. Devolve a descrição para a linha do tempo, ou undefined.
 */
export function migrarEtapa(p: Pick<ProcessoContratacao, "tipo" | "status" | "statusAntesSuspensao">, op: FluxoProcessoConfig): { status: StatusProcesso; statusAntesSuspensao?: StatusProcesso; descricao: string } | undefined {
  const ajustar = (s: string): StatusProcesso => {
    const legado = STATUS_LEGADOS[s];
    if (legado) return legado;
    const st = s as StatusProcesso;
    return ORDEM_ETAPAS.includes(st) && !etapaLigada(st, op) ? proximoStatus({ tipo: p.tipo, status: st }, op)! : st;
  };
  const status = ajustar(p.status);
  const antes = p.statusAntesSuspensao && ajustar(p.statusAntesSuspensao);
  if (status === p.status && antes === p.statusAntesSuspensao) return undefined;
  const de = p.status === "Suspenso" ? p.statusAntesSuspensao! : p.status;
  const para = p.status === "Suspenso" ? antes! : status;
  return {
    status,
    statusAntesSuspensao: antes,
    descricao: STATUS_LEGADOS[de] ? `Fluxo simplificado: etapa ${de} passou a ${para}` : `Etapa ${de} desligada na configuração: processo segue em ${para}`,
  };
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

/** Para INICIAR o processo (sair do rascunho): origem, empresa, objeto. Gestor é opcional (vira pendência no contrato). */
export function requisitosInicio(p: ProcessoContratacao): Pendencia[] {
  const r: Pendencia[] = [];
  if (vazio(p.origemOportunidade)) r.push({ campo: "origemOportunidade", mensagem: "Origem da oportunidade" });
  if (vazio(p.empresaId)) r.push({ campo: "empresaId", mensagem: "Empresa" });
  if (vazio(p.objeto)) r.push({ campo: "objeto", mensagem: "Objeto" });
  if (p.tipo !== "Nova contratação" && vazio(p.contrato_anterior_id))
    r.push({ campo: "contrato_anterior_id", mensagem: "Contrato anterior" });
  if (p.tipo === "Substituição de fornecedor" && vazio(p.motivoSubstituicao))
    r.push({ campo: "motivoSubstituicao", mensagem: "Motivo da substituição" });
  return r;
}

/** Para SAIR de Suprimentos: fornecedor recomendado, proposta, valor negociado, justificativa, condições comerciais. */
export function requisitosNegociacao(p: ProcessoContratacao): Pendencia[] {
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

function pendenciaAprovacao(p: ProcessoContratacao): Pendencia[] {
  return aprovacaoComercialConcluida(p) ? [] : [{ campo: "aprovacoes", mensagem: "Aprovação comercial concluída (Gestor e Suprimentos)" }];
}

/** Para JURÍDICO: etapa anterior cumprida + minuta. */
export function requisitosJuridico(p: ProcessoContratacao, docs: Docs, op: FluxoProcessoConfig = opcoesFluxo()): Pendencia[] {
  const r = op.exigirAprovacao ? pendenciaAprovacao(p) : requisitosNegociacao(p);
  if (!docs.some((d) => d.categoria === "Minuta" || d.categoria === "Contrato"))
    r.push({ campo: "documentos", mensagem: "Documento/minuta anexado" });
  return r;
}

/** Para ASSINATURA: parecer (jurídico ligado), aprovação (aprovação ligada) ou a negociação concluída. */
export function requisitosAssinatura(p: ProcessoContratacao, op: FluxoProcessoConfig = opcoesFluxo()): Pendencia[] {
  if (op.exigirJuridico)
    return p.juridico.status === "Parecer emitido" || p.juridico.status === "Ressalvas" ? [] : [{ campo: "juridico", mensagem: "Parecer jurídico emitido" }];
  return op.exigirAprovacao ? pendenciaAprovacao(p) : requisitosNegociacao(p);
}

/** Para CONTRATO VIGENTE: contrato assinado, fornecedor, valor final, data início e fim. */
export function requisitosContratoVigente(p: ProcessoContratacao, docs: Docs): Pendencia[] {
  const r: Pendencia[] = [];
  if (!docs.some((d) => d.categoria === "Contrato assinado"))
    r.push({ campo: "documentos", mensagem: "Contrato assinado anexado" });
  if (!propostaRecomendada(p)?.fornecedorId) r.push({ campo: "fornecedor", mensagem: "Fornecedor" });
  if (vazio(valorNegociado(p))) r.push({ campo: "valorFinal", mensagem: "Valor final" });
  if (vazio(p.vigencia?.dataInicio)) r.push({ campo: "vigencia.dataInicio", mensagem: "Data de início" });
  if (p.vigencia?.tipoVigencia !== "Prazo indeterminado" && vazio(p.vigencia?.dataFim)) r.push({ campo: "vigencia.dataFim", mensagem: "Data de fim (ou prazo indeterminado)" });
  if (vazio(p.tipoContratoId)) r.push({ campo: "tipoContratoId", mensagem: "Tipo de contrato" });
  if (vazio(p.analistaId)) r.push({ campo: "analistaId", mensagem: "Analista de Suprimentos" });
  return r;
}

/** Pendências para entrar no status de destino. Lista vazia = pode avançar. */
export function requisitosPara(destino: StatusProcesso, p: ProcessoContratacao, docs: Docs, op: FluxoProcessoConfig = opcoesFluxo()): Pendencia[] {
  switch (destino) {
    case "Com Suprimentos":
      return requisitosInicio(p);
    case "Aguardando aprovação comercial":
      return requisitosNegociacao(p);
    case "Em análise jurídica":
      return requisitosJuridico(p, docs, op);
    case "Aguardando assinatura":
      return requisitosAssinatura(p, op);
    case "Concluído":
      return requisitosContratoVigente(p, docs);
    default:
      return [];
  }
}
