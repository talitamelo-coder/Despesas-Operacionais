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

export type Perfil = "Administrador" | "Suprimentos" | "Gestor" | "Juridico" | "Solicitante" | "Leitura";

export interface Usuario {
  id: string;
  /** Nome completo: usado em relatórios e extrações da base. */
  nome: string;
  /** Nome e sobrenome: usado nas telas. Vazio = sugerido a partir do nome completo. */
  nomeExibicao?: string;
  email: string;
  /** Perfil principal. */
  perfil: Perfil;
  /** Outros perfis da mesma pessoa (ex.: Gestor e Solicitante). Permissões = soma de todos. */
  perfisAdicionais?: Perfil[];
  cargo?: string;
  /** Diretores dão ciência (ou aprovam em exceção). */
  diretor?: boolean;
  area?: string;
  /** Empresas (filiais) que o usuário pode acessar. Vazio = todas. */
  empresasIds?: string[];
  /** Só o hash da senha é guardado (PBKDF2-SHA256 com salt). Nunca sai da camada de dados. */
  credencial?: Credencial;
  /** Indicador público de que há senha definida (a credencial em si não é exposta). */
  temSenha?: boolean;
  ativo: boolean;
}

export interface Credencial {
  algoritmo: "PBKDF2-SHA256";
  iteracoes: number;
  salt: string; // base64
  hash: string; // base64
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
export type RegimeTributario = "Não informado" | "Simples Nacional" | "MEI" | "Lucro Presumido" | "Lucro Real" | "Outro";
export type TipoConta = "Corrente" | "Poupança" | "Pagamento";
export type TipoChavePix = "CNPJ" | "CPF" | "E-mail" | "Telefone" | "Chave aleatória";

/**
 * Dados bancários e PIX: DADO SENSÍVEL. Informativos neste módulo — a fonte oficial para
 * pagamento continua sendo o sistema atual. Exibidos mascarados e auditados mascarados.
 */
export interface DadosBancarios {
  codigoBanco?: string;
  nomeBanco?: string;
  agencia?: string;
  digitoAgencia?: string;
  conta?: string;
  digitoConta?: string;
  tipoConta?: TipoConta;
}

export interface Pix {
  tipo: TipoChavePix;
  chave?: string;
}

/** Cliente: cadastro separado do de fornecedores. Contratos de receita referenciam o cliente. */
export interface Cliente {
  cliente_id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string;
  /** No exterior: dispensa CNPJ; país obrigatório. */
  estrangeiro?: boolean;
  pais?: string;
  identificacaoFiscalExterior?: string;
  /** Código do cliente no módulo de Contas a receber (integração). */
  codigoCliente?: string;
  email?: string;
  telefone?: string;
  contato?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  statusCadastral: "Ativo" | "Inativo";
}

export interface Fornecedor {
  fornecedor_id: string;
  external_id?: string; // código no sistema atual
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string; // fornecedor potencial ou estrangeiro pode não ter
  /** Fornecedor no exterior: dispensa CNPJ (e UF/CEP brasileiros). */
  estrangeiro?: boolean;
  /** Exterior: país (obrigatório) e identificação fiscal local, opcional (Tax ID, VAT, EIN…). */
  pais?: string;
  identificacaoFiscalExterior?: string;
  codigoFornecedor?: string;
  inscricaoEstadual?: string;
  email?: string;
  telefone?: string;
  regimeTributario?: RegimeTributario;
  endereco?: string; // rua, número, complemento
  cidade?: string;
  uf?: string;
  cep?: string;
  dadosBancarios?: DadosBancarios;
  pix?: Pix;
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
  /** Vazio ("") quando ainda não informado (ex.: contrato importado sem data). */
  dataInicio: ISODate;
  dataFim: ISODate;
  tipoVigencia: TipoVigencia;
  avisoPrevioDias: number;
  renovacaoAutomatica: boolean;
  /** Prazo do gestor para manifestação. Padrão configurável (30 dias). */
  prazoGestorDias: number;
  periodicidadeRenovacaoMeses?: number;
  /** Prazo indeterminado: data-base da revisão anual (padrão: data de início). */
  dataBaseRevisao?: ISODate;
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
  /** Descrição livre da multa (há muitos tipos: percentual sobre saldo, meses de mensalidade, valor fixo, proporcional…). */
  descricaoMulta?: string;
  /** Legado: contratos antigos/importados. Novos registros usam descricaoMulta. */
  percentual?: number;
  /** Legado: contratos antigos/importados. Novos registros usam descricaoMulta. */
  valor?: number;
  /** Condições de rescisão em texto livre (quem pode rescindir, em que hipóteses, como comunicar). */
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

/** Cancelado = não será renovado nem substituído (decisão da avaliação ou de Suprimentos). */
export type StatusContrato = "Vigente" | "Suspenso" | "Encerrado" | "Rescindido" | "Cancelado";

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
  /** Prazo indeterminado: data da revisão anual a que esta resposta se refere. */
  cicloRevisao?: ISODate;
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
  /** Despesa (padrão): contrato com fornecedor. Receita: contrato com cliente. */
  natureza?: NaturezaContrato;
  /** Vazio em contratos de receita. */
  fornecedorId: string;
  /** Contratos de receita. */
  clienteId?: string;
  /** Contratos de receita: valores contratados (só mudam por aditivo). */
  receita?: ValoresReceita;
  /** Substituição de vários contratos por um (N → 1). */
  contratosAnterioresIds?: string[];
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
  /** Respostas de ciclos anteriores (revisões anuais). Nunca apagadas. */
  avaliacoesAnteriores?: AvaliacaoRenovacao[];
  /** Texto livre: histórico, condições copiadas da planilha legada, anotações. */
  observacoes?: string;
  /**
   * Pontos a confirmar vindos da importação (ex.: "Confirmar status"). Somem quando alguém
   * revisa o contrato. Os dados faltantes em si são calculados em rules/cadastro.ts.
   */
  confirmacoesPendentes?: string[];

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
  entidade: "contrato" | "processo" | "documento" | "configuracao" | "licenca" | "colaborador" | "telefonia";
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

// ---------------------------------------------------------------- Contratos de receita (clientes)

export type NaturezaContrato = "Despesa" | "Receita";
export type TipoReceita = "Fixa" | "Variável" | "Fixa + variável";

/** Mudança de valor JÁ PREVISTA no contrato (ex.: "a partir de 11/2026, R$ X/mês"). */
export interface EscalonamentoReceita {
  aPartirDe: ISODate;
  valorMensalFixo: number;
}

export interface ValoresReceita {
  tipoReceita: TipoReceita;
  /** Parte fixa mensal (Fixa e Fixa + variável). */
  valorMensalFixo?: number;
  /** Parte variável: estimativa mensal (a medição é feita pelo Contas a receber). */
  valorMensalVariavelEstimado?: number;
  /** Valor global do contrato, quando houver. Sem ele, o saldo vem do fixo × meses da vigência. */
  valorTotalContratado?: number;
  escalonamento?: EscalonamentoReceita[];
  /** Receita apurada em outro contrato (contrato principal / guarda-chuva). */
  contratoPrincipalId?: string;
}

/**
 * Aditivo registrado no contrato: a única forma de mudar valor ou prazo depois da contratação.
 * Guarda antes/depois; nada é sobrescrito sem histórico.
 */
export type TipoAditivo = "Valor" | "Prazo" | "Valor e prazo" | "Escopo" | "Renegociação";

export interface AditivoContrato {
  id: string;
  contrato_id: string;
  numero: string;
  data: ISODate;
  tipo: TipoAditivo;
  descricao: string;
  /** Acréscimo (positivo) ou redução (negativo) do valor total contratado / saldo. */
  variacaoValorTotal?: number;
  /** Receita: novo valor mensal fixo a partir de `aPartirDe`. Despesa: novo valor anual. */
  novoValorMensalFixo?: number;
  novoValorAnual?: number;
  aPartirDe?: ISODate;
  novaDataFim?: ISODate;
  antes: string;
  depois: string;
  registradoPorId: string;
  registradoEm: ISODateTime;
}

/** Nota/emissão de faturamento: vem do módulo de Contas a receber (integração). Consome o saldo a faturar. */
export interface EmissaoFaturamento {
  id: string;
  contrato_id: string;
  numeroDocumento: string;
  data: ISODate;
  valor: number;
  status: "Emitida" | "Cancelada";
  origem: "Contas a receber" | "Integração simulada";
  registradoEm: ISODateTime;
}

// ---------------------------------------------------------------- Saldo do contrato

/**
 * Pedidos consomem o saldo do contrato. Hoje registrados aqui (simulação); com a integração,
 * chegam do módulo de pedidos e Contas a pagar pela mesma operação da API.
 */
export type StatusPedido = "Aprovado" | "Pago" | "Cancelado";

export interface PedidoContrato {
  id: string;
  contrato_id: string;
  numero: string;
  data: ISODate;
  /** Na moeda do contrato. */
  valor: number;
  descricao?: string;
  status: StatusPedido;
  origem: "Registro manual" | "Módulo de pedidos";
  registradoPorId: string;
  registradoEm: ISODateTime;
}

/** Saldo adicionado ao contrato (ex.: aditivo de valor). Soma ao contratado; nunca sobrescreve. */
export interface AporteSaldo {
  id: string;
  contrato_id: string;
  data: ISODate;
  valor: number;
  motivo: string;
  referencia?: string;
  registradoPorId: string;
  registradoEm: ISODateTime;
}

// ---------------------------------------------------------------- Colaboradores (quem usa)

/**
 * Quem usa licenças e linhas. Diferente de Usuario (quem acessa este sistema). Dado pessoal (LGPD):
 * só e-mail, nome, área, centro de custo e situação. Identidade = e-mail corporativo em minúsculas.
 */
export type TipoContaColaborador = "Pessoa" | "Compartilhada";
export type StatusColaborador = "Ativo" | "Desligado";

export interface Colaborador {
  id: string;
  email: string;
  nome: string;
  area?: string;
  centroCusto?: string;
  status: StatusColaborador;
  tipoConta: TipoContaColaborador;
  /** Conta compartilhada: pessoa responsável. */
  responsavelId?: string;
  dataDesligamento?: ISODate;
}

// ---------------------------------------------------------------- Licenças de software

/**
 * O contrato registra o que foi contratado; a licença detalha assentos, preço e quem usa.
 * A licença só referencia o contrato (FK) — nunca o altera. O real pago fica em Pedidos/Contas a pagar.
 */
export type MoedaLicenca = "BRL" | "USD";
export type TipoCobranca = "Assento" | "Fixo" | "Consumo";
export type PeriodicidadeLicenca = "Mensal" | "Anual";
export type VencimentoTipo = "Data" | "Mensal" | "Sob demanda";
export type StatusLicenca = "Ativa" | "Cancelada";

export interface Licenca {
  id: string;
  fornecedorId: string;
  contrato_id?: string;
  produto: string;
  plano?: string;
  categoria?: string;
  utilizacao?: string;
  tipoCobranca: TipoCobranca;
  moeda: MoedaLicenca;
  periodicidade: PeriodicidadeLicenca;
  vencimentoTipo: VencimentoTipo;
  dataVencimento?: ISODate;
  /** Área dona da licença (custo sem usuário e visão do gestor). */
  area?: string;
  centroCusto?: string;
  responsavel?: string;
  justificativaManutencao?: string;
  substitutoPossivel?: string;
  riscoTroca?: string;
  /** Consumo: teto mensal na moeda da licença. Sem limite = alerta FinOps. */
  limiteConsumoMensal?: number;
  status: StatusLicenca;
  chaveImportacao?: string;
  criadoEm: ISODateTime;
  atualizadoEm: ISODateTime;
}

/**
 * Movimentações formam o histórico do contratado: os assentos e o custo atuais são SEMPRE calculados
 * a partir delas. Compra soma assentos (com o preço daquela compra); redução tira dos lotes mais
 * recentes; renegociação muda o preço de todos os assentos; cancelamento zera.
 */
export type TipoMovimentacao = "Compra" | "Redução" | "Renegociação" | "Cancelamento";

export interface MovimentacaoLicenca {
  id: string;
  licencaId: string;
  tipo: TipoMovimentacao;
  data: ISODate;
  /** Compra/Redução: assentos (positivo). Fixo/Consumo usam 1. */
  quantidade?: number;
  /** Compra: preço unitário por período. Renegociação: novo preço unitário. */
  precoUnitario?: number;
  responsavel: string;
  referenciaPedido?: string;
  observacao?: string;
  /** Calculados ao registrar (registro de economia/aumento), na moeda da licença. */
  valorAnualAntes: number;
  valorAnualDepois: number;
  registradoPorId: string;
  registradoEm: ISODateTime;
  chaveImportacao?: string;
}

export type StatusAtribuicao = "Ativa" | "Encerrada";

/**
 * Usuário de licença que não pôde ser atribuído na importação (sem e-mail ou sem assento livre).
 * Fica na fila até ser resolvido (vira atribuição) ou descartado. Nunca é apagado.
 */
export interface PendenciaAtribuicao {
  id: string;
  licencaId: string;
  email?: string;
  nome: string;
  area?: string;
  centroCusto?: string;
  motivo: "Sem e-mail" | "Sem assento livre";
  status: "Aberta" | "Resolvida" | "Descartada";
  dataInicio?: ISODate;
  /** Chave de idempotência da importação (licença + e-mail ou nome). */
  chave: string;
  criadoEm: string;
  resolvidoEm?: string;
  resolvidoPorId?: string;
  atribuicaoId?: string;
  observacao?: string;
}

export interface AtribuicaoLicenca {
  id: string;
  licencaId: string;
  colaboradorId: string;
  status: StatusAtribuicao;
  dataInicio: ISODate;
  dataFim?: ISODate;
}

/** PTAX de venda do dia (carga diária do Banco Central no backend). Tabela única de câmbio. */
export interface CotacaoDia {
  data: ISODate;
  ptaxVenda: number;
}

export type ChaveParametro = "spread_cambial" | "aliquota_iof_usd" | "fator_impostos_simulado" | "exibir_cenario_impostos" | "dominios_grupo";

/** Parâmetros com histórico: vale o último com vigenteDesde <= data. Nada fixo no código. */
export interface Parametro {
  chave: ChaveParametro;
  valor: string;
  vigenteDesde: ISODate;
  atualizadoPorId: string;
  atualizadoEm: ISODateTime;
}

export interface OrcamentoFornecedor {
  id: string;
  fornecedorId: string;
  ano: number;
  valorBRL: number;
}

// ---------------------------------------------------------------- Telefonia (separada de licenças)

export type SituacaoLinha = "Ativa" | "Suspensa" | "Cancelada" | "Portada";

export interface LinhaTelefonica {
  id: string;
  /** Somente dígitos, com DDD. Único. */
  numero: string;
  operadora: string;
  fornecedorId?: string;
  contrato_id?: string;
  plano?: string;
  franquia?: string;
  /** Valor mensal contratado (BRL). Sem câmbio e sem IOF. */
  valorMensal: number;
  situacao: SituacaoLinha;
  area?: string;
  centroCusto?: string;
  observacao?: string;
  chaveImportacao?: string;
  criadoEm: ISODateTime;
  atualizadoEm: ISODateTime;
}

export interface UsoLinha {
  id: string;
  linhaId: string;
  colaboradorId: string;
  status: StatusAtribuicao;
  dataInicio: ISODate;
  dataFim?: ISODate;
}
