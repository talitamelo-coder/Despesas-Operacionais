import { gerarCodigo, proximoSequencial } from "@/domain/codigos";
import { anoDe, hoje } from "@/domain/datas";
import { normalizarBusca, somenteDigitos } from "@/domain/formatacao";
import { calcularAcoes } from "@/domain/rules/acoes";
import { desfechoAvaliacao } from "@/domain/rules/avaliacao";
import { errosVigencia, prazosDoContrato } from "@/domain/rules/prazos";
import { erroSaldoApos, erroSaldoEmissao, erroSaldoPedido, faixaAlertaSaldo, saldoDoContrato, type ContextoSaldo } from "@/domain/rules/saldo";
import { aplicarAditivoRegistrado, errosContratoReceita, valorAnualReceita } from "@/domain/rules/receita";
import { validarCliente } from "@/domain/rules/clientes";
import { camposDeValorAlterados, pendenciasCadastro } from "@/domain/rules/cadastro";
import { gerarAlertas } from "@/domain/rules/alertas";
import { diffAuditoria } from "@/domain/rules/auditoria";
import { aprovacoesPadrao, etapasDoProcesso, opcoesFluxo, processoAtivo, propostaRecomendada, proximoStatus, requisitosPara, valorNegociado } from "@/domain/rules/fluxo";
import { fornecedorMascarado, normalizarFornecedor, validarFornecedor } from "@/domain/rules/fornecedor";
import { herdarDeContrato } from "@/domain/rules/heranca";
import { planejarImportacao, chaveLicenca, type ContextoImportacao } from "@/domain/rules/importacaoCsv";
import { acharFornecedorCadastrado, completarFornecedor } from "@/domain/rules/importacaoFornecedores";
import { aplicarMovimentacao, chaveEmail, dominiosDoGrupo, emailValido, erroAtribuicao, errosLicenca, errosMovimentacao, parametroNaData, posicaoNaData, valorAnualOriginal } from "@/domain/rules/licencas";
import { erroParametro } from "@/domain/rules/parametros";
import { erroUsoLinha, errosLinha, somenteDigitosLinha } from "@/domain/rules/telefonia";
import { gerarCredencial, nomeDeExibicao, usuarioPublico, validarUsuario } from "@/domain/rules/usuario";
import { calcularIndicadores } from "@/domain/rules/indicadores";
import { temPerfil, usuarioPode, type Permissao } from "@/domain/rules/permissoes";
import { validarSaving } from "@/domain/rules/saving";
import type { AditivoContrato, AporteSaldo, Cliente, EmissaoFaturamento, PedidoContrato, AtribuicaoLicenca, Colaborador, Contrato, Documento, Fornecedor, Licenca, LinhaTelefonica, MovimentacaoLicenca, ProcessoContratacao, RegistroAuditoria, TipoProcesso, UsoLinha, Usuario } from "@/domain/types";
import { jiraSimulado } from "@/integrations/jira";
import { completarEstado, criarEstadoInicial, criarEstadoVazio, migrarProcessos, VERSAO_SEED, type EstadoDados } from "@/mocks/seed";
import { ErroNegocio, ErroPermissao, type ContratosApi, type NovaMovimentacao, type NovoContratoCliente } from "../api";
import { consultar, montarLinhas } from "../consultaCentral";
import { notificarMudanca } from "../eventos";

/**
 * Implementação SIMULADA da camada de dados (em memória + localStorage).
 * Regras de negócio vêm de src/domain/rules — esta camada apenas orquestra e persiste,
 * exatamente o papel que o backend Python terá.
 */

const CHAVE_STORAGE = "akross-contratos:estado";

function carregar(): EstadoDados {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (bruto) {
      const e = JSON.parse(bruto) as EstadoDados;
      // Dados reais nunca são descartados por mudança de versão; só a demonstração é recriada.
      if (e.modo === "real") return completarEstado(e);
      if (e.versao === VERSAO_SEED) return completarEstado({ ...e, modo: "demonstracao" });
    }
  } catch {
    /* storage indisponível: segue com dados novos */
  }
  return criarEstadoInicial();
}

let estado: EstadoDados = carregar();
let cacheLinhas: { versao: number; linhas: ReturnType<typeof montarLinhas> } | null = null;
let versaoEstado = 0;

function persistir(): void {
  versaoEstado++;
  cacheLinhas = null;
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estado));
  } catch {
    /* sem persistência: dados permanecem só em memória */
  }
  notificarMudanca();
}

const clone = <T,>(v: T): T => structuredClone(v);
const agora = () => new Date().toISOString();
let contadorId = Date.now();
const novoId = (prefixo: string) => `${prefixo}-${(contadorId++).toString(36)}`;
const latencia = () => new Promise((r) => setTimeout(r, 60));

function usuario(id: string): Usuario {
  const u = estado.usuarios.find((x) => x.id === id);
  if (!u) throw new ErroPermissao("Usuário não identificado.");
  return u;
}

function exigir(porId: string, permissao: Permissao): Usuario {
  const u = usuario(porId);
  if (!usuarioPode(u, permissao)) throw new ErroPermissao();
  return u;
}

function auditar(registros: RegistroAuditoria[]): void {
  estado.auditoria.unshift(...registros);
}

function registrar(entidade: RegistroAuditoria["entidade"], entidadeId: string, porId: string, acao: string, campo?: string, valorAnterior?: string, valorNovo?: string) {
  auditar([{ id: novoId("a"), entidade, entidadeId, usuarioId: porId, data: agora(), acao, campo, valorAnterior, valorNovo }]);
}

function getContrato(id: string): Contrato {
  const c = estado.contratos.find((x) => x.contrato_id === id);
  if (!c) throw new ErroNegocio("Contrato não encontrado.");
  return c;
}

function getProcesso(id: string): ProcessoContratacao {
  const p = estado.processos.find((x) => x.processo_id === id);
  if (!p) throw new ErroNegocio("Processo não encontrado.");
  return p;
}

function timeline(p: ProcessoContratacao, porId: string, descricao: string, tipo: ProcessoContratacao["timeline"][number]["tipo"]) {
  p.timeline.push({ id: novoId("tl"), data: agora(), usuarioId: porId, descricao, tipo });
}

function codigoNovo(prefixo: "CT" | "PC", data = hoje()): string {
  const ano = anoDe(data);
  const existentes = prefixo === "CT" ? estado.contratos.map((c) => c.codigo) : estado.processos.map((p) => p.codigo);
  return gerarCodigo(prefixo, ano, proximoSequencial(existentes, prefixo, ano));
}

function getLicenca(id: string): Licenca {
  const l = estado.licencas.find((x) => x.id === id);
  if (!l) throw new ErroNegocio("Licença não encontrada.");
  return l;
}

function getColaborador(id: string): Colaborador {
  const c = estado.colaboradores.find((x) => x.id === id);
  if (!c) throw new ErroNegocio("Colaborador não encontrado.");
  return c;
}

/** Efeitos de uma movimentação: cancelamento encerra atribuições; compra reativa licença cancelada. */
function aposMovimentacao(l: Licenca, tipo: MovimentacaoLicenca["tipo"], data: string) {
  if (tipo === "Cancelamento") {
    l.status = "Cancelada";
    for (const a of estado.atribuicoesLicenca.filter((x) => x.licencaId === l.id && x.status === "Ativa")) (a.status = "Encerrada"), (a.dataFim = data < a.dataInicio ? a.dataInicio : data);
  } else if (tipo === "Compra" && l.status === "Cancelada") l.status = "Ativa";
  l.atualizadoEm = agora();
}

/** Grava a movimentação com o valor anual antes/depois (registro de economia ou aumento). */
function gravarMovimentacao(l: Licenca, m: NovaMovimentacao, porId: string): MovimentacaoLicenca {
  const lotes = posicaoNaData(estado.movimentacoesLicenca.filter((x) => x.licencaId === l.id), "9999-12-31").lotes;
  const r: MovimentacaoLicenca = {
    ...m,
    id: novoId("mov"),
    valorAnualAntes: valorAnualOriginal(lotes, l.periodicidade),
    valorAnualDepois: valorAnualOriginal(aplicarMovimentacao(lotes, m), l.periodicidade),
    registradoPorId: porId,
    registradoEm: agora(),
  };
  estado.movimentacoesLicenca.push(r);
  aposMovimentacao(l, m.tipo, m.data);
  registrar("licenca", l.id, porId, `${m.tipo} registrada`, "valorAnual", String(r.valorAnualAntes), String(r.valorAnualDepois));
  return r;
}

function contextoImportacao(): ContextoImportacao {
  return {
    hoje: hoje(),
    fornecedores: estado.fornecedores,
    contratos: estado.contratos,
    clientes: estado.clientes,
    usuarios: estado.usuarios,
    empresas: estado.empresas,
    licencas: estado.licencas,
    movimentacoes: estado.movimentacoesLicenca,
    atribuicoes: estado.atribuicoesLicenca,
    colaboradores: estado.colaboradores,
    dominios: dominiosDoGrupo(estado.parametros),
    linhas: estado.linhasTelefonicas,
    usos: estado.usosLinha,
    pendencias: estado.pendenciasAtribuicao,
  };
}

/** Contrato de cliente novo (registro manual ou importação). Valida em quem chama. */
function montarContratoCliente(d: NovoContratoCliente, porId: string): Contrato {
  return {
    contrato_id: novoId("c"),
    codigo: codigoNovo("CT", d.vigencia.dataInicio || hoje()),
    natureza: "Receita",
    clienteId: d.clienteId,
    fornecedorId: "",
    empresaId: d.empresaId,
    objeto: d.objeto.trim(),
    tipoContratoId: d.tipoContratoId || estado.tiposContrato[0]?.id || "",
    gestorId: d.gestorId,
    analistaId: porId,
    centroCusto: d.centroCusto,
    projeto: d.projeto,
    external_id: d.external_id,
    status: "Vigente",
    condicoes: { moeda: d.moeda, valorAnual: valorAnualReceita(d.receita), periodicidadePagamento: "Mensal", condicaoPagamento: "" },
    vigencia: d.vigencia,
    reajuste: d.reajuste ?? { possui: false },
    rescisao: { permite: true, possuiMulta: false },
    receita: d.receita,
    observacoes: d.observacoes,
    execucaoFinanceira: { simulado: true },
    origens: {},
    criadoEm: agora(),
    atualizadoEm: agora(),
  };
}

function contextoSaldo(e: EstadoDados = estado): ContextoSaldo {
  return {
    pedidos: e.pedidosContrato,
    emissoes: e.emissoesFaturamento,
    aportes: e.aportesSaldo,
    linhas: e.linhasTelefonicas,
    licencas: { licencas: e.licencas, movimentacoes: e.movimentacoesLicenca, atribuicoes: e.atribuicoesLicenca, colaboradores: e.colaboradores, cotacoes: e.cotacoes, parametros: e.parametros },
  };
}

/** Contratos vigentes que têm algo consumindo saldo (pedidos, licenças ou linhas vinculadas). */
function contratosComConsumo(e: EstadoDados = estado): Contrato[] {
  const ids = new Set([...e.pedidosContrato.map((p) => p.contrato_id), ...e.emissoesFaturamento.map((x) => x.contrato_id), ...e.licencas.map((l) => l.contrato_id), ...e.linhasTelefonicas.map((l) => l.contrato_id)]);
  return e.contratos.filter((c) => c.status === "Vigente" && ids.has(c.contrato_id));
}

/**
 * Compras de licença e linhas vinculadas consomem o saldo: se a operação deixar algum contrato
 * sem saldo (ou piorar um saldo negativo), nada é gravado.
 */
async function comGuardaSaldo<T>(acao: () => Promise<T>): Promise<T> {
  const copia = clone(estado);
  const r = await acao();
  const ctxAntes = contextoSaldo(copia);
  const ctxDepois = contextoSaldo();
  for (const c of contratosComConsumo()) {
    const anterior = copia.contratos.find((x) => x.contrato_id === c.contrato_id) ?? c;
    const erro = erroSaldoApos(saldoDoContrato(anterior, ctxAntes), saldoDoContrato(c, ctxDepois), c.codigo);
    if (erro) {
      estado = copia;
      persistir();
      throw new ErroNegocio(erro);
    }
  }
  return r;
}

function acoes() {
  const saldos = new Map<string, { faixa: 80 | 100; percentual: number }>();
  const ctx = contextoSaldo();
  for (const c of contratosComConsumo()) {
    const s = saldoDoContrato(c, ctx);
    const faixa = faixaAlertaSaldo(s);
    if (faixa) saldos.set(c.contrato_id, { faixa, percentual: s.percentualConsumido });
  }
  return calcularAcoes({
    saldos,
    contratos: estado.contratos,
    processos: estado.processos,
    regras: estado.configuracao.regrasAlerta,
    juridicoPadraoId: estado.usuarios.find((u) => temPerfil(u, "Juridico"))?.id,
  });
}

function processoVazio(tipo: TipoProcesso, porId: string): ProcessoContratacao {
  return {
    processo_id: novoId("p"),
    codigo: codigoNovo("PC"),
    tipo,
    status: "Rascunho",
    propostas: [],
    aprovacoes: [],
    juridico: { status: "Não iniciado" },
    assinatura: { status: "Não iniciada" },
    timeline: [],
    origens: {},
    criadoEm: agora(),
    atualizadoEm: agora(),
    criadoPorId: porId,
  };
}

/** Saving e baseline só podem ser alterados por Suprimentos ou Administrador. */
function protegerSaving(antes: { saving?: unknown }, patch: { saving?: unknown }, porId: string) {
  if ("saving" in patch && JSON.stringify(antes.saving) !== JSON.stringify(patch.saving)) exigir(porId, "editar_saving");
}

/**
 * Aditivo concluído: altera o PRÓPRIO contrato (não gera novo código), com trilha de auditoria
 * campo a campo — valor anterior e novo ficam preservados na auditoria.
 */
function aplicarAditivo(p: ProcessoContratacao, porId: string): Contrato {
  const c = getContrato(p.contrato_anterior_id!);
  const cond = p.condicoes ?? {};
  const novo: Contrato = {
    ...c,
    condicoes: {
      ...c.condicoes,
      valorAnual: valorNegociado(p) ?? c.condicoes.valorAnual,
      quantidade: cond.quantidade ?? c.condicoes.quantidade,
      unidade: cond.unidade ?? c.condicoes.unidade,
      precoUnitario: cond.precoUnitario ?? c.condicoes.precoUnitario,
      condicaoPagamento: cond.condicaoPagamento ?? c.condicoes.condicaoPagamento,
      cotacao: cond.cotacao ?? c.condicoes.cotacao,
    },
    vigencia: { ...c.vigencia, dataFim: p.vigencia?.dataFim ?? c.vigencia.dataFim },
    atualizadoEm: agora(),
  };
  auditar(diffAuditoria(c, novo, { entidade: "contrato", entidadeId: c.contrato_id, usuarioId: porId, data: agora(), acao: `Aditivo ${p.codigo} aplicado` }, () => novoId("a")));
  Object.assign(c, novo);
  for (const d of estado.documentos) if (d.processo_id === p.processo_id) d.contrato_id = c.contrato_id;
  return c;
}

/** Conclusão do processo => novo contrato. Nunca sobrescreve o anterior. */
function gerarContrato(p: ProcessoContratacao, porId: string): Contrato {
  const rec = propostaRecomendada(p)!;
  const anterior = p.contrato_anterior_id ? getContrato(p.contrato_anterior_id) : undefined;
  const v = p.vigencia!;
  const cond = p.condicoes ?? {};
  const contrato: Contrato = {
    contrato_id: novoId("c"),
    codigo: codigoNovo("CT", v.dataInicio),
    processo_id: p.processo_id,
    contrato_anterior_id: anterior?.contrato_id,
    relacaoAnterior: p.tipo === "Substituição de fornecedor" ? "Substituição" : anterior ? "Renovação" : undefined,
    jira_key: p.jira_key,
    empresaId: p.empresaId!,
    fornecedorId: rec.fornecedorId!,
    objeto: p.objeto!,
    tipoContratoId: p.tipoContratoId!,
    gestorId: p.gestorId!,
    diretorId: p.diretorId,
    analistaId: p.analistaId!,
    centroCusto: p.centroCusto,
    projeto: p.projeto,
    status: "Vigente",
    condicoes: {
      moeda: cond.moeda ?? rec.moeda,
      valorAnual: valorNegociado(p)!,
      quantidade: cond.quantidade,
      unidade: cond.unidade,
      precoUnitario: cond.precoUnitario,
      periodicidadePagamento: cond.periodicidadePagamento ?? "Mensal",
      condicaoPagamento: cond.condicaoPagamento ?? "",
      cotacao: cond.cotacao,
    },
    vigencia: {
      dataInicio: v.dataInicio!,
      dataFim: v.dataFim!,
      tipoVigencia: v.tipoVigencia ?? "Prazo determinado",
      avisoPrevioDias: v.avisoPrevioDias ?? 0,
      renovacaoAutomatica: v.renovacaoAutomatica ?? false,
      prazoGestorDias: v.prazoGestorDias ?? estado.configuracao.regrasAlerta.prazoGestorPadraoDias,
      periodicidadeRenovacaoMeses: v.periodicidadeRenovacaoMeses,
    },
    reajuste: p.reajuste ?? { possui: false },
    rescisao: p.rescisao ?? { permite: true, possuiMulta: false },
    saving: p.saving,
    motivoSubstituicao: p.motivoSubstituicao,
    substituicao:
      p.tipo === "Substituição de fornecedor" && anterior
        ? { fornecedorAnteriorId: anterior.fornecedorId, valorAnteriorAnual: anterior.condicoes.valorAnual, origemOportunidade: p.origemOportunidade ?? "Suprimentos" }
        : undefined,
    execucaoFinanceira: { simulado: true },
    origens: { ...p.origens },
    criadoEm: agora(),
    atualizadoEm: agora(),
  };
  estado.contratos.push(contrato);
  if (anterior) {
    anterior.sucessor_id = contrato.contrato_id;
    anterior.atualizadoEm = agora();
    registrar("contrato", anterior.contrato_id, porId, p.tipo === "Substituição de fornecedor" ? "Contrato substituído" : "Contrato renovado", "sucessor_id", undefined, contrato.codigo);
  }
  // Documentos do processo passam a compor o histórico do contrato.
  for (const d of estado.documentos) if (d.processo_id === p.processo_id) d.contrato_id = contrato.contrato_id;
  registrar("contrato", contrato.contrato_id, porId, "Contrato gerado a partir do processo", "status", undefined, "Vigente");
  return contrato;
}

export const mockApi: ContratosApi = {
  // ---------------------------------------------------------------- Cadastros
  async listarUsuarios() {
    return estado.usuarios.map((u) => usuarioPublico(clone(u)));
  },
  async salvarUsuario(entrada, porId, senha) {
    exigir(porId, "administrar");
    const i = estado.usuarios.findIndex((x) => x.id === entrada.id);
    const email = entrada.email.trim().toLowerCase();
    const erros = validarUsuario({ ...entrada, email }, senha ?? "", {
      novo: i < 0,
      emailsExistentes: estado.usuarios.filter((x) => x.id !== entrada.id).map((x) => x.email.trim().toLowerCase()),
    });
    if (Object.keys(erros).length) throw new ErroNegocio(Object.values(erros).join(" "));
    // A credencial nunca vem da tela: é gerada aqui a partir da senha, ou mantida a atual.
    const { credencial: _ignorada, temSenha: _t, ...dados } = entrada;
    const credencial = senha ? await gerarCredencial(senha) : i >= 0 ? estado.usuarios[i].credencial : undefined;
    // O nome de exibição é gravado (sugerido se vazio) para relatórios e telas usarem a mesma fonte.
    const adicionais = [...new Set((dados.perfisAdicionais ?? []).filter((p) => p !== dados.perfil))];
    const u: Usuario = { ...dados, perfisAdicionais: adicionais.length ? adicionais : undefined, nome: dados.nome.trim(), nomeExibicao: nomeDeExibicao(dados), email, credencial };
    if (i >= 0) {
      const sem = (x: Usuario) => usuarioPublico(x);
      auditar(diffAuditoria(sem(estado.usuarios[i]), sem(u), { entidade: "configuracao", entidadeId: u.id, usuarioId: porId, data: agora(), acao: "Usuário alterado" }, () => novoId("a")));
      if (senha) registrar("configuracao", u.id, porId, "Senha redefinida");
      estado.usuarios[i] = u;
    } else {
      u.id = novoId("u");
      estado.usuarios.push(u);
      registrar("configuracao", u.id, porId, "Usuário criado", "nome", undefined, u.nome);
    }
    persistir();
    return usuarioPublico(clone(u));
  },
  async listarEmpresas() {
    return clone(estado.empresas);
  },
  async salvarEmpresa(e, porId) {
    exigir(porId, "administrar");
    const i = estado.empresas.findIndex((x) => x.id === e.id);
    if (i >= 0) estado.empresas[i] = e;
    else estado.empresas.push((e = { ...e, id: novoId("e") }));
    registrar("configuracao", e.id, porId, i >= 0 ? "Empresa alterada" : "Empresa criada", "nome", undefined, e.nome);
    persistir();
    return clone(e);
  },
  async listarFornecedores() {
    return clone(estado.fornecedores);
  },
  async criarFornecedorPotencial(nome, porId) {
    exigir(porId, "editar_processo");
    const f: Fornecedor = { fornecedor_id: novoId("f"), razaoSocial: nome, nomeFantasia: nome, statusCadastral: "Potencial" };
    estado.fornecedores.push(f);
    persistir();
    return clone(f);
  },
  async salvarFornecedor(f, porId) {
    exigir(porId, "editar_processo");
    const erros = validarFornecedor(f);
    if (Object.keys(erros).length) throw new ErroNegocio(Object.values(erros).join(" "));
    const novo = normalizarFornecedor(f);
    if (novo.cnpj && estado.fornecedores.some((x) => x.fornecedor_id !== f.fornecedor_id && x.cnpj && somenteDigitos(x.cnpj) === novo.cnpj))
      throw new ErroNegocio("Já existe fornecedor com este CNPJ.");
    const i = estado.fornecedores.findIndex((x) => x.fornecedor_id === f.fornecedor_id);
    if (i >= 0) {
      // Dados bancários e PIX entram na auditoria apenas mascarados.
      auditar(diffAuditoria(fornecedorMascarado(estado.fornecedores[i]), fornecedorMascarado(novo), { entidade: "configuracao", entidadeId: f.fornecedor_id, usuarioId: porId, data: agora(), acao: "Fornecedor alterado" }, () => novoId("a")));
      estado.fornecedores[i] = novo;
    } else {
      novo.fornecedor_id = novoId("f");
      estado.fornecedores.push(novo);
      registrar("configuracao", novo.fornecedor_id, porId, "Fornecedor cadastrado", "razaoSocial", undefined, novo.razaoSocial);
    }
    persistir();
    return clone(novo);
  },
  async listarTiposContrato() {
    return clone(estado.tiposContrato);
  },
  async salvarTipoContrato(t, porId) {
    exigir(porId, "administrar");
    const i = estado.tiposContrato.findIndex((x) => x.id === t.id);
    if (i >= 0) estado.tiposContrato[i] = t;
    else estado.tiposContrato.push((t = { ...t, id: novoId("t") }));
    persistir();
    return clone(t);
  },
  async obterConfiguracao() {
    return clone(estado.configuracao);
  },
  async salvarConfiguracao(c, porId) {
    exigir(porId, "administrar");
    auditar(diffAuditoria(estado.configuracao, c, { entidade: "configuracao", entidadeId: "configuracao", usuarioId: porId, data: agora(), acao: "Configuração alterada" }, () => novoId("a")));
    estado.configuracao = clone(c);
    // Etapa desligada: processos parados nela seguem para a próxima etapa (registrado na linha do tempo).
    const antes = new Map(estado.processos.map((p) => [p.processo_id, p.status]));
    estado.processos = migrarProcessos(estado.processos, opcoesFluxo(c));
    for (const p of estado.processos) if (antes.get(p.processo_id) !== p.status) registrar("processo", p.processo_id, porId, "Etapa desligada na configuração", "status", antes.get(p.processo_id), p.status);
    persistir();
    return clone(c);
  },

  // ---------------------------------------------------------------- Contratos
  async consultarCentral(filtros, ordenacao, pagina, tamanhoPagina) {
    await latencia();
    if (!cacheLinhas || cacheLinhas.versao !== versaoEstado) {
      cacheLinhas = {
        versao: versaoEstado,
        linhas: montarLinhas({ ...estado, acoes: acoes(), regras: estado.configuracao.regrasAlerta }),
      };
    }
    return consultar(cacheLinhas.linhas, filtros, ordenacao, pagina, tamanhoPagina);
  },
  async listarContratos() {
    return clone(estado.contratos);
  },
  async obterContrato(id) {
    await latencia();
    const c = estado.contratos.find((x) => x.contrato_id === id);
    return c ? clone(c) : undefined;
  },
  async atualizarContrato(id, patch, porId) {
    exigir(porId, "editar_processo");
    const c = getContrato(id);
    protegerSaving(c, patch, porId);
    if (patch.saving) {
      const erros = validarSaving(patch.saving);
      if (erros.length) throw new ErroNegocio(erros.join(" "));
    }
    const novo = { ...c, ...patch, contrato_id: c.contrato_id, codigo: c.codigo, atualizadoEm: agora() };
    // Valor e prazo só mudam por aditivo; edição direta apenas para completar cadastro importado.
    const alterados = camposDeValorAlterados(c, novo);
    const tipoNome = estado.tiposContrato.find((t) => t.id === c.tipoContratoId)?.nome;
    // Cadastro importado “A completar” pode ser salvo aos poucos; contrato completo precisa de vigência.
    const aCompletar = pendenciasCadastro(c, estado.fornecedores.find((f) => f.fornecedor_id === c.fornecedorId), tipoNome).length > 0;
    const errosVig = errosVigencia(novo.vigencia);
    if (errosVig.length && !aCompletar) throw new ErroNegocio(`Todo contrato precisa de vigência. ${errosVig.join(" ")}`);
    if (alterados.length && !pendenciasCadastro(c, estado.fornecedores.find((f) => f.fornecedor_id === c.fornecedorId), tipoNome).length)
      throw new ErroNegocio(`Para alterar ${alterados.join(", ")}, registre um aditivo (ou renegociação/novo contrato).`);
    auditar(diffAuditoria(c, novo, { entidade: "contrato", entidadeId: id, usuarioId: porId, data: agora(), acao: "Contrato alterado" }, () => novoId("a")));
    Object.assign(c, novo);
    persistir();
    return clone(c);
  },
  async registrarAvaliacaoRenovacao(id, avaliacao, porId) {
    const u = exigir(porId, "avaliar_renovacao");
    const c = getContrato(id);
    if (!temPerfil(u, "Administrador") && !temPerfil(u, "Suprimentos") && c.gestorId !== u.id && !u.diretor) throw new ErroPermissao("Apenas o gestor do contrato pode responder a avaliação.");
    if (c.status !== "Vigente") throw new ErroNegocio(`Contrato ${c.status.toLowerCase()} não tem avaliação de renovação.`);
    const indeterminado = c.vigencia.tipoVigencia === "Prazo indeterminado";
    const prazos = prazosDoContrato(c);
    if (!indeterminado && c.avaliacaoRenovacao?.respondidoEm) throw new ErroNegocio("A avaliação deste contrato já foi respondida.");
    if (indeterminado && (prazos.fase === "Normal" || prazos.fase === "Sem vigência"))
      throw new ErroNegocio("A revisão anual deste contrato ainda não está aberta.");
    const desfecho = desfechoAvaliacao(avaliacao, c.vigencia.tipoVigencia);
    if (!desfecho) throw new ErroNegocio("Escolha se o contrato será renovado, substituído ou cancelado.");
    // Revisões anteriores ficam guardadas: nada é sobrescrito sem histórico.
    if (c.avaliacaoRenovacao?.respondidoEm) c.avaliacoesAnteriores = [...(c.avaliacoesAnteriores ?? []), c.avaliacaoRenovacao];
    c.avaliacaoRenovacao = { ...avaliacao, respondidoPorId: porId, respondidoEm: agora(), cicloRevisao: prazos.proximaRevisao };
    c.atualizadoEm = agora();
    registrar("contrato", id, porId, indeterminado ? "Revisão anual respondida" : "Avaliação de renovação respondida", "avaliacaoRenovacao", undefined, JSON.stringify(avaliacao));

    // Não renovar nem substituir = contrato cancelado (sai dos vigentes; alertas param).
    if (desfecho === "Cancelar contrato") {
      registrar("contrato", id, porId, "Contrato cancelado pela avaliação: não será renovado nem substituído", "status", c.status, "Cancelado");
      c.status = "Cancelado";
    }

    // Decisão => novo processo (renovação/substituição) para Suprimentos. Lembretes ao gestor param.
    let processo: ProcessoContratacao | undefined;
    const tipo: TipoProcesso | undefined =
      desfecho === "Substituição de fornecedor" ? "Substituição de fornecedor" : desfecho === "Renovação" ? "Renovação" : undefined;
    const jaAberto = estado.processos.some((p) => p.contrato_anterior_id === id && processoAtivo(p));
    if (tipo && !jaAberto && c.natureza !== "Receita") {
      processo = { ...processoVazio(tipo, porId), ...herdarDeContrato(c, tipo, () => novoId("pr")) };
      processo.origemOportunidade = "Gestor";
      if (tipo === "Substituição de fornecedor")
        processo.motivoSubstituicao = avaliacao.problemaFornecedor === "Sim" ? `Problema com fornecedor: ${avaliacao.observacoes ?? ""}`.trim() : undefined;
      processo.status = etapasDoProcesso(processo)[1]; // já entra com Suprimentos
      if (requisitosPara(processo.status, processo, [], opcoesFluxo(estado.configuracao)).length) processo.status = "Rascunho";
      timeline(processo, porId, `Processo de ${tipo.toLowerCase()} criado a partir da avaliação de ${c.codigo}`, "sistema");
      estado.processos.push(processo);
    }
    persistir();
    return { contrato: clone(c), processo: processo && clone(processo) };
  },
  async encerrarContrato(id, status, motivo, porId) {
    exigir(porId, "editar_processo");
    const c = getContrato(id);
    registrar("contrato", id, porId, `Status alterado: ${motivo}`, "status", c.status, status);
    c.status = status;
    c.atualizadoEm = agora();
    persistir();
    return clone(c);
  },
  async importarFornecedores(fornecedores, porId) {
    exigir(porId, "importar_planilha");
    const r = { criados: 0, completados: 0, semMudanca: 0 };
    for (const f of fornecedores) {
      const atual = acharFornecedorCadastrado(f, estado.fornecedores);
      if (!atual) {
        const novo = { ...f, fornecedor_id: novoId("f") };
        estado.fornecedores.push(novo);
        registrar("configuracao", novo.fornecedor_id, porId, "Fornecedor cadastrado pela importação", "razaoSocial", undefined, novo.razaoSocial);
        r.criados++;
        continue;
      }
      const { fornecedor, campos } = completarFornecedor(atual, f);
      if (!campos.length) {
        r.semMudanca++;
        continue;
      }
      auditar(diffAuditoria(fornecedorMascarado(atual), fornecedorMascarado(fornecedor), { entidade: "configuracao", entidadeId: atual.fornecedor_id, usuarioId: porId, data: agora(), acao: "Fornecedor completado pela importação" }, () => novoId("a")));
      Object.assign(atual, fornecedor);
      r.completados++;
    }
    persistir();
    return r;
  },
  async importarContratos(registros, porId) {
    exigir(porId, "importar_planilha");
    const codigos: string[] = [];
    const porNome = <T extends { nome?: string }>(lista: T[], nome: string) => lista.find((x) => x.nome?.toLowerCase() === nome.toLowerCase());
    for (const r of registros) {
      let empresa = porNome(estado.empresas, r.empresa);
      if (!empresa) estado.empresas.push((empresa = { id: novoId("e"), nome: r.empresa, cnpj: "", ativo: true }));
      // Com CNPJ: reconhece pelo CNPJ. Sem CNPJ (exterior): pelo nome.
      let forn = r.cnpj
        ? estado.fornecedores.find((f) => f.cnpj && somenteDigitos(f.cnpj) === r.cnpj)
        : estado.fornecedores.find((f) => normalizarBusca(f.razaoSocial) === normalizarBusca(r.fornecedor) || normalizarBusca(f.nomeFantasia) === normalizarBusca(r.fornecedor));
      if (!forn) estado.fornecedores.push((forn = { fornecedor_id: novoId("f"), razaoSocial: r.fornecedor, nomeFantasia: r.fornecedor, cnpj: r.cnpj || undefined, estrangeiro: r.pais ? true : undefined, pais: r.pais, statusCadastral: "Ativo" }));
      let gestor = r.gestor ? porNome(estado.usuarios, r.gestor) : undefined;
      if (!gestor && r.gestor) {
        // Gestor citado na planilha e ainda não cadastrado: cria o usuário (e-mail a completar na Administração).
        gestor = { id: novoId("u"), nome: r.gestor, email: "", perfil: "Gestor", ativo: true };
        estado.usuarios.push(gestor);
        registrar("configuracao", gestor.id, porId, "Usuário criado pela importação", "nome", undefined, gestor.nome);
      }
      const analista = (r.analista && porNome(estado.usuarios, r.analista)) || usuario(porId);
      const tipo = (r.tipo && estado.tiposContrato.find((t) => t.nome.toLowerCase() === r.tipo!.toLowerCase())) || estado.tiposContrato[0];
      const c: Contrato = {
        contrato_id: novoId("c"),
        codigo: codigoNovo("CT", r.dataInicio || hoje()),
        external_id: r.codigo,
        empresaId: empresa.id,
        fornecedorId: forn.fornecedor_id,
        objeto: r.objeto,
        tipoContratoId: tipo.id,
        // Sem gestor na planilha: fica pendente (“A completar”).
        gestorId: gestor?.id ?? "",
        analistaId: analista.id,
        centroCusto: r.centroCusto,
        projeto: r.projeto,
        status: !r.indeterminado && r.dataFim && r.dataFim < hoje() ? "Encerrado" : "Vigente",
        condicoes: { moeda: r.moeda, valorAnual: r.valorAnual, quantidade: r.quantidade, unidade: r.unidade, periodicidadePagamento: r.periodicidade ?? "Mensal", condicaoPagamento: r.condicaoPagamento ?? "" },
        vigencia: { dataInicio: r.dataInicio, dataFim: r.dataFim, tipoVigencia: r.indeterminado ? "Prazo indeterminado" : "Prazo determinado", avisoPrevioDias: r.avisoPrevioDias, renovacaoAutomatica: r.renovacaoAutomatica, prazoGestorDias: estado.configuracao.regrasAlerta.prazoGestorPadraoDias },
        reajuste: r.indiceReajuste ? { possui: true, indice: r.indiceReajuste } : { possui: false },
        rescisao: { permite: true, possuiMulta: Boolean(r.multa), descricaoMulta: r.multa, regra: r.condicoesRescisao },
        observacoes: r.observacoes,
        // Datas, valor e gestor faltantes viram pendência calculada; a empresa padrão precisa ser confirmada.
        confirmacoesPendentes: r.pendencias?.filter((x) => x.startsWith("Empresa")),
        execucaoFinanceira: { simulado: true },
        origens: { "*": "importado" },
        criadoEm: agora(),
        atualizadoEm: agora(),
      };
      estado.contratos.push(c);
      codigos.push(c.codigo);
      registrar("contrato", c.contrato_id, porId, "Contrato importado da planilha", "external_id", undefined, r.codigo ?? `linha ${r.linha}`);
    }
    persistir();
    return { criados: codigos.length, codigos };
  },

  // ---------------------------------------------------------------- Processos
  async listarProcessos() {
    return clone(estado.processos);
  },
  async obterProcesso(id) {
    await latencia();
    const p = estado.processos.find((x) => x.processo_id === id);
    return p ? clone(p) : undefined;
  },
  async criarProcesso(tipo, dados, porId) {
    exigir(porId, "editar_processo");
    const p: ProcessoContratacao = { ...processoVazio(tipo, porId), ...dados, tipo, status: "Rascunho" };
    timeline(p, porId, "Rascunho criado", "status");
    estado.processos.push(p);
    registrar("processo", p.processo_id, porId, "Processo criado", "tipo", undefined, tipo);
    persistir();
    return clone(p);
  },
  async atualizarProcesso(id, patch, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    if (!processoAtivo(p)) throw new ErroNegocio("Processo encerrado não pode ser alterado.");
    protegerSaving(p, patch, porId);
    const novo = { ...p, ...patch, processo_id: p.processo_id, codigo: p.codigo, status: p.status, atualizadoEm: agora() };
    const regs = diffAuditoria(p, novo, { entidade: "processo", entidadeId: id, usuarioId: porId, data: agora(), acao: "Processo alterado" }, () => novoId("a"));
    // Rascunho com salvamento automático: sem trilha campo a campo antes de iniciar.
    if (p.status !== "Rascunho") auditar(regs);
    Object.assign(p, novo);
    persistir();
    return clone(p);
  },
  async validarDemanda(id, v, porId) {
    exigir(porId, "validar_demanda");
    const p = getProcesso(id);
    const antes = p.validacao;
    p.validacao = { ...v, validadoPorId: porId, validadoEm: agora() };
    p.origens = { ...p.origens, "validacao.valorValidado": "validado", "validacao.quantidadeValidada": "validado" };
    registrar("processo", id, porId, "Demanda validada por Suprimentos", "validacao.valorValidado", antes?.valorValidado?.toString() ?? p.demandaJira?.valorEstimado?.toString(), v.valorValidado?.toString());
    timeline(p, porId, "Dados da demanda validados por Suprimentos", "edicao");
    p.atualizadoEm = agora();
    persistir();
    return clone(p);
  },
  async avancarProcesso(id, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    const op = opcoesFluxo(estado.configuracao);
    const destino = proximoStatus(p, op);
    if (!destino) throw new ErroNegocio("Não há próxima etapa para este processo.");
    const docs = estado.documentos.filter((d) => d.processo_id === id);
    if (destino === "Concluído" && p.saving) {
      const erros = validarSaving(p.saving);
      if (erros.length) return { ok: false, pendencias: erros.map((m) => ({ campo: "saving", mensagem: m })) };
    }
    const pendencias = requisitosPara(destino, p, docs, op);
    if (pendencias.length) return { ok: false, pendencias };

    const anterior = p.status;
    p.status = destino;
    if (destino === "Aguardando aprovação comercial") p.aprovacoes = aprovacoesPadrao(p);
    if (destino === "Em análise jurídica") p.juridico = { ...p.juridico, status: "Em análise", responsavelId: p.juridico.responsavelId ?? estado.usuarios.find((u) => temPerfil(u, "Juridico"))?.id };
    if (destino === "Aguardando assinatura") p.assinatura = { status: "Enviado para assinatura" };
    let contratoGerado: Contrato | undefined;
    if (destino === "Concluído") {
      p.assinatura = { ...p.assinatura, status: "Assinado", data: p.assinatura.data ?? hoje() };
      if (p.tipo === "Aditivo") {
        contratoGerado = aplicarAditivo(p, porId);
        timeline(p, porId, `Aditivo aplicado ao contrato ${contratoGerado.codigo}`, "status");
      } else {
        contratoGerado = gerarContrato(p, porId);
        p.contrato_gerado_id = contratoGerado.contrato_id;
        timeline(p, porId, `Contrato ${contratoGerado.codigo} gerado`, "status");
      }
    }
    timeline(p, porId, `Status alterado de ${anterior} para ${destino}`, "status");
    registrar("processo", id, porId, "Mudança de etapa", "status", anterior, destino);
    p.atualizadoEm = agora();
    persistir();
    return { ok: true, pendencias: [], processo: clone(p), contratoGerado: contratoGerado && clone(contratoGerado) };
  },
  async registrarAprovacao(id, papel, status, comentario, porId) {
    const u = exigir(porId, "aprovar");
    const p = getProcesso(id);
    if (p.status !== "Aguardando aprovação comercial") throw new ErroNegocio("O processo não está em aprovação comercial.");
    const a = p.aprovacoes.find((x) => x.papel === papel);
    if (!a) throw new ErroNegocio("Aprovação não prevista para este papel.");
    if (a.usuarioId !== porId && !temPerfil(u, "Administrador")) throw new ErroPermissao("Esta aprovação está atribuída a outro usuário.");
    if (a.tipo === "Ciência" && status !== "Ciente") throw new ErroNegocio("Para o diretor, o registro normal é de ciência.");
    const antes = a.status;
    Object.assign(a, { status, comentario, data: agora() });
    timeline(p, porId, `${papel}: ${status}${comentario ? ` — ${comentario}` : ""}`, "aprovacao");
    registrar("processo", id, porId, "Aprovação registrada", `aprovacoes.${papel}`, antes, status);
    p.atualizadoEm = agora();
    persistir();
    return clone(p);
  },
  async registrarParecer(id, status, parecer, porId) {
    exigir(porId, "emitir_parecer");
    const p = getProcesso(id);
    if (p.status !== "Em análise jurídica") throw new ErroNegocio("O processo não está em análise jurídica.");
    const antes = p.juridico.status;
    p.juridico = { ...p.juridico, status, parecer, responsavelId: porId };
    timeline(p, porId, `Jurídico: ${status}`, "aprovacao");
    registrar("processo", id, porId, "Parecer jurídico", "juridico.status", antes, status);
    p.atualizadoEm = agora();
    persistir();
    return clone(p);
  },
  async suspenderProcesso(id, motivo, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    if (!processoAtivo(p) || p.status === "Suspenso") throw new ErroNegocio("Processo não pode ser suspenso.");
    p.statusAntesSuspensao = p.status;
    registrar("processo", id, porId, `Processo suspenso: ${motivo}`, "status", p.status, "Suspenso");
    p.status = "Suspenso";
    timeline(p, porId, `Processo suspenso — ${motivo}`, "status");
    persistir();
    return clone(p);
  },
  async retomarProcesso(id, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    if (p.status !== "Suspenso") throw new ErroNegocio("Processo não está suspenso.");
    p.status = p.statusAntesSuspensao ?? "Rascunho";
    p.statusAntesSuspensao = undefined;
    timeline(p, porId, `Processo retomado em ${p.status}`, "status");
    registrar("processo", id, porId, "Processo retomado", "status", "Suspenso", p.status);
    persistir();
    return clone(p);
  },
  async cancelarProcesso(id, motivo, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    if (!processoAtivo(p)) throw new ErroNegocio("Processo já encerrado.");
    registrar("processo", id, porId, `Processo cancelado: ${motivo}`, "status", p.status, "Cancelado");
    p.status = "Cancelado";
    timeline(p, porId, `Processo cancelado — ${motivo}`, "status");
    persistir();
    return clone(p);
  },
  async excluirRascunho(id, porId) {
    exigir(porId, "editar_processo");
    const p = getProcesso(id);
    if (p.status !== "Rascunho") throw new ErroNegocio("Somente rascunhos podem ser excluídos.");
    estado.processos = estado.processos.filter((x) => x.processo_id !== id);
    persistir();
  },

  // ---------------------------------------------------------------- Documentos
  async listarDocumentos(filtro) {
    const docs = estado.documentos.filter(
      (d) => (!filtro?.contrato_id || d.contrato_id === filtro.contrato_id) && (!filtro?.processo_id || d.processo_id === filtro.processo_id),
    );
    return clone(docs).sort((a, b) => b.data.localeCompare(a.data));
  },
  async adicionarDocumento(doc, porId) {
    exigir(porId, "gerir_documentos");
    // Versão incrementa para o mesmo nome/categoria na mesma entidade.
    const mesmos = estado.documentos.filter(
      (d) => d.nome === doc.nome && d.categoria === doc.categoria && d.contrato_id === doc.contrato_id && d.processo_id === doc.processo_id,
    );
    const novo: Documento = { ...doc, id: novoId("d"), versao: mesmos.length + 1, data: agora(), usuarioId: porId };
    estado.documentos.push(novo);
    const entidadeId = doc.processo_id ?? doc.contrato_id ?? "";
    registrar("documento", entidadeId, porId, "Documento anexado", "documento", undefined, `${doc.categoria}: ${doc.nome} (v${novo.versao})`);
    if (doc.processo_id) timeline(getProcesso(doc.processo_id), porId, `Documento anexado: ${doc.nome} (v${novo.versao})`, "documento");
    persistir();
    return clone(novo);
  },

  // ---------------------------------------------------------------- Saldo do contrato
  async obterSaldoContrato(contratoId, porId) {
    exigir(porId, "visualizar");
    const c = getContrato(contratoId);
    return clone({
      saldo: saldoDoContrato(c, contextoSaldo()),
      pedidos: estado.pedidosContrato.filter((p) => p.contrato_id === contratoId).sort((a, b) => b.data.localeCompare(a.data)),
      aportes: estado.aportesSaldo.filter((a) => a.contrato_id === contratoId).sort((a, b) => b.data.localeCompare(a.data)),
      emissoes: estado.emissoesFaturamento.filter((e) => e.contrato_id === contratoId).sort((a, b) => b.data.localeCompare(a.data)),
    });
  },
  async listarSaldos(natureza, porId) {
    exigir(porId, "visualizar");
    const ctx = contextoSaldo();
    const r: Record<string, ReturnType<typeof saldoDoContrato>> = {};
    for (const c of estado.contratos) if ((c.natureza ?? "Despesa") === natureza) r[c.contrato_id] = saldoDoContrato(c, ctx);
    return clone(r);
  },
  async registrarPedido(p, porId) {
    exigir(porId, "editar_processo");
    const c = getContrato(p.contrato_id);
    if (!p.numero?.trim()) throw new ErroNegocio("Informe o número do pedido.");
    if (!p.data) throw new ErroNegocio("Informe a data do pedido.");
    if (estado.pedidosContrato.some((x) => x.contrato_id === c.contrato_id && x.numero === p.numero.trim() && x.status !== "Cancelado")) throw new ErroNegocio("Este pedido já está registrado no contrato.");
    if (c.natureza === "Receita") throw new ErroNegocio("Contrato de cliente não recebe pedidos: o faturamento vem do Contas a receber.");
    const erro = erroSaldoPedido(saldoDoContrato(c, contextoSaldo()), p.valor, c);
    if (erro) throw new ErroNegocio(erro);
    const novo: PedidoContrato = { ...p, numero: p.numero.trim(), id: novoId("ped"), status: "Aprovado", origem: "Registro manual", registradoPorId: porId, registradoEm: agora() };
    estado.pedidosContrato.push(novo);
    registrar("contrato", c.contrato_id, porId, `Pedido ${novo.numero} registrado`, "saldo", undefined, String(novo.valor));
    persistir();
    return clone(novo);
  },
  async atualizarStatusPedido(id, status, porId) {
    exigir(porId, "editar_processo");
    const p = estado.pedidosContrato.find((x) => x.id === id);
    if (!p) throw new ErroNegocio("Pedido não encontrado.");
    if (p.status !== "Aprovado") throw new ErroNegocio(`Pedido ${p.status.toLowerCase()} não muda de situação aqui (estorno é feito em Contas a pagar).`);
    registrar("contrato", p.contrato_id, porId, `Pedido ${p.numero}: ${status.toLowerCase()}`, "status", p.status, status);
    p.status = status;
    persistir();
    return clone(p);
  },
  async registrarAditivo(a, porId) {
    exigir(porId, "editar_processo");
    const c = getContrato(a.contrato_id);
    if (c.status !== "Vigente") throw new ErroNegocio(`Contrato ${c.status.toLowerCase()} não recebe aditivo.`);
    if (estado.aditivosContrato.some((x) => x.contrato_id === c.contrato_id && x.numero.trim().toLowerCase() === a.numero.trim().toLowerCase())) throw new ErroNegocio("Já existe aditivo com este número no contrato.");
    const r = aplicarAditivoRegistrado(c, a);
    if (r.erros.length) throw new ErroNegocio(r.erros.join(" "));
    const errosVig = errosVigencia(r.contrato.vigencia);
    if (errosVig.length) throw new ErroNegocio(errosVig.join(" "));
    // Redução de valor não pode deixar o saldo abaixo do que já foi consumido.
    const aporte: AporteSaldo | undefined = a.variacaoValorTotal
      ? { id: novoId("apt"), contrato_id: c.contrato_id, data: a.data, valor: a.variacaoValorTotal, motivo: `Aditivo ${a.numero.trim()}`, referencia: a.numero.trim(), registradoPorId: porId, registradoEm: agora() }
      : undefined;
    const ctx = contextoSaldo();
    const depois = saldoDoContrato(r.contrato, { ...ctx, aportes: aporte ? [...ctx.aportes, aporte] : ctx.aportes });
    if (!depois.indisponivel && depois.disponivel < -0.005) throw new ErroNegocio("O aditivo deixaria o saldo abaixo do que já foi consumido/faturado.");
    const novo: AditivoContrato = { ...a, numero: a.numero.trim(), id: novoId("adt"), antes: r.antes, depois: r.depois, registradoPorId: porId, registradoEm: agora() };
    estado.aditivosContrato.push(novo);
    if (aporte) estado.aportesSaldo.push(aporte);
    const atualizado = { ...r.contrato, atualizadoEm: agora() };
    auditar(diffAuditoria(c, atualizado, { entidade: "contrato", entidadeId: c.contrato_id, usuarioId: porId, data: agora(), acao: `Aditivo ${novo.numero} registrado` }, () => novoId("a")));
    registrar("contrato", c.contrato_id, porId, `Aditivo ${novo.numero} (${novo.tipo})`, "aditivo", r.antes, r.depois);
    Object.assign(c, atualizado);
    persistir();
    return clone(novo);
  },
  async listarAditivos(contratoId) {
    return clone(estado.aditivosContrato.filter((a) => a.contrato_id === contratoId).sort((a, b) => b.data.localeCompare(a.data)));
  },
  async listarClientes() {
    return clone(estado.clientes);
  },
  async salvarCliente(c, porId) {
    exigir(porId, "editar_processo");
    const erros = validarCliente(c, estado.clientes);
    if (Object.keys(erros).length) throw new ErroNegocio(Object.values(erros).join(" "));
    const novo: Cliente = { ...c, razaoSocial: c.razaoSocial.trim(), nomeFantasia: c.nomeFantasia?.trim() ?? "", cnpj: c.estrangeiro ? undefined : c.cnpj && somenteDigitos(c.cnpj) };
    const i = estado.clientes.findIndex((x) => x.cliente_id === c.cliente_id);
    if (i >= 0) {
      auditar(diffAuditoria(estado.clientes[i], novo, { entidade: "configuracao", entidadeId: c.cliente_id, usuarioId: porId, data: agora(), acao: "Cliente alterado" }, () => novoId("a")));
      estado.clientes[i] = novo;
    } else {
      novo.cliente_id = novoId("cl");
      estado.clientes.push(novo);
      registrar("configuracao", novo.cliente_id, porId, "Cliente cadastrado", "razaoSocial", undefined, novo.razaoSocial);
    }
    persistir();
    return clone(novo);
  },
  async registrarContratoCliente(d, porId) {
    exigir(porId, "editar_processo");
    const base = montarContratoCliente(d, porId);
    const erros = errosContratoReceita(base);
    if (!estado.clientes.some((c) => c.cliente_id === d.clienteId)) erros.push("Cliente não encontrado.");
    if (d.receita.contratoPrincipalId && !estado.contratos.some((c) => c.contrato_id === d.receita.contratoPrincipalId && c.natureza === "Receita")) erros.push("Contrato principal não encontrado.");
    const anteriores = (d.contratosAnterioresIds ?? []).map((id) => getContrato(id));
    if (anteriores.some((a) => a.natureza !== "Receita")) erros.push("Só contratos de cliente podem ser renovados ou substituídos aqui.");
    if (anteriores.some((a) => a.sucessor_id)) erros.push("Um dos contratos anteriores já foi renovado ou substituído.");
    if (erros.length) throw new ErroNegocio(erros.join(" "));
    if (anteriores.length) {
      base.contrato_anterior_id = anteriores[0].contrato_id;
      base.contratosAnterioresIds = anteriores.map((a) => a.contrato_id);
      base.relacaoAnterior = d.relacaoAnterior ?? "Renovação";
    }
    estado.contratos.push(base);
    registrar("contrato", base.contrato_id, porId, "Contrato de cliente registrado", "status", undefined, "Vigente");
    // Contratos anteriores: só recebem o vínculo com o novo (nunca são sobrescritos).
    for (const a of anteriores) {
      a.sucessor_id = base.contrato_id;
      a.atualizadoEm = agora();
      registrar("contrato", a.contrato_id, porId, `${base.relacaoAnterior === "Substituição" ? "Substituído" : "Renovado"} por ${base.codigo}`, "sucessor_id", undefined, base.codigo);
    }
    persistir();
    return clone(base);
  },
  async registrarEmissao(e, porId) {
    exigir(porId, "editar_processo");
    const c = getContrato(e.contrato_id);
    if (c.natureza !== "Receita") throw new ErroNegocio("Emissões só existem em contratos de cliente.");
    if (!e.numeroDocumento?.trim() || !e.data) throw new ErroNegocio("Informe o número do documento e a data.");
    if (estado.emissoesFaturamento.some((x) => x.contrato_id === c.contrato_id && x.numeroDocumento === e.numeroDocumento.trim() && x.status === "Emitida")) throw new ErroNegocio("Esta emissão já foi registrada (integração idempotente).");
    const erro = erroSaldoEmissao(saldoDoContrato(c, contextoSaldo()), e.valor, c);
    if (erro) throw new ErroNegocio(erro);
    const novo: EmissaoFaturamento = { ...e, numeroDocumento: e.numeroDocumento.trim(), id: novoId("nf"), status: "Emitida", origem: "Contas a receber", registradoEm: agora() };
    estado.emissoesFaturamento.push(novo);
    registrar("contrato", c.contrato_id, porId, `Emissão ${novo.numeroDocumento} recebida do Contas a receber`, "saldo", undefined, String(novo.valor));
    persistir();
    return clone(novo);
  },
  async cancelarEmissao(id, porId) {
    exigir(porId, "editar_processo");
    const e = estado.emissoesFaturamento.find((x) => x.id === id);
    if (!e || e.status !== "Emitida") throw new ErroNegocio("Emissão não encontrada.");
    e.status = "Cancelada";
    registrar("contrato", e.contrato_id, porId, `Emissão ${e.numeroDocumento} cancelada no Contas a receber`, "saldo", String(e.valor), "0");
    persistir();
    return clone(e);
  },

  // ---------------------------------------------------------------- Licenças e telefonia (não alteram contratos)
  async listarLicencas(porId) {
    await latencia();
    const u = usuario(porId);
    const visao = usuarioPode(u, "gerir_licencas") ? "completa" : usuarioPode(u, "ver_licencas_da_area") ? "area" : usuarioPode(u, "ver_licencas_agregado") ? "agregada" : undefined;
    if (!visao) throw new ErroPermissao();
    // Minimização (LGPD): fora da visão completa, pessoas de outras áreas (ou todas, na agregada)
    // seguem só com id e área, para o rateio continuar fechando sem expor nome nem e-mail.
    const visivel = (c: Colaborador) => visao === "completa" || (visao === "area" && Boolean(u.area) && c.area === u.area);
    const colaboradores = estado.colaboradores.map((c) => (visivel(c) ? c : { id: c.id, email: "", nome: "", area: c.area, centroCusto: c.centroCusto, status: c.status, tipoConta: c.tipoConta }));
    return clone({
      visao,
      licencas: estado.licencas,
      movimentacoes: estado.movimentacoesLicenca,
      atribuicoes: estado.atribuicoesLicenca,
      colaboradores,
      cotacoes: estado.cotacoes,
      parametros: estado.parametros,
      orcamentos: estado.orcamentosFornecedor,
      linhas: estado.linhasTelefonicas,
      usosLinha: estado.usosLinha,
      // Nome e e-mail de quem ainda não tem licença: só na visão completa (LGPD).
      pendencias: visao === "completa" ? estado.pendenciasAtribuicao : [],
    });
  },
  async salvarLicenca(l, porId, compraInicial) {
    exigir(porId, "gerir_licencas");
    const erros = errosLicenca(l);
    if (l.contrato_id && !estado.contratos.some((c) => c.contrato_id === l.contrato_id)) erros.push("Contrato não encontrado.");
    if (!estado.fornecedores.some((f) => f.fornecedor_id === l.fornecedorId)) erros.push("Fornecedor não encontrado.");
    const chave = chaveLicenca(l.fornecedorId, l.produto, l.plano);
    if (estado.licencas.some((x) => x.id !== l.id && chaveLicenca(x.fornecedorId, x.produto, x.plano) === chave)) erros.push("Já existe licença deste fornecedor com o mesmo produto e plano.");
    const i = estado.licencas.findIndex((x) => x.id === l.id);
    if (i >= 0) {
      const ant = estado.licencas[i];
      const temMov = estado.movimentacoesLicenca.some((m) => m.licencaId === l.id);
      if (temMov && (ant.moeda !== l.moeda || ant.tipoCobranca !== l.tipoCobranca || ant.periodicidade !== l.periodicidade))
        erros.push("Moeda, tipo de cobrança e periodicidade não mudam depois de haver compras: cancele e cadastre uma nova licença.");
      if (erros.length) throw new ErroNegocio(erros.join(" "));
      const novo: Licenca = { ...l, status: ant.status, produto: l.produto.trim(), atualizadoEm: agora() };
      auditar(diffAuditoria(ant, novo, { entidade: "licenca", entidadeId: l.id, usuarioId: porId, data: agora(), acao: "Licença alterada" }, () => novoId("a")));
      estado.licencas[i] = novo;
      persistir();
      return clone(novo);
    }
    const novo: Licenca = { ...l, id: novoId("lic"), produto: l.produto.trim(), status: "Ativa", criadoEm: agora(), atualizadoEm: agora() };
    if (compraInicial) {
      const em = errosMovimentacao(novo, [], 0, { ...compraInicial, tipo: "Compra", quantidade: novo.tipoCobranca === "Assento" ? compraInicial.quantidade : 1 });
      erros.push(...em);
    }
    if (erros.length) throw new ErroNegocio(erros.join(" "));
    estado.licencas.push(novo);
    registrar("licenca", novo.id, porId, "Licença cadastrada", "produto", undefined, `${novo.produto}${novo.plano ? ` · ${novo.plano}` : ""}`);
    if (compraInicial) gravarMovimentacao(novo, { ...compraInicial, licencaId: novo.id, tipo: "Compra", quantidade: novo.tipoCobranca === "Assento" ? compraInicial.quantidade : 1 }, porId);
    persistir();
    return clone(novo);
  },
  async registrarMovimentacao(m, porId) {
    exigir(porId, "gerir_licencas");
    const l = getLicenca(m.licencaId);
    const movs = estado.movimentacoesLicenca.filter((x) => x.licencaId === l.id);
    const ativas = estado.atribuicoesLicenca.filter((a) => a.licencaId === l.id && a.status === "Ativa").length;
    const mm = { ...m, quantidade: m.tipo === "Compra" && l.tipoCobranca !== "Assento" ? 1 : m.quantidade };
    // Cancelamento encerra as atribuições junto; os demais tipos respeitam quem já tem assento.
    const erros = errosMovimentacao(l, movs, m.tipo === "Cancelamento" ? 0 : ativas, mm);
    if (erros.length) throw new ErroNegocio(erros.join(" "));
    const r = gravarMovimentacao(l, mm, porId);
    persistir();
    return clone(r);
  },
  async salvarColaborador(c, porId) {
    exigir(porId, "gerir_licencas");
    const email = c.email.trim().toLowerCase();
    if (!emailValido(email)) throw new ErroNegocio("Informe um e-mail corporativo válido: ele é a identidade da pessoa.");
    if (!c.nome.trim()) throw new ErroNegocio("Informe o nome.");
    const dom = dominiosDoGrupo(estado.parametros);
    const chave = chaveEmail(email, dom);
    if (estado.colaboradores.some((x) => x.id !== c.id && chaveEmail(x.email, dom) === chave)) throw new ErroNegocio("Já existe pessoa com este e-mail (considerando os domínios do grupo).");
    if (c.tipoConta === "Compartilhada") {
      const resp = estado.colaboradores.find((x) => x.id === c.responsavelId);
      if (!resp || resp.tipoConta !== "Pessoa") throw new ErroNegocio("Conta compartilhada precisa de uma pessoa responsável.");
    }
    const i = estado.colaboradores.findIndex((x) => x.id === c.id);
    const novo: Colaborador = { ...c, email, nome: c.nome.trim(), responsavelId: c.tipoConta === "Compartilhada" ? c.responsavelId : undefined };
    if (i >= 0) {
      const ant = estado.colaboradores[i];
      if (ant.status !== novo.status) throw new ErroNegocio("Use “Desligar” para registrar o desligamento.");
      auditar(diffAuditoria(ant, novo, { entidade: "colaborador", entidadeId: c.id, usuarioId: porId, data: agora(), acao: "Colaborador alterado" }, () => novoId("a")));
      estado.colaboradores[i] = novo;
    } else {
      novo.id = novoId("col");
      novo.status = "Ativo";
      estado.colaboradores.push(novo);
      registrar("colaborador", novo.id, porId, "Colaborador cadastrado", "email", undefined, novo.email);
    }
    persistir();
    return clone(novo);
  },
  async atribuirLicenca(licencaId, colaboradorId, dataInicio, porId) {
    exigir(porId, "gerir_licencas");
    const l = getLicenca(licencaId);
    const c = getColaborador(colaboradorId);
    if (!dataInicio) throw new ErroNegocio("Informe a data de início.");
    const erro = erroAtribuicao(l, estado.movimentacoesLicenca.filter((m) => m.licencaId === l.id), estado.atribuicoesLicenca, c);
    if (erro) throw new ErroNegocio(erro);
    const a: AtribuicaoLicenca = { id: novoId("atr"), licencaId, colaboradorId, status: "Ativa", dataInicio };
    estado.atribuicoesLicenca.push(a);
    registrar("licenca", licencaId, porId, "Licença atribuída", "colaborador", undefined, c.email);
    persistir();
    return clone(a);
  },
  async encerrarAtribuicao(id, dataFim, porId) {
    exigir(porId, "gerir_licencas");
    const a = estado.atribuicoesLicenca.find((x) => x.id === id);
    if (!a || a.status !== "Ativa") throw new ErroNegocio("Atribuição não encontrada.");
    if (!dataFim || dataFim < a.dataInicio) throw new ErroNegocio("A data de fim não pode ser anterior ao início.");
    a.status = "Encerrada";
    a.dataFim = dataFim;
    registrar("licenca", a.licencaId, porId, "Licença retirada", "colaborador", getColaborador(a.colaboradorId).email, undefined);
    persistir();
  },
  async resolverPendenciaAtribuicao(id, email, porId) {
    exigir(porId, "gerir_licencas");
    const p = estado.pendenciasAtribuicao.find((x) => x.id === id);
    if (!p || p.status !== "Aberta") throw new ErroNegocio("Pendência não encontrada ou já tratada.");
    const e = (email ?? p.email ?? "").trim();
    if (!e) throw new ErroNegocio("Informe o e-mail da pessoa.");
    if (!emailValido(e)) throw new ErroNegocio("E-mail inválido.");
    const k = chaveEmail(e, dominiosDoGrupo(estado.parametros));
    let c = estado.colaboradores.find((x) => chaveEmail(x.email, dominiosDoGrupo(estado.parametros)) === k);
    const l = getLicenca(p.licencaId);
    if (!c) {
      c = { id: novoId("col"), email: k, nome: p.nome, area: p.area, centroCusto: p.centroCusto, status: "Ativo", tipoConta: "Pessoa" };
      const erro = erroAtribuicao(l, estado.movimentacoesLicenca.filter((m) => m.licencaId === l.id), estado.atribuicoesLicenca, c);
      if (erro) throw new ErroNegocio(erro);
      estado.colaboradores.push(c);
    }
    const a = await mockApi.atribuirLicenca(l.id, c.id, p.dataInicio ?? hoje(), porId);
    Object.assign(p, { status: "Resolvida", email: k, atribuicaoId: a.id, resolvidoEm: agora(), resolvidoPorId: porId });
    registrar("licenca", l.id, porId, "Pendência de atribuição resolvida", "colaborador", undefined, k);
    persistir();
    return a;
  },
  async descartarPendenciaAtribuicao(id, observacao, porId) {
    exigir(porId, "gerir_licencas");
    const p = estado.pendenciasAtribuicao.find((x) => x.id === id);
    if (!p || p.status !== "Aberta") throw new ErroNegocio("Pendência não encontrada ou já tratada.");
    if (!observacao?.trim()) throw new ErroNegocio("Informe o motivo do descarte.");
    Object.assign(p, { status: "Descartada", observacao: observacao.trim(), resolvidoEm: agora(), resolvidoPorId: porId });
    registrar("licenca", p.licencaId, porId, "Pendência de atribuição descartada", "colaborador", p.email ?? p.nome, observacao.trim());
    persistir();
  },
  async desligarColaborador(colaboradorId, data, porId) {
    exigir(porId, "gerir_licencas");
    const c = getColaborador(colaboradorId);
    if (!data) throw new ErroNegocio("Informe a data do desligamento.");
    let licencas = 0;
    let linhas = 0;
    for (const a of estado.atribuicoesLicenca.filter((x) => x.colaboradorId === c.id && x.status === "Ativa")) (a.status = "Encerrada"), (a.dataFim = data < a.dataInicio ? a.dataInicio : data), licencas++;
    for (const u of estado.usosLinha.filter((x) => x.colaboradorId === c.id && x.status === "Ativa")) (u.status = "Encerrada"), (u.dataFim = data < u.dataInicio ? u.dataInicio : data), linhas++;
    c.status = "Desligado";
    c.dataDesligamento = data;
    registrar("colaborador", c.id, porId, `Desligamento: ${licencas} licença(s) e ${linhas} linha(s) encerradas`, "status", "Ativo", "Desligado");
    persistir();
    return { licencas, linhas };
  },
  async salvarCotacao(c, porId) {
    exigir(porId, "gerir_licencas");
    if (!c.data || !(c.ptaxVenda > 0)) throw new ErroNegocio("Informe a data e a PTAX de venda.");
    const i = estado.cotacoes.findIndex((x) => x.data === c.data);
    registrar("configuracao", "cotacao", porId, "Cotação PTAX registrada", c.data, i >= 0 ? String(estado.cotacoes[i].ptaxVenda) : undefined, String(c.ptaxVenda));
    if (i >= 0) estado.cotacoes[i] = { ...c };
    else estado.cotacoes.push({ ...c });
    persistir();
  },
  async salvarParametro(chave, valor, vigenteDesde, porId) {
    exigir(porId, "gerir_licencas");
    const erro = erroParametro(chave, valor);
    if (erro) throw new ErroNegocio(erro);
    if (!vigenteDesde) throw new ErroNegocio("Informe a partir de quando o valor vale.");
    const anterior = parametroNaData(estado.parametros, chave, vigenteDesde);
    // Histórico: cada valor vale a partir da sua data; o mesmo dia é corrigido no lugar.
    estado.parametros = estado.parametros.filter((p) => !(p.chave === chave && p.vigenteDesde === vigenteDesde));
    estado.parametros.push({ chave, valor: valor.trim(), vigenteDesde, atualizadoPorId: porId, atualizadoEm: agora() });
    registrar("configuracao", `parametro:${chave}`, porId, `Parâmetro alterado (vale desde ${vigenteDesde})`, chave, anterior, valor.trim());
    persistir();
  },
  async salvarOrcamento(o, porId) {
    exigir(porId, "gerir_licencas");
    if (!o.fornecedorId || !o.ano || !(o.valorBRL > 0)) throw new ErroNegocio("Informe fornecedor, ano e valor do orçamento.");
    const i = estado.orcamentosFornecedor.findIndex((x) => x.fornecedorId === o.fornecedorId && x.ano === o.ano);
    const novo = { ...o, id: i >= 0 ? estado.orcamentosFornecedor[i].id : novoId("orc") };
    registrar("configuracao", `orcamento:${o.fornecedorId}`, porId, `Orçamento ${o.ano}`, "valorBRL", i >= 0 ? String(estado.orcamentosFornecedor[i].valorBRL) : undefined, String(o.valorBRL));
    if (i >= 0) estado.orcamentosFornecedor[i] = novo;
    else estado.orcamentosFornecedor.push(novo);
    persistir();
    return clone(novo);
  },
  async previsualizarCsv(tipo, conteudo, porId) {
    exigir(porId, tipo === "contratosClientes" ? "editar_processo" : "gerir_licencas");
    return planejarImportacao(tipo, conteudo, contextoImportacao()).linhas;
  },
  async importarCsv(tipo, conteudo, porId) {
    exigir(porId, tipo === "contratosClientes" ? "editar_processo" : "gerir_licencas");
    const plano = planejarImportacao(tipo, conteudo, contextoImportacao());
    const ids = new Map<string, string>();
    const real = (id?: string) => (id ? ids.get(id) ?? id : id);
    for (const op of plano.operacoes) {
      if (op.tipo === "fornecedor") {
        const id = novoId("f");
        ids.set(op.id, id);
        estado.fornecedores.push({ fornecedor_id: id, razaoSocial: op.nome, nomeFantasia: op.nome, statusCadastral: "Potencial" });
      } else if (op.tipo === "licenca") {
        const id = novoId("lic");
        ids.set(op.licenca.id, id);
        const l = { ...op.licenca, id, fornecedorId: real(op.licenca.fornecedorId)!, criadoEm: agora(), atualizadoEm: agora() };
        estado.licencas.push(l);
        if (op.compra) estado.movimentacoesLicenca.push({ ...op.compra, id: novoId("mov"), licencaId: id, registradoPorId: porId, registradoEm: agora() });
      } else if (op.tipo === "colaborador") {
        const id = novoId("col");
        ids.set(op.colaborador.id, id);
        estado.colaboradores.push({ ...op.colaborador, id, responsavelId: real(op.colaborador.responsavelId) });
      } else if (op.tipo === "atribuicao") {
        estado.atribuicoesLicenca.push({ ...op.atribuicao, id: novoId("atr"), licencaId: real(op.atribuicao.licencaId)!, colaboradorId: real(op.atribuicao.colaboradorId)! });
      } else if (op.tipo === "movimentacao") {
        const l = getLicenca(real(op.movimentacao.licencaId)!);
        estado.movimentacoesLicenca.push({ ...op.movimentacao, id: novoId("mov"), licencaId: l.id, registradoPorId: porId, registradoEm: agora() });
        aposMovimentacao(l, op.movimentacao.tipo, op.movimentacao.data);
      } else if (op.tipo === "linha") {
        const id = novoId("tel");
        ids.set(op.linha.id, id);
        estado.linhasTelefonicas.push({ ...op.linha, id, criadoEm: agora(), atualizadoEm: agora() });
      } else if (op.tipo === "cliente") {
        const id = novoId("cl");
        ids.set(op.cliente.cliente_id, id);
        estado.clientes.push({ ...op.cliente, cliente_id: id });
        registrar("configuracao", id, porId, "Cliente cadastrado pela importação", "razaoSocial", undefined, op.cliente.razaoSocial);
      } else if (op.tipo === "contratoCliente") {
        const { status, confirmacoesPendentes, chaveImportacao: _chave, ...d } = op.contrato;
        const c = montarContratoCliente({ ...d, clienteId: real(d.clienteId)! }, porId);
        c.status = status;
        c.confirmacoesPendentes = confirmacoesPendentes;
        estado.contratos.push(c);
        registrar("contrato", c.contrato_id, porId, "Contrato de cliente importado", "status", undefined, status);
      } else if (op.tipo === "pendencia") {
        estado.pendenciasAtribuicao.push({ ...op.pendencia, id: novoId("pend"), licencaId: real(op.pendencia.licencaId)!, chave: op.pendencia.chave.replace(op.pendencia.licencaId, real(op.pendencia.licencaId)!), criadoEm: agora() });
      } else {
        estado.usosLinha.push({ ...op.uso, id: novoId("uso"), linhaId: real(op.uso.linhaId)!, colaboradorId: real(op.uso.colaboradorId)! });
      }
    }
    const conta = (s: string) => plano.linhas.filter((l) => l.situacao === s).length;
    const r = { importadas: conta("Importar"), jaExistiam: conta("Já existe"), recusadas: conta("Recusada"), conciliacao: conta("Conciliação"), linhas: plano.linhas };
    registrar(tipo === "linhas" ? "telefonia" : tipo === "contratosClientes" ? "contrato" : "licenca", `importacao:${tipo}`, porId, `Importação CSV (${tipo})`, "linhas", undefined, `${r.importadas} importadas, ${r.jaExistiam} já existiam, ${r.recusadas} recusadas, ${r.conciliacao} para conciliação`);
    persistir();
    return r;
  },
  async registrarExportacao(descricao, porId) {
    const u = usuario(porId);
    if (!usuarioPode(u, "gerir_licencas") && !usuarioPode(u, "ver_licencas_da_area") && !usuarioPode(u, "ver_licencas_agregado") && !usuarioPode(u, "visualizar")) throw new ErroPermissao();
    registrar("licenca", "exportacao", porId, "Exportação de dados", "arquivo", undefined, descricao);
    persistir();
  },
  async salvarLinha(l, porId) {
    exigir(porId, "gerir_licencas");
    const numero = somenteDigitosLinha(l.numero);
    const erros = errosLinha({ ...l, numero }, estado.linhasTelefonicas);
    if (l.contrato_id && !estado.contratos.some((c) => c.contrato_id === l.contrato_id)) erros.push("Contrato não encontrado.");
    if (erros.length) throw new ErroNegocio(erros.join(" "));
    const i = estado.linhasTelefonicas.findIndex((x) => x.id === l.id);
    const novo: LinhaTelefonica = { ...l, numero, operadora: l.operadora.trim(), atualizadoEm: agora(), criadoEm: i >= 0 ? estado.linhasTelefonicas[i].criadoEm : agora() };
    if (i >= 0) {
      auditar(diffAuditoria(estado.linhasTelefonicas[i], novo, { entidade: "telefonia", entidadeId: l.id, usuarioId: porId, data: agora(), acao: "Linha alterada" }, () => novoId("a")));
      estado.linhasTelefonicas[i] = novo;
    } else {
      novo.id = novoId("tel");
      estado.linhasTelefonicas.push(novo);
      registrar("telefonia", novo.id, porId, "Linha cadastrada", "numero", undefined, numero);
    }
    // Linha cancelada ou portada deixa de ter usuário (o histórico de uso fica).
    if (novo.situacao === "Cancelada" || novo.situacao === "Portada")
      for (const u of estado.usosLinha.filter((x) => x.linhaId === novo.id && x.status === "Ativa")) (u.status = "Encerrada"), (u.dataFim = hoje() < u.dataInicio ? u.dataInicio : hoje());
    persistir();
    return clone(novo);
  },
  async atribuirLinha(linhaId, colaboradorId, dataInicio, porId) {
    exigir(porId, "gerir_licencas");
    const l = estado.linhasTelefonicas.find((x) => x.id === linhaId);
    if (!l) throw new ErroNegocio("Linha não encontrada.");
    const c = getColaborador(colaboradorId);
    if (!dataInicio) throw new ErroNegocio("Informe a data de início.");
    const erro = erroUsoLinha(l, estado.usosLinha, c);
    if (erro) throw new ErroNegocio(erro);
    const u: UsoLinha = { id: novoId("uso"), linhaId, colaboradorId, status: "Ativa", dataInicio };
    estado.usosLinha.push(u);
    registrar("telefonia", linhaId, porId, "Linha entregue", "colaborador", undefined, c.email);
    persistir();
    return clone(u);
  },
  async encerrarUsoLinha(id, dataFim, porId) {
    exigir(porId, "gerir_licencas");
    const u = estado.usosLinha.find((x) => x.id === id);
    if (!u || u.status !== "Ativa") throw new ErroNegocio("Uso não encontrado.");
    if (!dataFim || dataFim < u.dataInicio) throw new ErroNegocio("A data de fim não pode ser anterior ao início.");
    u.status = "Encerrada";
    u.dataFim = dataFim;
    registrar("telefonia", u.linhaId, porId, "Linha devolvida", "colaborador", getColaborador(u.colaboradorId).email, undefined);
    persistir();
  },

  // ---------------------------------------------------------------- Derivados
  async listarAcoes() {
    await latencia();
    return acoes();
  },
  async listarAlertas(contrato_id) {
    const contratos = contrato_id ? estado.contratos.filter((c) => c.contrato_id === contrato_id) : estado.contratos;
    return contratos.flatMap((c) => gerarAlertas(c, estado.configuracao.regrasAlerta));
  },
  async obterIndicadores() {
    await latencia();
    const nome = <T,>(lista: T[], chave: keyof T, campo: keyof T) => {
      const m = new Map(lista.map((x) => [x[chave] as string, x[campo] as string]));
      return (id: string) => m.get(id) ?? "—";
    };
    return calcularIndicadores(
      estado.contratos,
      estado.processos,
      acoes(),
      {
        empresa: nome(estado.empresas, "id", "nome"),
        fornecedor: nome(estado.fornecedores, "fornecedor_id", "nomeFantasia"),
        tipo: nome(estado.tiposContrato, "id", "nome"),
        usuario: nome(estado.usuarios, "id", "nome"),
      },
      estado.configuracao.regrasAlerta,
    );
  },
  async listarAuditoria(entidadeId) {
    return clone(entidadeId ? estado.auditoria.filter((a) => a.entidadeId === entidadeId) : estado.auditoria.slice(0, 500));
  },

  // ---------------------------------------------------------------- Integrações
  async buscarDemandaJira(jira_key) {
    await latencia();
    // Sem integração real: a busca simulada só existe na demonstração.
    if (estado.modo === "real") return undefined;
    return jiraSimulado.buscarDemanda(jira_key);
  },

  async obterModoDados() {
    return estado.modo;
  },
  async iniciarBaseVazia(admin, porId) {
    if (estado.modo === "real") exigir(porId ?? "", "administrar");
    if (!admin.nome.trim() || !admin.email.trim()) throw new ErroNegocio("Informe nome e e-mail do administrador.");
    estado = criarEstadoVazio({ nome: admin.nome.trim(), email: admin.email.trim() });
    persistir();
  },
  async exportarBackup(porId) {
    exigir(porId, "administrar");
    return JSON.stringify({ formato: "akross-contratos-backup", geradoEm: agora(), estado }, null, 2);
  },
  async importarBackup(conteudo, porId) {
    exigir(porId, "administrar");
    let dados: { formato?: string; estado?: EstadoDados };
    try {
      dados = JSON.parse(conteudo);
    } catch {
      throw new ErroNegocio("Arquivo inválido: não é um backup do sistema.");
    }
    const e = dados.estado;
    if (dados.formato !== "akross-contratos-backup" || !e || !Array.isArray(e.contratos) || !Array.isArray(e.usuarios))
      throw new ErroNegocio("Arquivo inválido: não é um backup do sistema.");
    estado = completarEstado({ ...e, modo: e.modo ?? "real" });
    persistir();
    return { contratos: estado.contratos.length, processos: estado.processos.length };
  },
  async restaurarDadosDemonstracao(porId) {
    // Substituir dados reais por fictícios exige Administrador.
    if (estado.modo === "real") exigir(porId ?? "", "administrar");
    estado = criarEstadoInicial();
    persistir();
  },
};

// Operações que mudam o custo de licenças e linhas vinculadas passam pela guarda de saldo.
for (const k of ["salvarLicenca", "registrarMovimentacao", "salvarLinha", "importarCsv"] as const) {
  const original = mockApi[k] as (...a: unknown[]) => Promise<unknown>;
  (mockApi as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => comGuardaSaldo(() => original(...a));
}
