import type { AbaCentral } from "@/domain/rules/central";
import type { Pendencia } from "@/domain/rules/fluxo";
import type { Indicadores } from "@/domain/rules/indicadores";
import type { RegistroImportado } from "@/domain/rules/importacao";
import type {
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
  salvarUsuario(u: Usuario, porId: string): Promise<Usuario>;
  listarEmpresas(): Promise<Empresa[]>;
  salvarEmpresa(e: Empresa, porId: string): Promise<Empresa>;
  listarFornecedores(): Promise<Fornecedor[]>;
  criarFornecedorPotencial(nome: string, porId: string): Promise<Fornecedor>;
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
  encerrarContrato(id: string, status: Extract<StatusContrato, "Encerrado" | "Rescindido" | "Suspenso" | "Vigente">, motivo: string, porId: string): Promise<Contrato>;
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

  // Demonstração
  restaurarDadosDemonstracao(): Promise<void>;
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
