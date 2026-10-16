import type { AbaCentral } from "@/domain/rules/central";
import type { Pendencia } from "@/domain/rules/fluxo";
import type { Indicadores } from "@/domain/rules/indicadores";
import type { RegistroImportado } from "@/domain/rules/importacao";
import type { LinhaPrevia, TipoImportacao } from "@/domain/rules/importacaoCsv";
import type { SaldoContrato } from "@/domain/rules/saldo";
import type {
  AporteSaldo,
  PedidoContrato,
  StatusPedido,
  AtribuicaoLicenca,
  ChaveParametro,
  Colaborador,
  CotacaoDia,
  Licenca,
  LinhaTelefonica,
  MovimentacaoLicenca,
  OrcamentoFornecedor,
  Parametro,
  UsoLinha,
  AcaoNecessaria,
  Alerta,
  AvaliacaoRenovacao,
  CategoriaDocumento,
  Configuracao,
  Contrato,
  DemandaJira,
  Documento,
  Empresa,
  Fornecedor,
  ISODate,
  Moeda,
  PapelAprovacao,
  Prioridade,
  ProcessoContratacao,
  RegistroAuditoria,
  StatusAprovacao,
  StatusContrato,
  StatusJuridico,
  TipoContrato,
  TipoProcesso,
  Usuario,
  ValidacaoSuprimentos,
} from "@/domain/types";

/**
 * CONTRATO DA CAMADA DE DADOS.
 *
 * A interface é o ponto de troca entre o mock atual (em memória) e a API REST futura
 * (Frontend -> API -> Backend Python -> MySQL). A UI depende só desta interface —
 * nunca do banco temporário. Ver docs/api-contrato.md para os endpoints equivalentes.
 */

// ---------------------------------------------------------------- Central

export interface FiltrosCentral {
  aba: AbaCentral;
  busca?: string;
  empresaId?: string;
  fornecedorId?: string;
  gestorId?: string;
  analistaId?: string;
  status?: string;
  tipoContratoId?: string;
  tipoProcesso?: TipoProcesso;
  vencimento?: "30" | "60" | "90" | "180" | "vencidos";
  renovacaoAutomatica?: "sim" | "nao";
  moeda?: Moeda;
  projeto?: string;
  /** "incompleto": só contratos com dados a completar (ex.: importados de planilha). */
  cadastro?: "incompleto";
}

export type ColunaOrdenavel = "codigo" | "fornecedor" | "empresa" | "objeto" | "gestor" | "analista" | "valorAnual" | "dataFim" | "status" | "prioridade";

export interface Ordenacao {
  coluna: ColunaOrdenavel;
  direcao: "asc" | "desc";
}

export interface LinhaCentral {
  id: string;
  tipo: "contrato" | "processo";
  codigo: string;
  link: string;
  fornecedor: string;
  cnpj?: string;
  empresa: string;
  objeto: string;
  gestor: string;
  analista: string;
  valorAnualBRL?: number;
  moeda: Moeda;
  dataFim?: ISODate;
  diasAteVencimento?: number;
  status: string;
  situacao?: string;
  proximaAcao: string;
  prioridade: Prioridade;
  renovacaoAutomaticaEmRisco: boolean;
  jira_key?: string;
  projeto?: string;
  /** Itens a completar no cadastro (ver domain/rules/cadastro.ts). */
  pendenciasCadastro: string[];
}

export interface ResultadoCentral {
  linhas: LinhaCentral[];
  total: number;
  contagemPorAba: Record<AbaCentral, number>;
}

// ---------------------------------------------------------------- Comandos

export interface NovoDocumento {
  contrato_id?: string;
  processo_id?: string;
  nome: string;
  categoria: CategoriaDocumento;
  tamanhoKb?: number;
}

export interface ResultadoAvanco {
  ok: boolean;
  pendencias: Pendencia[];
  processo?: ProcessoContratacao;
  contratoGerado?: Contrato;
}

export interface ResultadoImportacao {
  criados: number;
  codigos: string[];
}

export interface ContratosApi {
  // Cadastros e configuração
  listarUsuarios(): Promise<Usuario[]>;
  /** senha: obrigatória no cadastro; na edição, vazia mantém a atual. Só o hash é guardado. */
  salvarUsuario(u: Usuario, porId: string, senha?: string): Promise<Usuario>;
  listarEmpresas(): Promise<Empresa[]>;
  salvarEmpresa(e: Empresa, porId: string): Promise<Empresa>;
  listarFornecedores(): Promise<Fornecedor[]>;
  criarFornecedorPotencial(nome: string, porId: string): Promise<Fornecedor>;
  salvarFornecedor(f: Fornecedor, porId: string): Promise<Fornecedor>;
  listarTiposContrato(): Promise<TipoContrato[]>;
  salvarTipoContrato(t: TipoContrato, porId: string): Promise<TipoContrato>;
  obterConfiguracao(): Promise<Configuracao>;
  salvarConfiguracao(c: Configuracao, porId: string): Promise<Configuracao>;

  // Contratos
  consultarCentral(filtros: FiltrosCentral, ordenacao: Ordenacao, pagina: number, tamanhoPagina: number): Promise<ResultadoCentral>;
  listarContratos(): Promise<Contrato[]>;
  obterContrato(id: string): Promise<Contrato | undefined>;
  atualizarContrato(id: string, patch: Partial<Contrato>, porId: string): Promise<Contrato>;
  registrarAvaliacaoRenovacao(id: string, avaliacao: AvaliacaoRenovacao, porId: string): Promise<{ contrato: Contrato; processo?: ProcessoContratacao }>;
  encerrarContrato(id: string, status: Extract<StatusContrato, "Encerrado" | "Rescindido" | "Suspenso" | "Vigente" | "Cancelado">, motivo: string, porId: string): Promise<Contrato>;
  importarContratos(registros: RegistroImportado[], porId: string): Promise<ResultadoImportacao>;

  // Processos
  listarProcessos(): Promise<ProcessoContratacao[]>;
  obterProcesso(id: string): Promise<ProcessoContratacao | undefined>;
  criarProcesso(tipo: TipoProcesso, dados: Partial<ProcessoContratacao>, porId: string): Promise<ProcessoContratacao>;
  atualizarProcesso(id: string, patch: Partial<ProcessoContratacao>, porId: string): Promise<ProcessoContratacao>;
  validarDemanda(id: string, v: ValidacaoSuprimentos, porId: string): Promise<ProcessoContratacao>;
  avancarProcesso(id: string, porId: string): Promise<ResultadoAvanco>;
  registrarAprovacao(id: string, papel: PapelAprovacao, status: StatusAprovacao, comentario: string | undefined, porId: string): Promise<ProcessoContratacao>;
  registrarParecer(id: string, status: StatusJuridico, parecer: string, porId: string): Promise<ProcessoContratacao>;
  suspenderProcesso(id: string, motivo: string, porId: string): Promise<ProcessoContratacao>;
  retomarProcesso(id: string, porId: string): Promise<ProcessoContratacao>;
  cancelarProcesso(id: string, motivo: string, porId: string): Promise<ProcessoContratacao>;
  excluirRascunho(id: string, porId: string): Promise<void>;

  // Documentos
  listarDocumentos(filtro?: { contrato_id?: string; processo_id?: string }): Promise<Documento[]>;
  adicionarDocumento(doc: NovoDocumento, porId: string): Promise<Documento>;

  // Derivados
  listarAcoes(): Promise<AcaoNecessaria[]>;
  listarAlertas(contrato_id?: string): Promise<Alerta[]>;
  obterIndicadores(): Promise<Indicadores>;
  listarAuditoria(entidadeId?: string): Promise<RegistroAuditoria[]>;

  // Integrações (gateways)
  buscarDemandaJira(jira_key: string): Promise<DemandaJira | undefined>;

  // Saldo do contrato (pedidos e aportes). Com a integração, o módulo de pedidos usa registrarPedido.
  obterSaldoContrato(contratoId: string, porId: string): Promise<DadosSaldo>;
  /** Bloqueia pedido acima do saldo disponível (é preciso adicionar saldo antes). */
  registrarPedido(p: NovoPedido, porId: string): Promise<PedidoContrato>;
  /** Aprovado → Pago, ou Aprovado → Cancelado (libera o saldo). */
  atualizarStatusPedido(id: string, status: Exclude<StatusPedido, "Aprovado">, porId: string): Promise<PedidoContrato>;
  /** Adiciona saldo ao contrato (ex.: aditivo de valor). Nunca sobrescreve: soma ao contratado. */
  registrarAporteSaldo(a: NovoAporte, porId: string): Promise<AporteSaldo>;

  // Licenças de software e telefonia (só referenciam contratos; nunca os alteram).
  /** Dados já filtrados pelo perfil: Gestor recebe só a própria área; Leitura recebe pessoas sem nome/e-mail. */
  listarLicencas(porId: string): Promise<DadosLicencas>;
  /** Licença nova pode vir com a compra inicial (assentos, preço e data). */
  salvarLicenca(l: Licenca, porId: string, compraInicial?: NovaMovimentacao): Promise<Licenca>;
  /** Compra, redução, renegociação ou cancelamento. Calcula e grava o valor anual antes/depois. */
  registrarMovimentacao(m: NovaMovimentacao, porId: string): Promise<MovimentacaoLicenca>;
  salvarColaborador(c: Colaborador, porId: string): Promise<Colaborador>;
  /** Bloqueia sem assento livre, e-mail repetido na licença e colaborador desligado. */
  atribuirLicenca(licencaId: string, colaboradorId: string, dataInicio: ISODate, porId: string): Promise<AtribuicaoLicenca>;
  encerrarAtribuicao(id: string, dataFim: ISODate, porId: string): Promise<void>;
  /** Desligamento: encerra licenças e usos de linha da pessoa e marca como desligada. */
  desligarColaborador(colaboradorId: string, data: ISODate, porId: string): Promise<{ licencas: number; linhas: number }>;
  salvarCotacao(c: CotacaoDia, porId: string): Promise<void>;
  salvarParametro(chave: ChaveParametro, valor: string, vigenteDesde: ISODate, porId: string): Promise<void>;
  salvarOrcamento(o: OrcamentoFornecedor, porId: string): Promise<OrcamentoFornecedor>;
  /** Pré-visualização linha a linha (não grava). */
  previsualizarCsv(tipo: TipoImportacao, conteudo: string, porId: string): Promise<LinhaPrevia[]>;
  /** Importa só as linhas válidas; reimportar o mesmo arquivo não duplica. */
  importarCsv(tipo: TipoImportacao, conteudo: string, porId: string): Promise<ResultadoImportacaoCsv>;
  /** Exportações de dados (CSV) entram na auditoria. */
  registrarExportacao(descricao: string, porId: string): Promise<void>;
  salvarLinha(l: LinhaTelefonica, porId: string): Promise<LinhaTelefonica>;
  atribuirLinha(linhaId: string, colaboradorId: string, dataInicio: ISODate, porId: string): Promise<UsoLinha>;
  encerrarUsoLinha(id: string, dataFim: ISODate, porId: string): Promise<void>;

  // Base de dados (modo de uso, cópia de segurança)
  obterModoDados(): Promise<"demonstracao" | "real">;
  /** porId: obrigatório quando a base atual já é real (só Administrador substitui dados reais). */
  iniciarBaseVazia(admin: { nome: string; email: string }, porId?: string): Promise<void>;
  exportarBackup(porId: string): Promise<string>;
  importarBackup(conteudo: string, porId: string): Promise<{ contratos: number; processos: number }>;
  restaurarDadosDemonstracao(porId?: string): Promise<void>;
}

// ---------------------------------------------------------------- Saldo do contrato

export interface DadosSaldo {
  saldo: SaldoContrato;
  pedidos: PedidoContrato[];
  aportes: AporteSaldo[];
}

export type NovoPedido = Pick<PedidoContrato, "contrato_id" | "numero" | "data" | "valor" | "descricao">;
export type NovoAporte = Pick<AporteSaldo, "contrato_id" | "data" | "valor" | "motivo" | "referencia">;

// ---------------------------------------------------------------- Licenças e telefonia

export interface DadosLicencas {
  /** Como os dados foram filtrados para quem pediu. */
  visao: "completa" | "area" | "agregada";
  licencas: Licenca[];
  movimentacoes: MovimentacaoLicenca[];
  atribuicoes: AtribuicaoLicenca[];
  colaboradores: Colaborador[];
  cotacoes: CotacaoDia[];
  parametros: Parametro[];
  orcamentos: OrcamentoFornecedor[];
  linhas: LinhaTelefonica[];
  usosLinha: UsoLinha[];
}

export type NovaMovimentacao = Pick<MovimentacaoLicenca, "licencaId" | "tipo" | "data" | "quantidade" | "precoUnitario" | "responsavel" | "referenciaPedido" | "observacao">;

export interface ResultadoImportacaoCsv {
  importadas: number;
  jaExistiam: number;
  recusadas: number;
  conciliacao: number;
  linhas: LinhaPrevia[];
}

export class ErroPermissao extends Error {
  constructor(msg = "Operação não permitida para o seu perfil.") {
    super(msg);
    this.name = "ErroPermissao";
  }
}

export class ErroNegocio extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ErroNegocio";
  }
}
