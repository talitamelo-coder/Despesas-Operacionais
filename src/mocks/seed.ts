import { addDias, anoDe, hoje } from "@/domain/datas";
import { gerarCodigo } from "@/domain/codigos";
import { aprovacoesPadrao } from "@/domain/rules/fluxo";
import { REGRAS_ALERTA_PADRAO } from "@/domain/rules/prazos";
import { baselineAjustado } from "@/domain/rules/saving";
import type {
  Configuracao,
  Contrato,
  Documento,
  Empresa,
  Fornecedor,
  ProcessoContratacao,
  RegistroAuditoria,
  TipoContrato,
  Usuario,
} from "@/domain/types";

/**
 * Dados de DEMONSTRAÇÃO — todos fictícios. Datas são relativas a "hoje" para que os
 * cenários (vencimento, renovação em risco etc.) continuem válidos em qualquer data.
 */

export type ModoDados = "demonstracao" | "real";

export interface EstadoDados {
  versao: number;
  /** "demonstracao": dados fictícios recriáveis. "real": dados do usuário — nunca descartados automaticamente. */
  modo: ModoDados;
  usuarios: Usuario[];
  empresas: Empresa[];
  fornecedores: Fornecedor[];
  tiposContrato: TipoContrato[];
  contratos: Contrato[];
  processos: ProcessoContratacao[];
  documentos: Documento[];
  auditoria: RegistroAuditoria[];
  configuracao: Configuracao;
}

export const VERSAO_SEED = 1;

// PRNG determinístico (mulberry32) — mesmos dados a cada geração.
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cnpjFicticio(base8: string, filial = "0001"): string {
  const b = base8 + filial;
  const calc = (s: string, pesos: number[]) => {
    const r = s.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(b, p1);
  const d2 = calc(b + d1, [6, ...p1]);
  return `${b}${d1}${d2}`;
}

const USUARIOS: Usuario[] = [
  { id: "u-admin", nome: "Marina Lopes", email: "marina.lopes@empresa.exemplo", perfil: "Administrador", cargo: "Administradora do sistema", ativo: true },
  { id: "u-sup1", nome: "Rafael Costa", email: "rafael.costa@empresa.exemplo", perfil: "Suprimentos", cargo: "Analista de Suprimentos Sr.", ativo: true },
  { id: "u-sup2", nome: "Juliana Prado", email: "juliana.prado@empresa.exemplo", perfil: "Suprimentos", cargo: "Analista de Suprimentos", ativo: true },
  { id: "u-sup3", nome: "Diego Martins", email: "diego.martins@empresa.exemplo", perfil: "Suprimentos", cargo: "Coordenador de Suprimentos", ativo: true },
  { id: "u-ges1", nome: "Carlos Mendes", email: "carlos.mendes@empresa.exemplo", perfil: "Gestor", cargo: "Gerente de TI", ativo: true },
  { id: "u-ges2", nome: "Fernanda Rocha", email: "fernanda.rocha@empresa.exemplo", perfil: "Gestor", cargo: "Gerente de Operações", ativo: true },
  { id: "u-ges3", nome: "Paulo Sérgio Lima", email: "paulo.lima@empresa.exemplo", perfil: "Gestor", cargo: "Gerente de Facilities", ativo: true },
  { id: "u-ges4", nome: "Beatriz Nunes", email: "beatriz.nunes@empresa.exemplo", perfil: "Gestor", cargo: "Gerente de Marketing", ativo: true },
  { id: "u-dir1", nome: "Roberto Almeida", email: "roberto.almeida@empresa.exemplo", perfil: "Gestor", cargo: "Diretor de Operações", diretor: true, ativo: true },
  { id: "u-dir2", nome: "Helena Vasconcelos", email: "helena.vasconcelos@empresa.exemplo", perfil: "Gestor", cargo: "Diretora Administrativo-Financeira", diretor: true, ativo: true },
  { id: "u-jur1", nome: "Luciana Ferraz", email: "luciana.ferraz@empresa.exemplo", perfil: "Juridico", cargo: "Advogada Corporativa", ativo: true },
];

const EMPRESAS: Empresa[] = [
  { id: "e-hold", nome: "Exemplo Holding S.A.", cnpj: cnpjFicticio("90123456"), ativo: true },
  { id: "e-serv", nome: "Exemplo Serviços Ltda", cnpj: cnpjFicticio("90234567"), ativo: true },
  { id: "e-tel", nome: "Exemplo Telecom Ltda", cnpj: cnpjFicticio("90345678"), ativo: true },
];

const TIPOS: TipoContrato[] = [
  { id: "t-ti", nome: "Serviços de TI", ativo: true },
  { id: "t-lic", nome: "Licenciamento de software", ativo: true },
  { id: "t-tel", nome: "Telecom e conectividade", ativo: true },
  { id: "t-fac", nome: "Facilities", ativo: true },
  { id: "t-cons", nome: "Consultoria", ativo: true },
  { id: "t-mkt", nome: "Marketing", ativo: true },
  { id: "t-log", nome: "Logística", ativo: true },
  { id: "t-loc", nome: "Locação", ativo: true },
];

const FORN: [string, string, string, string, string][] = [
  // id, razão social, nome fantasia, cidade, UF
  ["f-prisma", "Prisma Facilities Ltda", "Prisma Facilities", "São Paulo", "SP"],
  ["f-linksul", "LinkSul Telecomunicações S.A.", "LinkSul", "Porto Alegre", "RS"],
  ["f-vertice", "Vértice Segurança Patrimonial Ltda", "Vértice Segurança", "Campinas", "SP"],
  ["f-orbital", "Orbital Software Brasil Ltda", "Orbital Software", "Florianópolis", "SC"],
  ["f-dataforte", "DataForte Infraestrutura Ltda", "DataForte", "Barueri", "SP"],
  ["f-clara", "Clara Limpeza e Conservação Ltda", "Clara Limpeza", "São Paulo", "SP"],
  ["f-rota", "Rota Certa Logística Ltda", "Rota Certa", "Guarulhos", "SP"],
  ["f-atlas", "Atlas Licenciamento de Software Ltda", "Atlas Licenças", "Rio de Janeiro", "RJ"],
  ["f-global", "Global Seat Licensing Inc.", "Global Seat", "", ""],
  ["f-horizonte", "Horizonte Consultoria Empresarial Ltda", "Horizonte Consultoria", "Belo Horizonte", "MG"],
  ["f-pulso", "Pulso Marketing Digital Ltda", "Pulso Digital", "São Paulo", "SP"],
  ["f-sigma", "Sigma Telecom Serviços Ltda", "Sigma Telecom", "Recife", "PE"],
  ["f-brisa", "Brisa Climatização e Manutenção Ltda", "Brisa Climatização", "São Paulo", "SP"],
  ["f-pontoalto", "Ponto Alto Treinamentos Ltda", "Ponto Alto", "Curitiba", "PR"],
  ["f-eixo", "Eixo Engenharia Predial Ltda", "Eixo Engenharia", "São Paulo", "SP"],
  ["f-nexo", "Nexo Contact Center Ltda", "Nexo CX", "Salvador", "BA"],
  ["f-pixel", "Pixel Gráfica e Impressão Ltda", "Pixel Gráfica", "Osasco", "SP"],
  ["f-seloverde", "Selo Verde Gestão de Resíduos Ltda", "Selo Verde", "Jundiaí", "SP"],
  ["f-ancora", "Âncora Corretora de Seguros Ltda", "Âncora Seguros", "São Paulo", "SP"],
  ["f-mirante", "Mirante Locação de Equipamentos Ltda", "Mirante Locações", "Campinas", "SP"],
];

function fornecedores(): Fornecedor[] {
  return FORN.map(([id, razaoSocial, nomeFantasia, cidade, uf], i) => ({
    fornecedor_id: id,
    external_id: id === "f-global" ? undefined : `SA-${(10230 + i * 17).toString()}`,
    razaoSocial,
    nomeFantasia,
    cnpj: id === "f-global" ? undefined : cnpjFicticio(String(80100000 + i * 7311).padStart(8, "0")),
    codigoFornecedor: id === "f-global" ? "EXT-0091" : `F${(4100 + i * 13).toString()}`,
    cidade: cidade || undefined,
    uf: uf || undefined,
    statusCadastral: "Ativo",
  }));
}

export function criarEstadoInicial(): EstadoDados {
  const H = hoje();
  const agora = new Date().toISOString();
  const rnd = prng(20270415);
  const contratos: Contrato[] = [];
  const processos: ProcessoContratacao[] = [];
  const documentos: Documento[] = [];
  const auditoria: RegistroAuditoria[] = [];
  const seq: Record<string, number> = {};
  const codigo = (prefixo: "CT" | "PC", data: string) => {
    const ano = anoDe(data);
    const k = `${prefixo}-${ano}`;
    seq[k] = (seq[k] ?? 0) + 1;
    return gerarCodigo(prefixo, ano, seq[k]);
  };
  let docSeq = 0;
  const doc = (d: Omit<Documento, "id" | "versao" | "data"> & { versao?: number; diasAtras?: number }): void => {
    documentos.push({ id: `d-${++docSeq}`, versao: d.versao ?? 1, data: new Date(Date.now() - (d.diasAtras ?? 10) * 86400000).toISOString(), ...d });
  };

  const contrato = (c: Omit<Contrato, "codigo" | "criadoEm" | "atualizadoEm" | "origens" | "execucaoFinanceira"> & Partial<Pick<Contrato, "origens" | "execucaoFinanceira">>): Contrato => {
    const consumoPct = 0.2 + rnd() * 0.7;
    const valorBRL = c.condicoes.moeda === "BRL" ? c.condicoes.valorAnual : c.condicoes.valorAnual * (c.condicoes.cotacao?.valor ?? 1);
    const novo: Contrato = {
      codigo: codigo("CT", c.vigencia.dataInicio),
      criadoEm: agora,
      atualizadoEm: agora,
      origens: c.origens ?? { "vigencia.duracao": "calculado", valorAnualBRL: "calculado" },
      execucaoFinanceira: c.execucaoFinanceira ?? {
        pedido_id: c.status === "Vigente" ? `PED-${Math.floor(400000 + rnd() * 90000)}` : undefined,
        valorContratado: valorBRL,
        valorConsumido: Math.round(valorBRL * consumoPct),
        simulado: true,
      },
      ...c,
    };
    contratos.push(novo);
    return novo;
  };

  const comum = {
    reajuste: { possui: true, indice: "IPCA" as const, periodicidadeMeses: 12, percentualPrevisto: 4.5 },
    rescisao: { permite: true, possuiMulta: true, percentual: 10, regra: "10% sobre o saldo remanescente", avisoPrevioDias: 30 },
  };

  // ------------------------------------------------------------ 1. Vigente normal
  const cNormal = contrato({
    contrato_id: "c-normal",
    empresaId: "e-hold",
    fornecedorId: "f-prisma",
    objeto: "Serviços de limpeza e conservação predial — sede administrativa",
    tipoContratoId: "t-fac",
    gestorId: "u-ges3",
    diretorId: "u-dir2",
    analistaId: "u-sup2",
    centroCusto: "CC-1020 Facilities",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 684000, quantidade: 12, unidade: "meses", precoUnitario: 57000, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias após emissão da NF" },
    vigencia: { dataInicio: addDias(H, -200), dataFim: addDias(H, 530), tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 24 },
    reajuste: { ...comum.reajuste, dataBase: addDias(H, -200) },
    rescisao: comum.rescisao,
    saving: { tipoBaseline: "Proposta inicial", baselineAnual: 732000, valorNegociadoAnual: 684000, componentes: [{ origem: "Negociação de preço", valorAnual: 48000 }], origemOportunidade: "Suprimentos" },
  });
  doc({ contrato_id: cNormal.contrato_id, nome: `${cNormal.codigo}-contrato-assinado.pdf`, categoria: "Contrato assinado", usuarioId: "u-sup2", diasAtras: 200 });

  // ------------------------------------------------------------ 2. Renovação em andamento (cadeia de 3 contratos)
  const linkBase = { empresaId: "e-tel", fornecedorId: "f-linksul", objeto: "Link de dados MPLS e internet dedicada — 22 unidades", tipoContratoId: "t-tel", gestorId: "u-ges1", diretorId: "u-dir1", analistaId: "u-sup1", centroCusto: "CC-2040 Infraestrutura TI", projeto: "Expansão Nordeste" };
  const cLink1 = contrato({
    ...linkBase,
    contrato_id: "c-link-1",
    status: "Encerrado",
    condicoes: { moeda: "BRL", valorAnual: 1176000, quantidade: 20, unidade: "links", precoUnitario: 58800, periodicidadePagamento: "Mensal", condicaoPagamento: "28 dias" },
    vigencia: { dataInicio: addDias(H, -1020), dataFim: addDias(H, -656), tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    ...comum,
  });
  const cLink2 = contrato({
    ...linkBase,
    contrato_id: "c-link-2",
    contrato_anterior_id: cLink1.contrato_id,
    relacaoAnterior: "Renovação",
    status: "Encerrado",
    condicoes: { moeda: "BRL", valorAnual: 1188000, quantidade: 22, unidade: "links", precoUnitario: 54000, periodicidadePagamento: "Mensal", condicaoPagamento: "28 dias" },
    vigencia: { dataInicio: addDias(H, -655), dataFim: addDias(H, -291), tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    ...comum,
    saving: { tipoBaseline: "Contrato anterior", baselineAnual: 1293600, valorNegociadoAnual: 1188000, evidenciaBaseline: undefined, componentes: [{ origem: "Negociação de preço", valorAnual: 105600 }], origemOportunidade: "Suprimentos" },
  });
  cLink1.sucessor_id = cLink2.contrato_id;
  const cLink3 = contrato({
    ...linkBase,
    contrato_id: "c-link-3",
    contrato_anterior_id: cLink2.contrato_id,
    relacaoAnterior: "Renovação",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 1155000, quantidade: 22, unidade: "links", precoUnitario: 52500, periodicidadePagamento: "Mensal", condicaoPagamento: "28 dias" },
    vigencia: { dataInicio: addDias(H, -290), dataFim: addDias(H, 75), tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    reajuste: { ...comum.reajuste, dataBase: addDias(H, -290) },
    rescisao: comum.rescisao,
    saving: { tipoBaseline: "Contrato anterior", baselineAnual: 1188000, valorNegociadoAnual: 1155000, componentes: [{ origem: "Negociação de preço", valorAnual: 33000 }], origemOportunidade: "Suprimentos" },
    avaliacaoRenovacao: { desejaRenovar: "Sim", desejaSubstituir: "Não", desejaEncerrar: "Não", servicoNecessario: "Sim", quantidadePermanece: "Não", escopoPermanece: "Sim", problemaFornecedor: "Não", avaliarConcorrentes: "Sim", observacoes: "Incluir 3 novas unidades em Fortaleza. Avaliar ao menos um concorrente.", respondidoPorId: "u-ges1", respondidoEm: new Date(Date.now() - 12 * 86400000).toISOString() },
  });
  cLink2.sucessor_id = cLink3.contrato_id;
  doc({ contrato_id: cLink3.contrato_id, nome: `${cLink3.codigo}-contrato-assinado.pdf`, categoria: "Contrato assinado", usuarioId: "u-sup1", diasAtras: 290 });

  const pRenov: ProcessoContratacao = {
    processo_id: "p-renov-link",
    codigo: codigo("PC", addDias(H, -11)),
    tipo: "Renovação",
    status: "Em negociação",
    contrato_anterior_id: cLink3.contrato_id,
    ...linkBase,
    origemOportunidade: "Suprimentos",
    propostas: [
      { id: "pr-1", fornecedorId: "f-linksul", moeda: "BRL", propostaInicialAnual: 1155000, propostaFinalAnual: 1302000, observacao: "25 links (+3 Fortaleza) — contraproposta em análise" },
      { id: "pr-2", fornecedorId: "f-sigma", moeda: "BRL", propostaInicialAnual: 1387500, observacao: "Concorrente — 25 links" },
    ],
    propostaRecomendadaId: "pr-1",
    estrategiaSuprimentos: "Usar proposta da Sigma como referência; buscar preço unitário ≤ R$ 52.080 por link.",
    condicoes: { moeda: "BRL", quantidade: 25, unidade: "links", precoUnitario: 52080, valorAnual: 1302000, periodicidadePagamento: "Mensal", condicaoPagamento: "28 dias" },
    vigencia: { tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, dataInicio: addDias(H, 76), dataFim: addDias(H, 441), periodicidadeRenovacaoMeses: 12 },
    reajuste: { ...comum.reajuste },
    rescisao: { ...comum.rescisao },
    saving: {
      tipoBaseline: "Baseline ajustado",
      baselineAnual: 1155000 * (25 / 22),
      evidenciaBaseline: "Valor anterior proporcional a 25 links (preço unitário do contrato vigente)",
      valorNegociadoAnual: 1302000,
      componentes: [{ origem: "Negociação de preço", valorAnual: 1155000 * (25 / 22) - 1302000 }],
      origemOportunidade: "Suprimentos",
    },
    aprovacoes: [],
    juridico: { status: "Não iniciado" },
    assinatura: { status: "Não iniciada" },
    timeline: [
      { id: "tl-1", data: new Date(Date.now() - 12 * 86400000).toISOString(), usuarioId: "u-ges1", descricao: "Gestor respondeu a avaliação: deseja renovar", tipo: "sistema" },
      { id: "tl-2", data: new Date(Date.now() - 11 * 86400000).toISOString(), usuarioId: "u-sup1", descricao: `Processo de renovação criado a partir de ${cLink3.codigo}`, tipo: "status" },
      { id: "tl-3", data: new Date(Date.now() - 6 * 86400000).toISOString(), usuarioId: "u-sup1", descricao: "Status alterado para Em negociação", tipo: "status" },
    ],
    origens: { empresaId: "herdado", objeto: "herdado", gestorId: "herdado", diretorId: "herdado", centroCusto: "herdado", projeto: "herdado", tipoContratoId: "herdado", "condicoes.moeda": "herdado", "condicoes.condicaoPagamento": "herdado", reajuste: "herdado", rescisao: "herdado", "vigencia.avisoPrevioDias": "herdado", "saving.baselineAnual": "calculado" },
    criadoEm: new Date(Date.now() - 11 * 86400000).toISOString(),
    atualizadoEm: new Date(Date.now() - 2 * 86400000).toISOString(),
    criadoPorId: "u-sup1",
  };
  pRenov.saving!.baselineAnual = Math.round(pRenov.saving!.baselineAnual);
  pRenov.saving!.componentes[0].valorAnual = pRenov.saving!.baselineAnual - 1302000;
  processos.push(pRenov);
  doc({ processo_id: pRenov.processo_id, nome: "proposta-linksul-25-links.pdf", categoria: "Proposta", usuarioId: "u-sup1", diasAtras: 5 });
  doc({ processo_id: pRenov.processo_id, nome: "proposta-sigma-25-links.pdf", categoria: "Proposta", usuarioId: "u-sup1", diasAtras: 4 });

  // ------------------------------------------------------------ 3. Renovação automática em risco
  contrato({
    contrato_id: "c-auto-risco",
    empresaId: "e-serv",
    fornecedorId: "f-vertice",
    objeto: "Vigilância patrimonial 24x7 — centro de distribuição",
    tipoContratoId: "t-fac",
    gestorId: "u-ges2",
    diretorId: "u-dir1",
    analistaId: "u-sup3",
    centroCusto: "CC-3100 Operações CD",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 912000, quantidade: 4, unidade: "postos", precoUnitario: 228000, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { dataInicio: addDias(H, -265), dataFim: addDias(H, 100), tipoVigencia: "Prazo determinado", avisoPrevioDias: 90, renovacaoAutomatica: true, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    reajuste: { possui: true, indice: "Dissídio", periodicidadeMeses: 12, percentualPrevisto: 6, dataBase: addDias(H, -265) },
    rescisao: { permite: true, possuiMulta: true, percentual: 20, regra: "20% sobre 3 mensalidades", avisoPrevioDias: 90 },
  });

  // ------------------------------------------------------------ 4. Troca de fornecedor com saving
  const cBrisa = contrato({
    contrato_id: "c-brisa",
    empresaId: "e-hold",
    fornecedorId: "f-brisa",
    objeto: "Manutenção predial preventiva e corretiva (elétrica, hidráulica e climatização)",
    tipoContratoId: "t-fac",
    gestorId: "u-ges3",
    diretorId: "u-dir2",
    analistaId: "u-sup1",
    centroCusto: "CC-1020 Facilities",
    status: "Encerrado",
    condicoes: { moeda: "BRL", valorAnual: 1350000, quantidade: 12, unidade: "meses", periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { dataInicio: addDias(H, -760), dataFim: addDias(H, -31), tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30 },
    ...comum,
  });
  const cEixo = contrato({
    contrato_id: "c-eixo",
    contrato_anterior_id: cBrisa.contrato_id,
    relacaoAnterior: "Substituição",
    processo_id: "p-subst-eixo",
    empresaId: "e-hold",
    fornecedorId: "f-eixo",
    objeto: "Manutenção predial preventiva e corretiva (elétrica, hidráulica e climatização)",
    tipoContratoId: "t-fac",
    gestorId: "u-ges3",
    diretorId: "u-dir2",
    analistaId: "u-sup1",
    centroCusto: "CC-1020 Facilities",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 1000000, quantidade: 12, unidade: "meses", periodicidadePagamento: "Mensal", condicaoPagamento: "45 dias" },
    vigencia: { dataInicio: addDias(H, -30), dataFim: addDias(H, 700), tipoVigencia: "Prazo determinado", avisoPrevioDias: 90, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 24 },
    reajuste: { ...comum.reajuste, dataBase: addDias(H, -30) },
    rescisao: comum.rescisao,
    motivoSubstituicao: "Recorrência de atrasos em chamados corretivos (SLA 62% em 6 meses) e preço acima do mercado.",
    substituicao: { fornecedorAnteriorId: "f-brisa", valorAnteriorAnual: 1350000, origemOportunidade: "Suprimentos" },
    saving: {
      tipoBaseline: "Contrato anterior",
      baselineAnual: 1350000,
      valorNegociadoAnual: 1000000,
      componentes: [
        { origem: "Troca de fornecedor", valorAnual: 200000, descricao: "Diferença entre melhor proposta do incumbente e do novo fornecedor" },
        { origem: "Negociação de preço", valorAnual: 100000 },
        { origem: "Mudança de escopo", valorAnual: 50000, descricao: "Climatização do térreo passou a ser coberta pela garantia do fabricante" },
      ],
      origemOportunidade: "Suprimentos",
    },
    origens: { fornecedorId: "validado", objeto: "herdado", gestorId: "herdado", centroCusto: "herdado", "saving.baselineAnual": "herdado" },
  });
  cBrisa.sucessor_id = cEixo.contrato_id;
  processos.push({
    processo_id: "p-subst-eixo",
    codigo: codigo("PC", addDias(H, -120)),
    tipo: "Substituição de fornecedor",
    status: "Concluído",
    contrato_anterior_id: cBrisa.contrato_id,
    contrato_gerado_id: cEixo.contrato_id,
    empresaId: "e-hold",
    objeto: cEixo.objeto,
    gestorId: "u-ges3",
    diretorId: "u-dir2",
    analistaId: "u-sup1",
    centroCusto: "CC-1020 Facilities",
    tipoContratoId: "t-fac",
    origemOportunidade: "Suprimentos",
    motivoSubstituicao: cEixo.motivoSubstituicao,
    propostas: [
      { id: "pe-1", fornecedorId: "f-brisa", moeda: "BRL", propostaInicialAnual: 1420000, propostaFinalAnual: 1300000 },
      { id: "pe-2", fornecedorId: "f-eixo", moeda: "BRL", propostaInicialAnual: 1150000, propostaFinalAnual: 1000000 },
      { id: "pe-3", fornecedorPotencial: "Manutec Serviços Prediais", moeda: "BRL", propostaInicialAnual: 1210000 },
    ],
    propostaRecomendadaId: "pe-2",
    estrategiaSuprimentos: "Concorrência com 3 fornecedores e revisão de escopo de climatização.",
    justificativa: "Menor preço com SLA contratual de 4h para corretivas e penalidades.",
    condicoes: { ...cEixo.condicoes },
    vigencia: { ...cEixo.vigencia },
    reajuste: cEixo.reajuste,
    rescisao: cEixo.rescisao,
    saving: cEixo.saving,
    aprovacoes: [
      { papel: "Gestor", tipo: "Aprovação", status: "Aprovado", usuarioId: "u-ges3", data: new Date(Date.now() - 70 * 86400000).toISOString() },
      { papel: "Suprimentos", tipo: "Aprovação", status: "Aprovado", usuarioId: "u-sup1", data: new Date(Date.now() - 70 * 86400000).toISOString() },
      { papel: "Diretor", tipo: "Ciência", status: "Ciente", usuarioId: "u-dir2", data: new Date(Date.now() - 69 * 86400000).toISOString() },
    ],
    juridico: { status: "Parecer emitido", responsavelId: "u-jur1", parecer: "Minuta aprovada com ajuste na cláusula de SLA." },
    assinatura: { status: "Assinado", data: addDias(H, -35) },
    timeline: [{ id: "tl-e1", data: new Date(Date.now() - 34 * 86400000).toISOString(), usuarioId: "u-sup1", descricao: `Contrato ${cEixo.codigo} gerado`, tipo: "status" }],
    origens: {},
    criadoEm: new Date(Date.now() - 120 * 86400000).toISOString(),
    atualizadoEm: new Date(Date.now() - 34 * 86400000).toISOString(),
    criadoPorId: "u-sup1",
  });
  doc({ contrato_id: cEixo.contrato_id, nome: `${cEixo.codigo}-contrato-assinado.pdf`, categoria: "Contrato assinado", usuarioId: "u-sup1", diasAtras: 35 });
  doc({ processo_id: "p-subst-eixo", nome: "parecer-juridico-manutencao.pdf", categoria: "Parecer", usuarioId: "u-jur1", diasAtras: 45 });

  // ------------------------------------------------------------ 5. Em análise jurídica (nova contratação via JIRA)
  const pJur: ProcessoContratacao = {
    processo_id: "p-juridico-crm",
    codigo: codigo("PC", addDias(H, -48)),
    tipo: "Nova contratação",
    status: "Em análise jurídica",
    jira_key: "COMP-1244",
    demandaJira: {
      jira_key: "COMP-1244",
      solicitante: "Camila Duarte",
      empresa: "Exemplo Serviços Ltda",
      area: "Comercial",
      gestor: "Beatriz Nunes",
      descricao: "CRM para equipe comercial e pós-venda (150 usuários)",
      justificativa: "Planilhas atuais não permitem gestão de funil nem histórico do cliente.",
      quantidade: 150,
      valorEstimado: 540000,
      fornecedoresIndicados: ["Orbital Software Brasil Ltda", "Atlas Licenciamento de Software Ltda"],
      anexos: ["requisitos-crm.pdf"],
      criadoEm: new Date(Date.now() - 50 * 86400000).toISOString(),
    },
    validacao: { valorValidado: 468000, quantidadeValidada: 120, validadoPorId: "u-sup2", validadoEm: new Date(Date.now() - 45 * 86400000).toISOString(), observacao: "30 usuários eram de áreas que já possuem licença corporativa." },
    empresaId: "e-serv",
    objeto: "Licenciamento e implantação de CRM — 120 usuários",
    gestorId: "u-ges4",
    diretorId: "u-dir1",
    analistaId: "u-sup2",
    centroCusto: "CC-5010 Comercial",
    projeto: "Transformação Digital",
    tipoContratoId: "t-lic",
    origemOportunidade: "Área solicitante",
    propostas: [
      { id: "pj-1", fornecedorId: "f-orbital", moeda: "BRL", propostaInicialAnual: 498000, propostaFinalAnual: 432000 },
      { id: "pj-2", fornecedorId: "f-atlas", moeda: "BRL", propostaInicialAnual: 476000, propostaFinalAnual: 455000 },
      { id: "pj-3", fornecedorPotencial: "VendaMais CRM", moeda: "BRL", propostaInicialAnual: 510000 },
    ],
    propostaRecomendadaId: "pj-1",
    estrategiaSuprimentos: "Cotação com 3 fornecedores; negociação de implantação inclusa no 1º ano.",
    justificativa: "Melhor custo total e implantação inclusa; aderência de 94% aos requisitos.",
    condicoes: { moeda: "BRL", valorAnual: 432000, quantidade: 120, unidade: "usuários", precoUnitario: 3600, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { tipoVigencia: "Prazo determinado", dataInicio: addDias(H, 20), dataFim: addDias(H, 385), avisoPrevioDias: 60, renovacaoAutomatica: true, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    reajuste: { possui: true, indice: "IPCA", periodicidadeMeses: 12, percentualPrevisto: 4.5 },
    rescisao: { permite: true, possuiMulta: false, avisoPrevioDias: 60 },
    saving: { tipoBaseline: "Proposta inicial", baselineAnual: 498000, valorNegociadoAnual: 432000, componentes: [{ origem: "Negociação de preço", valorAnual: 66000 }], origemOportunidade: "Área solicitante" },
    aprovacoes: [
      { papel: "Gestor", tipo: "Aprovação", status: "Aprovado", usuarioId: "u-ges4", data: new Date(Date.now() - 9 * 86400000).toISOString() },
      { papel: "Suprimentos", tipo: "Aprovação", status: "Aprovado", usuarioId: "u-sup2", data: new Date(Date.now() - 9 * 86400000).toISOString() },
      { papel: "Diretor", tipo: "Ciência", status: "Ciente", usuarioId: "u-dir1", data: new Date(Date.now() - 8 * 86400000).toISOString() },
    ],
    juridico: { status: "Em análise", responsavelId: "u-jur1" },
    assinatura: { status: "Não iniciada" },
    timeline: [
      { id: "tl-j1", data: new Date(Date.now() - 48 * 86400000).toISOString(), usuarioId: "u-sup2", descricao: "Processo criado a partir do JIRA COMP-1244", tipo: "status" },
      { id: "tl-j2", data: new Date(Date.now() - 45 * 86400000).toISOString(), usuarioId: "u-sup2", descricao: "Demanda validada por Suprimentos (120 usuários, R$ 468.000)", tipo: "status" },
      { id: "tl-j3", data: new Date(Date.now() - 9 * 86400000).toISOString(), usuarioId: "u-sup2", descricao: "Aprovação comercial concluída", tipo: "aprovacao" },
      { id: "tl-j4", data: new Date(Date.now() - 7 * 86400000).toISOString(), usuarioId: "u-sup2", descricao: "Status alterado para Em análise jurídica", tipo: "status" },
    ],
    origens: { jira_key: "importado", "demandaJira": "importado", "validacao.valorValidado": "validado", "validacao.quantidadeValidada": "validado", empresaId: "validado", gestorId: "validado" },
    criadoEm: new Date(Date.now() - 48 * 86400000).toISOString(),
    atualizadoEm: new Date(Date.now() - 7 * 86400000).toISOString(),
    criadoPorId: "u-sup2",
  };
  processos.push(pJur);
  doc({ processo_id: pJur.processo_id, nome: "proposta-orbital-crm.pdf", categoria: "Proposta", usuarioId: "u-sup2", diasAtras: 20 });
  doc({ processo_id: pJur.processo_id, nome: "minuta-contrato-crm.docx", categoria: "Minuta", usuarioId: "u-sup2", diasAtras: 8 });
  doc({ processo_id: pJur.processo_id, nome: "minuta-contrato-crm.docx", categoria: "Minuta", versao: 2, usuarioId: "u-jur1", diasAtras: 3 });

  // ------------------------------------------------------------ 6. Encerrado
  contrato({
    contrato_id: "c-encerrado",
    empresaId: "e-serv",
    fornecedorId: "f-pixel",
    objeto: "Impressão de material promocional — campanha anual",
    tipoContratoId: "t-mkt",
    gestorId: "u-ges4",
    analistaId: "u-sup2",
    centroCusto: "CC-5020 Marketing",
    status: "Encerrado",
    condicoes: { moeda: "BRL", valorAnual: 145000, periodicidadePagamento: "Pagamento único", condicaoPagamento: "50% no pedido, 50% na entrega" },
    vigencia: { dataInicio: addDias(H, -425), dataFim: addDias(H, -60), tipoVigencia: "Prazo determinado", avisoPrevioDias: 30, renovacaoAutomatica: false, prazoGestorDias: 30 },
    reajuste: { possui: false },
    rescisao: { permite: true, possuiMulta: false },
    avaliacaoRenovacao: { desejaRenovar: "Não", desejaEncerrar: "Sim", servicoNecessario: "Não", observacoes: "Campanha descontinuada.", respondidoPorId: "u-ges4", respondidoEm: new Date(Date.now() - 100 * 86400000).toISOString() },
  });

  // ------------------------------------------------------------ 7. Moeda estrangeira
  contrato({
    contrato_id: "c-usd",
    empresaId: "e-hold",
    fornecedorId: "f-global",
    objeto: "Licenças SaaS de colaboração — 300 assentos",
    tipoContratoId: "t-lic",
    gestorId: "u-ges1",
    diretorId: "u-dir2",
    analistaId: "u-sup3",
    centroCusto: "CC-2010 Sistemas",
    projeto: "Transformação Digital",
    status: "Vigente",
    condicoes: {
      moeda: "USD",
      valorAnual: 108000,
      quantidade: 300,
      unidade: "assentos",
      precoUnitario: 360,
      periodicidadePagamento: "Anual",
      condicaoPagamento: "Cartão corporativo — cobrança anual antecipada",
      cotacao: { valor: 5.42, data: addDias(H, -150), fonte: "PTAX", observacao: "PTAX venda do dia da renovação" },
    },
    vigencia: { dataInicio: addDias(H, -150), dataFim: addDias(H, 215), tipoVigencia: "Prazo determinado", avisoPrevioDias: 30, renovacaoAutomatica: true, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    reajuste: { possui: false },
    rescisao: { permite: false, possuiMulta: false, regra: "Sem rescisão antecipada; cancelamento apenas na renovação" },
    saving: {
      tipoBaseline: "Contrato anterior",
      baselineAnual: Math.round(380 * 340 * 5.42),
      valorNegociadoAnual: Math.round(108000 * 5.42),
      componentes: [
        { origem: "Otimização de licenças", valorAnual: Math.round(40 * 380 * 5.42), descricao: "40 assentos inativos removidos" },
        { origem: "Negociação de preço", valorAnual: Math.round(20 * 300 * 5.42), descricao: "US$ 380 → US$ 360 por assento" },
      ],
      origemOportunidade: "Suprimentos",
    },
  });

  // ------------------------------------------------------------ 8. Reajuste evitado
  contrato({
    contrato_id: "c-reajuste",
    empresaId: "e-tel",
    fornecedorId: "f-dataforte",
    objeto: "Colocation e serviços gerenciados de datacenter",
    tipoContratoId: "t-ti",
    gestorId: "u-ges1",
    diretorId: "u-dir1",
    analistaId: "u-sup1",
    centroCusto: "CC-2040 Infraestrutura TI",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 1000000, quantidade: 12, unidade: "meses", periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { dataInicio: addDias(H, -60), dataFim: addDias(H, 670), tipoVigencia: "Prazo determinado", avisoPrevioDias: 120, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 24 },
    reajuste: { possui: true, indice: "IGP-M", dataBase: addDias(H, -60), periodicidadeMeses: 12, percentualPrevisto: 5 },
    rescisao: { permite: true, possuiMulta: true, percentual: 15, regra: "15% do saldo até o 12º mês", avisoPrevioDias: 120 },
    saving: {
      tipoBaseline: "Baseline ajustado",
      baselineAnual: baselineAjustado(1000000, 5),
      evidenciaBaseline: "Cláusula 9.2 do contrato anterior previa reajuste de 5% (IGP-M acumulado).",
      valorNegociadoAnual: 1000000,
      componentes: [{ origem: "Reajuste evitado", valorAnual: 50000 }],
      origemOportunidade: "Suprimentos",
    },
  });

  // ------------------------------------------------------------ Avaliação aberta (atenção)
  contrato({
    contrato_id: "c-aval-aberta",
    empresaId: "e-serv",
    fornecedorId: "f-rota",
    objeto: "Transporte de cargas fracionadas — rotas Sul e Sudeste",
    tipoContratoId: "t-log",
    gestorId: "u-ges2",
    diretorId: "u-dir1",
    analistaId: "u-sup3",
    centroCusto: "CC-3200 Logística",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 2340000, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias", quantidade: 12, unidade: "meses" },
    vigencia: { dataInicio: addDias(H, -255), dataFim: addDias(H, 110), tipoVigencia: "Prazo determinado", avisoPrevioDias: 90, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
    reajuste: { possui: true, indice: "IPCA", dataBase: addDias(H, -255), periodicidadeMeses: 12, percentualPrevisto: 4.5 },
    rescisao: comum.rescisao,
  });

  // ------------------------------------------------------------ Aditivo aguardando aprovação comercial
  const cNexo = contrato({
    contrato_id: "c-nexo",
    empresaId: "e-serv",
    fornecedorId: "f-nexo",
    objeto: "Operação de contact center receptivo — 80 posições",
    tipoContratoId: "t-ti",
    gestorId: "u-ges2",
    diretorId: "u-dir1",
    analistaId: "u-sup2",
    centroCusto: "CC-4010 Atendimento",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual: 3840000, quantidade: 80, unidade: "posições", precoUnitario: 48000, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { dataInicio: addDias(H, -400), dataFim: addDias(H, 330), tipoVigencia: "Prazo determinado", avisoPrevioDias: 90, renovacaoAutomatica: false, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 24 },
    reajuste: { possui: true, indice: "Dissídio", dataBase: addDias(H, -400), periodicidadeMeses: 12, percentualPrevisto: 5.5 },
    rescisao: comum.rescisao,
  });
  const pAditivo: ProcessoContratacao = {
    processo_id: "p-aditivo-nexo",
    codigo: codigo("PC", addDias(H, -15)),
    tipo: "Aditivo",
    status: "Aguardando aprovação comercial",
    contrato_anterior_id: cNexo.contrato_id,
    empresaId: "e-serv",
    objeto: "Aditivo — ampliação para 100 posições (Black Friday e Natal)",
    gestorId: "u-ges2",
    diretorId: "u-dir1",
    analistaId: "u-sup2",
    centroCusto: "CC-4010 Atendimento",
    tipoContratoId: "t-ti",
    origemOportunidade: "Gestor",
    propostas: [{ id: "pa-1", fornecedorId: "f-nexo", moeda: "BRL", propostaInicialAnual: 4800000, propostaFinalAnual: 4620000 }],
    propostaRecomendadaId: "pa-1",
    justificativa: "Pico sazonal previsto de 25% no volume de chamadas.",
    estrategiaSuprimentos: "Manter preço unitário com desconto por volume acima de 90 posições.",
    condicoes: { moeda: "BRL", valorAnual: 4620000, quantidade: 100, unidade: "posições", precoUnitario: 46200, periodicidadePagamento: "Mensal", condicaoPagamento: "30 dias" },
    vigencia: { ...cNexo.vigencia },
    reajuste: cNexo.reajuste,
    rescisao: cNexo.rescisao,
    saving: {
      tipoBaseline: "Baseline ajustado",
      baselineAnual: 4800000,
      evidenciaBaseline: "Preço unitário vigente (R$ 48.000) × 100 posições",
      valorNegociadoAnual: 4620000,
      componentes: [{ origem: "Negociação de preço", valorAnual: 180000 }],
      origemOportunidade: "Suprimentos",
    },
    aprovacoes: [],
    juridico: { status: "Não iniciado" },
    assinatura: { status: "Não iniciada" },
    timeline: [{ id: "tl-a1", data: new Date(Date.now() - 15 * 86400000).toISOString(), usuarioId: "u-sup2", descricao: `Processo de aditivo criado a partir de ${cNexo.codigo}`, tipo: "status" }],
    origens: { empresaId: "herdado", gestorId: "herdado", centroCusto: "herdado", tipoContratoId: "herdado", reajuste: "herdado", rescisao: "herdado" },
    criadoEm: new Date(Date.now() - 15 * 86400000).toISOString(),
    atualizadoEm: new Date(Date.now() - 1 * 86400000).toISOString(),
    criadoPorId: "u-sup2",
  };
  pAditivo.aprovacoes = aprovacoesPadrao(pAditivo).map((a) => (a.papel === "Suprimentos" ? { ...a, status: "Aprovado", data: new Date(Date.now() - 86400000).toISOString() } : a));
  processos.push(pAditivo);
  doc({ processo_id: pAditivo.processo_id, nome: "proposta-nexo-100-posicoes.pdf", categoria: "Proposta", usuarioId: "u-sup2", diasAtras: 6 });

  // ------------------------------------------------------------ Nova contratação aguardando validação de Suprimentos
  processos.push({
    processo_id: "p-validacao-ura",
    codigo: codigo("PC", addDias(H, -3)),
    tipo: "Nova contratação",
    status: "Validação de Suprimentos",
    jira_key: "COMP-1287",
    demandaJira: {
      jira_key: "COMP-1287",
      solicitante: "Tatiane Ribeiro",
      empresa: "Exemplo Serviços Ltda",
      area: "Atendimento",
      gestor: "Fernanda Rocha",
      descricao: "Plataforma de URA e discador para a central de atendimento (120 posições).",
      justificativa: "Contrato atual não suporta omnichannel e há meta de redução de TMA em 15%.",
      quantidade: 120,
      valorEstimado: 480000,
      fornecedoresIndicados: ["Nexo Contact Center Ltda", "Fala Mais Tecnologia"],
      anexos: ["escopo-ura.pdf", "volumetria-2026.xlsx"],
      criadoEm: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    empresaId: "e-serv",
    objeto: "Plataforma de URA e discador — central de atendimento",
    gestorId: "u-ges2",
    analistaId: "u-sup3",
    origemOportunidade: "Área solicitante",
    propostas: [],
    aprovacoes: [],
    juridico: { status: "Não iniciado" },
    assinatura: { status: "Não iniciada" },
    timeline: [{ id: "tl-v1", data: new Date(Date.now() - 3 * 86400000).toISOString(), usuarioId: "u-sup3", descricao: "Processo criado a partir do JIRA COMP-1287", tipo: "status" }],
    origens: { jira_key: "importado", empresaId: "importado", objeto: "importado", gestorId: "importado" },
    criadoEm: new Date(Date.now() - 3 * 86400000).toISOString(),
    atualizadoEm: new Date(Date.now() - 3 * 86400000).toISOString(),
    criadoPorId: "u-sup3",
  });

  // ------------------------------------------------------------ Volume: contratos adicionais para validar desempenho
  const objetos: [string, string, string[]][] = [
    ["t-ti", "Suporte técnico e sustentação de sistemas", ["f-orbital", "f-dataforte", "f-horizonte"]],
    ["t-lic", "Licenças de software corporativo", ["f-atlas", "f-orbital"]],
    ["t-tel", "Telefonia móvel corporativa", ["f-sigma", "f-linksul"]],
    ["t-fac", "Serviços de facilities", ["f-prisma", "f-clara", "f-eixo", "f-seloverde"]],
    ["t-cons", "Consultoria especializada", ["f-horizonte", "f-pontoalto"]],
    ["t-mkt", "Serviços de marketing e comunicação", ["f-pulso", "f-pixel"]],
    ["t-log", "Transporte e armazenagem", ["f-rota"]],
    ["t-loc", "Locação de equipamentos", ["f-mirante"]],
  ];
  const gestores = ["u-ges1", "u-ges2", "u-ges3", "u-ges4"];
  const analistas = ["u-sup1", "u-sup2", "u-sup3"];
  const projetos = [undefined, undefined, "Transformação Digital", "Expansão Nordeste", "Eficiência Operacional"];
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 140; i++) {
    const [tipo, objetoBase, forns] = pick(objetos);
    let inicio = addDias(H, -Math.floor(30 + rnd() * 700));
    const duracao = pick([365, 365, 730, 1095]);
    let fim = addDias(inicio, duracao);
    // Volume de fundo: deixa a janela de renovação (próximos 150 dias) para os cenários curados,
    // para que alertas e ações da demonstração continuem legíveis.
    const dias = Math.round((Date.parse(fim) - Date.parse(H)) / 86400000);
    if (dias >= 0 && dias < 150) {
      inicio = addDias(inicio, 180);
      fim = addDias(fim, 180);
    }
    // Poucos contratos de fundo dentro da janela de 90 dias, já com decisão do gestor registrada.
    const naJanela = i % 14 === 0;
    if (naJanela) {
      fim = addDias(H, 12 + (i / 14) * 8);
      inicio = addDias(fim, -365);
    }
    const encerrado = fim < H;
    const valorAnual = Math.round((40 + rnd() * 1500) * 1000);
    const temSaving = rnd() < 0.55;
    const baseline = Math.round(valorAnual * (1 + 0.03 + rnd() * 0.12));
    const origemSav = pick(["Negociação de preço", "Negociação de preço", "Consolidação", "Redução de volume", "Alteração do modelo comercial"] as const);
    contrato({
      contrato_id: `c-gen-${i + 1}`,
      empresaId: pick(EMPRESAS).id,
      fornecedorId: pick(forns),
      objeto: `${objetoBase} — lote ${String(i + 1).padStart(3, "0")}`,
      tipoContratoId: tipo,
      gestorId: pick(gestores),
      diretorId: pick(["u-dir1", "u-dir2"]),
      analistaId: pick(analistas),
      centroCusto: `CC-${1000 + Math.floor(rnd() * 50) * 10}`,
      projeto: pick(projetos),
      status: naJanela ? "Vigente" : encerrado ? (rnd() < 0.1 ? "Rescindido" : "Encerrado") : rnd() < 0.03 ? "Suspenso" : "Vigente",
      condicoes: { moeda: "BRL", valorAnual, periodicidadePagamento: pick(["Mensal", "Mensal", "Trimestral", "Anual"] as const), condicaoPagamento: pick(["30 dias", "28 dias", "45 dias"]) },
      vigencia: { dataInicio: inicio, dataFim: fim, tipoVigencia: "Prazo determinado", avisoPrevioDias: pick([30, 60, 90]), renovacaoAutomatica: !naJanela && rnd() < 0.2, prazoGestorDias: 30, periodicidadeRenovacaoMeses: 12 },
      reajuste: { possui: rnd() < 0.8, indice: pick(["IPCA", "IGP-M", "INPC"] as const), dataBase: inicio, periodicidadeMeses: 12, percentualPrevisto: Math.round((3 + rnd() * 4) * 10) / 10 },
      rescisao: { permite: true, possuiMulta: rnd() < 0.6, percentual: 10, avisoPrevioDias: 30 },
      avaliacaoRenovacao: naJanela
        ? { desejaRenovar: i % 28 === 0 ? "Não" : "Sim", desejaEncerrar: i % 28 === 0 ? "Sim" : "Não", desejaSubstituir: "Não", servicoNecessario: i % 28 === 0 ? "Não" : "Sim", respondidoPorId: "u-ges1", respondidoEm: new Date(Date.now() - 20 * 86400000).toISOString() }
        : undefined,
      saving: temSaving
        ? { tipoBaseline: "Proposta inicial", baselineAnual: baseline, valorNegociadoAnual: valorAnual, componentes: [{ origem: origemSav, valorAnual: baseline - valorAnual }], origemOportunidade: pick(["Suprimentos", "Suprimentos", "Gestor", "Área solicitante", "Diretoria"] as const) }
        : undefined,
      origens: { "*": "importado" },
    });
  }

  auditoria.push(
    { id: "a-1", entidade: "contrato", entidadeId: "c-eixo", usuarioId: "u-sup1", data: new Date(Date.now() - 34 * 86400000).toISOString(), acao: "Contrato gerado a partir do processo", campo: "status", valorNovo: "Vigente" },
    { id: "a-2", entidade: "contrato", entidadeId: "c-brisa", usuarioId: "u-sup1", data: new Date(Date.now() - 34 * 86400000).toISOString(), acao: "Contrato substituído", campo: "sucessor_id", valorAnterior: undefined, valorNovo: cEixo.codigo },
    { id: "a-3", entidade: "contrato", entidadeId: "c-link-3", usuarioId: "u-ges1", data: new Date(Date.now() - 12 * 86400000).toISOString(), acao: "Avaliação de renovação respondida", campo: "avaliacaoRenovacao.desejaRenovar", valorNovo: "Sim" },
    { id: "a-4", entidade: "processo", entidadeId: "p-juridico-crm", usuarioId: "u-sup2", data: new Date(Date.now() - 45 * 86400000).toISOString(), acao: "Demanda validada", campo: "validacao.valorValidado", valorAnterior: "540000", valorNovo: "468000" },
  );

  return {
    versao: VERSAO_SEED,
    modo: "demonstracao",
    usuarios: USUARIOS,
    empresas: EMPRESAS,
    fornecedores: fornecedores(),
    tiposContrato: TIPOS,
    contratos,
    processos,
    documentos,
    auditoria,
    configuracao: {
      regrasAlerta: { ...REGRAS_ALERTA_PADRAO },
      moedas: ["BRL", "USD", "EUR"],
      periodicidades: ["Mensal", "Trimestral", "Semestral", "Anual", "Pagamento único"],
      fontesCotacao: ["PTAX", "Cartão de crédito", "Taxa contratual", "Cotação fornecedor", "Outro"],
      indicesReajuste: ["IPCA", "IGP-M", "INPC", "IPC-Fipe", "Dissídio", "Outro"],
      origensSaving: [
        "Negociação de preço",
        "Troca de fornecedor",
        "Reajuste evitado",
        "Redução de volume",
        "Otimização de licenças",
        "Mudança de escopo",
        "Consolidação",
        "Alteração do modelo comercial",
        "Negociação cambial",
        "Cancelamento de custo",
        "Outro",
      ],
      origensOportunidade: ["Suprimentos", "Gestor", "Área solicitante", "Diretoria", "Financeiro", "Outro"],
      listasAuxiliares: {
        "Motivos de substituição": ["Desempenho/SLA", "Preço acima do mercado", "Descontinuidade do fornecedor", "Mudança de tecnologia", "Outro"],
        "Motivos de encerramento": ["Serviço não necessário", "Substituído", "Rescisão por inadimplemento", "Outro"],
        Projetos: ["Transformação Digital", "Expansão Nordeste", "Eficiência Operacional"],
      },
    },
  };
}

/**
 * Base vazia para uso com dados reais: mantém só listas/parâmetros e tipos de contrato,
 * e cria o primeiro Administrador (quem iniciou a base).
 */
export function criarEstadoVazio(admin: { nome: string; email: string }): EstadoDados {
  const demo = criarEstadoInicial();
  return {
    versao: VERSAO_SEED,
    modo: "real",
    usuarios: [{ id: "u-admin", nome: admin.nome, email: admin.email, perfil: "Administrador", cargo: "Administrador do sistema", ativo: true }],
    empresas: [],
    fornecedores: [],
    tiposContrato: demo.tiposContrato,
    contratos: [],
    processos: [],
    documentos: [],
    auditoria: [],
    configuracao: { ...demo.configuracao, listasAuxiliares: { ...demo.configuracao.listasAuxiliares, Projetos: [] } },
  };
}
