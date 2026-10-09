import { gerarCodigo, proximoSequencial } from "@/domain/codigos";
import { anoDe, hoje } from "@/domain/datas";
import { somenteDigitos } from "@/domain/formatacao";
import { calcularAcoes } from "@/domain/rules/acoes";
import { gerarAlertas } from "@/domain/rules/alertas";
import { diffAuditoria } from "@/domain/rules/auditoria";
import { aprovacoesPadrao, etapasDoProcesso, processoAtivo, propostaRecomendada, proximoStatus, requisitosPara, valorNegociado } from "@/domain/rules/fluxo";
import { fornecedorMascarado, normalizarFornecedor, validarFornecedor } from "@/domain/rules/fornecedor";
import { herdarDeContrato } from "@/domain/rules/heranca";
import { gerarCredencial, usuarioPublico, validarUsuario } from "@/domain/rules/usuario";
import { calcularIndicadores } from "@/domain/rules/indicadores";
import { pode } from "@/domain/rules/permissoes";
import { validarSaving } from "@/domain/rules/saving";
import type { Contrato, Documento, Fornecedor, ProcessoContratacao, RegistroAuditoria, TipoProcesso, Usuario } from "@/domain/types";
import { jiraSimulado } from "@/integrations/jira";
import { criarEstadoInicial, criarEstadoVazio, VERSAO_SEED, type EstadoDados } from "@/mocks/seed";
import { ErroNegocio, ErroPermissao, type ContratosApi } from "../api";
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
      if (e.modo === "real") return e;
      if (e.versao === VERSAO_SEED) return { ...e, modo: "demonstracao" };
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

function exigir(porId: string, permissao: Parameters<typeof pode>[1]): Usuario {
  const u = usuario(porId);
  if (!pode(u.perfil, permissao)) throw new ErroPermissao();
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

function acoes() {
  return calcularAcoes({
    contratos: estado.contratos,
    processos: estado.processos,
    regras: estado.configuracao.regrasAlerta,
    juridicoPadraoId: estado.usuarios.find((u) => u.perfil === "Juridico")?.id,
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
    const u: Usuario = { ...dados, nome: dados.nome.trim(), email, credencial };
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
    auditar(diffAuditoria(c, novo, { entidade: "contrato", entidadeId: id, usuarioId: porId, data: agora(), acao: "Contrato alterado" }, () => novoId("a")));
    Object.assign(c, novo);
    persistir();
    return clone(c);
  },
  async registrarAvaliacaoRenovacao(id, avaliacao, porId) {
    const u = exigir(porId, "avaliar_renovacao");
    const c = getContrato(id);
    if (u.perfil === "Gestor" && c.gestorId !== u.id && !u.diretor) throw new ErroPermissao("Apenas o gestor do contrato pode responder a avaliação.");
    if (c.avaliacaoRenovacao?.respondidoEm) throw new ErroNegocio("A avaliação deste contrato já foi respondida.");
    c.avaliacaoRenovacao = { ...avaliacao, respondidoPorId: porId, respondidoEm: agora() };
    c.atualizadoEm = agora();
    registrar("contrato", id, porId, "Avaliação de renovação respondida", "avaliacaoRenovacao", undefined, JSON.stringify(avaliacao));

    // Decisão => novo processo (renovação/substituição) para Suprimentos. Lembretes ao gestor param.
    let processo: ProcessoContratacao | undefined;
    const tipo: TipoProcesso | undefined =
      avaliacao.desejaSubstituir === "Sim" ? "Substituição de fornecedor" : avaliacao.desejaRenovar === "Sim" ? "Renovação" : undefined;
    const jaAberto = estado.processos.some((p) => p.contrato_anterior_id === id && processoAtivo(p));
    if (tipo && !jaAberto) {
      processo = { ...processoVazio(tipo, porId), ...herdarDeContrato(c, tipo, () => novoId("pr")) };
      processo.origemOportunidade = "Gestor";
      if (tipo === "Substituição de fornecedor")
        processo.motivoSubstituicao = avaliacao.problemaFornecedor === "Sim" ? `Problema com fornecedor: ${avaliacao.observacoes ?? ""}`.trim() : undefined;
      processo.status = etapasDoProcesso(processo)[1]; // já entra com Suprimentos
      if (requisitosPara(processo.status, processo, []).length) processo.status = "Rascunho";
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
  async importarContratos(registros, porId) {
    exigir(porId, "importar_planilha");
    const codigos: string[] = [];
    const porNome = <T extends { nome?: string }>(lista: T[], nome: string) => lista.find((x) => x.nome?.toLowerCase() === nome.toLowerCase());
    for (const r of registros) {
      let empresa = porNome(estado.empresas, r.empresa);
      if (!empresa) estado.empresas.push((empresa = { id: novoId("e"), nome: r.empresa, cnpj: "", ativo: true }));
      let forn = estado.fornecedores.find((f) => f.cnpj && somenteDigitos(f.cnpj) === r.cnpj);
      if (!forn) estado.fornecedores.push((forn = { fornecedor_id: novoId("f"), razaoSocial: r.fornecedor, nomeFantasia: r.fornecedor, cnpj: r.cnpj, statusCadastral: "Ativo" }));
      let gestor = porNome(estado.usuarios, r.gestor);
      if (!gestor) {
        // Gestor citado na planilha e ainda não cadastrado: cria o usuário (e-mail a completar na Administração).
        gestor = { id: novoId("u"), nome: r.gestor, email: "", perfil: "Gestor", ativo: true };
        estado.usuarios.push(gestor);
        registrar("configuracao", gestor.id, porId, "Usuário criado pela importação", "nome", undefined, gestor.nome);
      }
      const analista = (r.analista && porNome(estado.usuarios, r.analista)) || usuario(porId);
      const tipo = (r.tipo && estado.tiposContrato.find((t) => t.nome.toLowerCase() === r.tipo!.toLowerCase())) || estado.tiposContrato[0];
      const c: Contrato = {
        contrato_id: novoId("c"),
        codigo: codigoNovo("CT", r.dataInicio),
        external_id: r.codigo,
        empresaId: empresa.id,
        fornecedorId: forn.fornecedor_id,
        objeto: r.objeto,
        tipoContratoId: tipo.id,
        gestorId: gestor.id,
        analistaId: analista.id,
        centroCusto: r.centroCusto,
        projeto: r.projeto,
        status: r.dataFim < hoje() ? "Encerrado" : "Vigente",
        condicoes: { moeda: r.moeda, valorAnual: r.valorAnual, periodicidadePagamento: "Mensal", condicaoPagamento: "" },
        vigencia: { dataInicio: r.dataInicio, dataFim: r.dataFim, tipoVigencia: "Prazo determinado", avisoPrevioDias: r.avisoPrevioDias, renovacaoAutomatica: r.renovacaoAutomatica, prazoGestorDias: estado.configuracao.regrasAlerta.prazoGestorPadraoDias },
        reajuste: { possui: false },
        rescisao: { permite: true, possuiMulta: false },
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
    const destino = proximoStatus(p);
    if (!destino) throw new ErroNegocio("Não há próxima etapa para este processo.");
    const docs = estado.documentos.filter((d) => d.processo_id === id);
    if (destino === "Concluído" && p.saving) {
      const erros = validarSaving(p.saving);
      if (erros.length) return { ok: false, pendencias: erros.map((m) => ({ campo: "saving", mensagem: m })) };
    }
    const pendencias = requisitosPara(destino, p, docs);
    if (pendencias.length) return { ok: false, pendencias };

    const anterior = p.status;
    p.status = destino;
    if (destino === "Aguardando aprovação comercial") p.aprovacoes = aprovacoesPadrao(p);
    if (destino === "Em análise jurídica") p.juridico = { ...p.juridico, status: "Em análise", responsavelId: p.juridico.responsavelId ?? estado.usuarios.find((u) => u.perfil === "Juridico")?.id };
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
    if (a.usuarioId !== porId && u.perfil !== "Administrador") throw new ErroPermissao("Esta aprovação está atribuída a outro usuário.");
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
    estado = { ...e, modo: e.modo ?? "real" };
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
