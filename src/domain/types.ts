/**
 * Modelo de domínio do módulo de Gestão de Contratos.
 *
 * Identificadores com sufixo `_id` / `_key` são reservados para integração futura
 * (JIRA, sistema atual, Adobe) e espelham as colunas previstas no MySQL
 * (ver docs/modelo-dados.sql).
 */

export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // ISO 8601 completo

/** Classificação da origem de cada dado — princípio "se o sistema já sabe, não pergunte". */
export type OrigemDado = "importado" | "validado" | "herdado" | "calculado" | "manual";

/** Mapa campo -> origem do dado. Campos ausentes são considerados "manual". */
export type MapaOrigens = Partial<Record<string, OrigemDado>>;

// ---------------------------------------------------------------- Cadastros

export type Perfil = "Administrador" | "Suprimentos" | "Gestor" | "Juridico";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  cargo?: string;
  /** Diretores dão ciência (ou aprovam em exceção). */
  diretor?: boolean;
  ativo: boolean;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  ativo: boolean;
}

export type StatusCadastralFornecedor = "Ativo" | "Inativo" | "Bloqueado" | "Potencial";

/**
 * Fornecedor: somente dados relevantes ao contrato.
 * A fonte oficial futura é o sistema atual — dados bancários/pagamento NÃO são mantidos aqui.
 */
export interface Fornecedor {
  fornecedor_id: string;
  external_id?: string; // código no sistema atual
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string; // fornecedor potencial pode não ter
  codigoFornecedor?: string;
  cidade?: string;
  uf?: string;
  statusCadastral: StatusCadastralFornecedor;
}

export interface TipoContrato {
  id: string;
  nome: string;
  ativo: boolean;
}

export type Moeda = "BRL" | "USD" | "EUR";

export type FonteCotacao =
  | "PTAX"
  | "Cartão de crédito"
  | "Taxa contratual"
  | "Cotação fornecedor"
  | "Outro";

/** Cotação de câmbio informada manualmente por Suprimentos. */
export interface Cotacao {
  valor: number;
  data: ISODate;
  fonte: FonteCotacao;
  observacao?: string;
}

export type IndiceReajuste = "IPCA" | "IGP-M" | "INPC" | "IPC-Fipe" | "Dissídio" | "Outro";

export type Periodicidade = "Mensal" | "Trimestral" | "Semestral" | "Anual" | "Pagamento único";

// ---------------------------------------------------------------- Blocos contratuais

export interface CondicoesComerciais {
  moeda: Moeda;
  /** Valor anual na moeda do contrato. */
  valorAnual: number;
  quantidade?: number;
  unidade?: string;
  /** Preço unitário anual na moeda do contrato (para decomposição preço x volume). */
  precoUnitario?: number;
  periodicidadePagamento: Periodicidade;
  condicaoPagamento: string;
  /** Obrigatória quando moeda != BRL. */
  cotacao?: Cotacao;
}

export type TipoVigencia = "Prazo determinado" | "Prazo indeterminado";

export interface Vigencia {
  dataInicio: ISODate;
  dataFim: ISODate;
  tipoVigencia: TipoVigencia;
  avisoPrevioDias: number;
  renovacaoAutomatica: boolean;
  /** Prazo do gestor para manifestação. Padrão configurável (30 dias). */
  prazoGestorDias: number;
  periodicidadeRenovacaoMeses?: number;
}

export interface Reajuste {
  possui: boolean;
  indice?: IndiceReajuste;
  dataBase?: ISODate;
  periodicidadeMeses?: number;
  percentualPrevisto?: number; // ex.: 5 = 5%
}

export interface Rescisao {
  permite: boolean;
  possuiMulta: boolean;
  percentual?: number;
  valor?: number;
  regra?: string;
  avisoPrevioDias?: number;
  observacoes?: string;
}

// ---------------------------------------------------------------- Saving

export type OrigemSaving =
  | "Negociação de preço"
  | "Troca de fornecedor"
  | "Reajuste evitado"
  | "Redução de volume"
  | "Otimização de licenças"
  | "Mudança de escopo"
  | "Consolidação"
  | "Alteração do modelo comercial"
  | "Negociação cambial"
  | "Cancelamento de custo"
  | "Outro";

export type OrigemOportunidade =
  | "Suprimentos"
  | "Gestor"
  | "Área solicitante"
  | "Diretoria"
  | "Financeiro"
  | "Outro";

export type TipoBaseline = "Contrato anterior" | "Baseline ajustado" | "Proposta inicial";

export interface ComponenteSaving {
  origem: OrigemSaving;
  /** Valor anual em BRL atribuído a esta origem. */
  valorAnual: number;
  descricao?: string;
}

export interface Saving {
  tipoBaseline: TipoBaseline;
  /** Baseline anual em BRL. */
  baselineAnual: number;
  /** Evidência objetiva — obrigatória para baseline ajustado. */
  evidenciaBaseline?: string;
  /** Valor negociado anual em BRL. */
  valorNegociadoAnual: number;
  componentes: ComponenteSaving[];
  origemOportunidade: OrigemOportunidade;
}

// ---------------------------------------------------------------- JIRA

/** Pré-cadastro recebido do JIRA — NÃO é dado oficial até validação de Suprimentos. */
export interface DemandaJira {
  jira_key: string;
  solicitante: string;
  empresa: string;
  area: string;
  gestor: string;
  descricao: string;
  justificativa: string;
  quantidade?: number;
  valorEstimado?: number;
  fornecedoresIndicados: string[];
  anexos: string[];
  criadoEm: ISODateTime;
}

export interface ValidacaoSuprimentos {
  valorValidado?: number;
  quantidadeValidada?: number;
  validadoPorId?: string;
  validadoEm?: ISODateTime;
  observacao?: string;
}

// ---------------------------------------------------------------- Processo

export type TipoProcesso =
  | "Nova contratação"
  | "Renovação"
  | "Substituição de fornecedor"
  | "Renegociação"
  | "Aditivo";

export type StatusProcesso =
  | "Rascunho"
  | "Validação de Suprimentos"
  | "Em cotação"
  | "Em negociação"
  | "Aguardando aprovação comercial"
  | "Em análise jurídica"
  | "Aguardando assinatura"
  | "Concluído"
  | "Suspenso"
  | "Cancelado";

export interface PropostaFornecedor {
  id: string;
  /** Fornecedor cadastrado OU nome de fornecedor potencial (ainda não cadastrado). */
  fornecedorId?: string;
  fornecedorPotencial?: string;
  moeda: Moeda;
  propostaInicialAnual: number;
  propostaFinalAnual?: number;
  observacao?: string;
}

export type PapelAprovacao = "Gestor" | "Suprimentos" | "Diretor";
export type TipoAprovacao = "Aprovação" | "Ciência";
export type StatusAprovacao = "Pendente" | "Aprovado" | "Reprovado" | "Ciente";

export interface Aprovacao {
  papel: PapelAprovacao;
  tipo: TipoAprovacao;
  status: StatusAprovacao;
  usuarioId: string;
  data?: ISODateTime;
  comentario?: string;
}

export type StatusJuridico = "Não iniciado" | "Em análise" | "Parecer emitido" | "Ressalvas";
export type StatusAssinatura = "Não iniciada" | "Enviado para assinatura" | "Assinado";

export interface EventoTimeline {
  id: string;
  data: ISODateTime;
  usuarioId: string;
  descricao: string;
  tipo: "status" | "aprovacao" | "documento" | "edicao" | "sistema";
}

export interface ProcessoContratacao {
  processo_id: string;
  codigo: string; // PC-AAAA-NNNN
  tipo: TipoProcesso;
  status: StatusProcesso;
  /** Status anterior a uma suspensão, para retomada. */
  statusAntesSuspensao?: StatusProcesso;

  jira_key?: string;
  demandaJira?: DemandaJira;
  validacao?: ValidacaoSuprimentos;

  contrato_anterior_id?: string;
  contrato_gerado_id?: string;
  external_id?: string;

  empresaId?: string;
  objeto?: string;
  gestorId?: string;
  diretorId?: string;
  analistaId?: string;
  centroCusto?: string;
  projeto?: string;
  tipoContratoId?: string;
  origemOportunidade?: OrigemOportunidade;

  /** Substituição de fornecedor. */
  motivoSubstituicao?: string;

  propostas: PropostaFornecedor[];
  propostaRecomendadaId?: string;
  estrategiaSuprimentos?: string;
  justificativa?: string;
  /** Diretor aprova (e não só dá ciência) quando o processo é exceção. */
  excecao?: boolean;

  condicoes?: Partial<CondicoesComerciais>;
  vigencia?: Partial<Vigencia>;
  reajuste?: Reajuste;
  rescisao?: Rescisao;
  saving?: Saving;

  aprovacoes: Aprovacao[];
  juridico: { status: StatusJuridico; responsavelId?: string; parecer?: string };
  assinatura: { status: StatusAssinatura; data?: ISODate; envelope_id?: string };

  timeline: EventoTimeline[];
  origens: MapaOrigens;
  criadoEm: ISODateTime;
  atualizadoEm: ISODateTime;
  criadoPorId: string;
}

// ---------------------------------------------------------------- Contrato

export type StatusContrato = "Vigente" | "Suspenso" | "Encerrado" | "Rescindido";

export type RespostaSimNao = "Sim" | "Não";

export interface AvaliacaoRenovacao {
  desejaRenovar?: RespostaSimNao;
  desejaSubstituir?: RespostaSimNao;
  desejaEncerrar?: RespostaSimNao;
  servicoNecessario?: RespostaSimNao;
  quantidadePermanece?: RespostaSimNao;
  escopoPermanece?: RespostaSimNao;
  problemaFornecedor?: RespostaSimNao;
  avaliarConcorrentes?: RespostaSimNao;
  observacoes?: string;
  respondidoPorId?: string;
  respondidoEm?: ISODateTime;
}

/** Espaço reservado para integração com o sistema atual (pedido/saldo). */
export interface ExecucaoFinanceira {
  pedido_id?: string;
  valorContratado?: number;
  valorConsumido?: number;
  atualizadoEm?: ISODateTime;
  /** true enquanto não houver integração real. */
  simulado: boolean;
}

export interface Contrato {
  contrato_id: string;
  codigo: string; // CT-AAAA-NNNN
  processo_id?: string;
  contrato_anterior_id?: string;
  /** Preenchido quando outro contrato renova/substitui este. Nunca sobrescreve o anterior. */
  sucessor_id?: string;
  relacaoAnterior?: "Renovação" | "Substituição";
  pedido_id?: string;
  external_id?: string;
  jira_key?: string;

  empresaId: string;
  fornecedorId: string;
  objeto: string;
  tipoContratoId: string;
  gestorId: string;
  diretorId?: string;
  analistaId: string;
  centroCusto?: string;
  projeto?: string;

  status: StatusContrato;
  condicoes: CondicoesComerciais;
  vigencia: Vigencia;
  reajuste: Reajuste;
  rescisao: Rescisao;
  saving?: Saving;
  motivoSubstituicao?: string;
  /** Dados do contrato anterior registrados na substituição. */
  substituicao?: { fornecedorAnteriorId: string; valorAnteriorAnual: number; origemOportunidade: OrigemOportunidade };
  execucaoFinanceira: ExecucaoFinanceira;
  avaliacaoRenovacao?: AvaliacaoRenovacao;

  origens: MapaOrigens;
  criadoEm: ISODateTime;
  atualizadoEm: ISODateTime;
}

// ---------------------------------------------------------------- Documentos

export type CategoriaDocumento =
  | "Proposta"
  | "Minuta"
  | "Contrato"
  | "Aditivo"
  | "Parecer"
  | "Contrato assinado"
  | "Anexo";

export interface Documento {
  id: string;
  contrato_id?: string;
  processo_id?: string;
  nome: string;
  categoria: CategoriaDocumento;
  versao: number;
  data: ISODateTime;
  usuarioId: string;
  tamanhoKb?: number;
  /** Ex.: ID do documento no Adobe Sign — integração futura. */
  external_id?: string;
}

// ---------------------------------------------------------------- Alertas / ações / auditoria

export type TipoAlerta =
  | "Abertura da avaliação"
  | "60 dias para data limite"
  | "30 dias para data limite"
  | "Renovação automática em risco";

export type CategoriaAlerta = "Decisão do gestor" | "Contratual crítico";
export type StatusAlerta = "Programado" | "Enviado" | "Interrompido";

export interface Alerta {
  id: string;
  contrato_id: string;
  tipo: TipoAlerta;
  categoria: CategoriaAlerta;
  dataPrevista: ISODate;
  status: StatusAlerta;
  destinatarios: string[]; // usuarioIds
  motivoInterrupcao?: string;
}

export type Prioridade = "Normal" | "Atenção" | "Ação necessária" | "Crítico";

export interface AcaoNecessaria {
  id: string;
  prioridade: Prioridade;
  referencia: { tipo: "contrato" | "processo"; id: string; codigo: string };
  acao: string;
  responsavelId?: string;
  prazo?: ISODate;
  link: string;
}

export interface RegistroAuditoria {
  id: string;
  entidade: "contrato" | "processo" | "documento" | "configuracao";
  entidadeId: string;
  usuarioId: string;
  data: ISODateTime;
  acao: string;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
}

// ---------------------------------------------------------------- Configuração

export interface RegrasAlerta {
  /** Prazo padrão do gestor para manifestação (dias). */
  prazoGestorPadraoDias: number;
  /** Lembretes antes da data limite (dias). */
  lembretesDias: number[];
  /** Antecedência da data limite a partir da qual a renovação automática é considerada em risco. */
  diasRiscoRenovacaoAutomatica: number;
  canalEmail: boolean;
  canalSistema: boolean;
}

export interface Configuracao {
  regrasAlerta: RegrasAlerta;
  moedas: Moeda[];
  periodicidades: Periodicidade[];
  fontesCotacao: FonteCotacao[];
  indicesReajuste: IndiceReajuste[];
  origensSaving: OrigemSaving[];
  origensOportunidade: OrigemOportunidade[];
  listasAuxiliares: Record<string, string[]>;
}
