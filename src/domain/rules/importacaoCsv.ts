import { dataBR, lerCsv, normalizarTexto, numeroBR } from "./csv";
import { aplicarMovimentacao, chaveEmail, emailValido, errosLicenca, errosMovimentacao, posicaoNaData, valorAnualOriginal } from "./licencas";
import { temPerfil } from "./permissoes";
import { errosContratoReceita } from "./receita";
import { errosLinha, somenteDigitosLinha } from "./telefonia";
import type {
  AtribuicaoLicenca,
  Cliente,
  Colaborador,
  Contrato,
  Empresa,
  Fornecedor,
  Licenca,
  LinhaTelefonica,
  Moeda,
  PendenciaAtribuicao,
  MovimentacaoLicenca,
  TipoMovimentacao,
  StatusContrato,
  TipoReceita,
  Usuario,
  UsoLinha,
  ValoresReceita,
  Vigencia,
} from "../types";

/**
 * Importação por CSV: modelo para download, pré-visualização, validação linha a linha e
 * importação idempotente (reimportar o mesmo arquivo não duplica nem altera totais).
 * A mesma função monta a pré-visualização na tela e o plano executado pela API.
 */

export type TipoImportacao = "licencas" | "atribuicoes" | "movimentacoes" | "linhas" | "contratosClientes";

/** Nome da aba de uma planilha com várias cargas (ex.: "Licenças", "Atribuições"). */
export const ABA_DO_TIPO: Record<TipoImportacao, string> = { licencas: "Licenças", atribuicoes: "Atribuições", movimentacoes: "Movimentações", linhas: "Linhas", contratosClientes: "Contratos de clientes" };

export const MODELOS_CSV: Record<TipoImportacao, { titulo: string; colunas: string[]; exemplo: string[][]; ajuda: string }> = {
  licencas: {
    titulo: "Licenças",
    colunas: ["fornecedor", "produto", "plano", "categoria", "utilizacao", "tipo_cobranca", "moeda", "periodicidade", "vencimento_tipo", "data_vencimento", "contrato_codigo", "area", "centro_custo", "responsavel", "justificativa_manutencao", "substituto_possivel", "risco_troca", "limite_consumo_mensal", "assentos_iniciais", "preco_unitario", "data_compra"],
    exemplo: [
      ["Fornecedor Exemplo Ltda", "Ferramenta X", "Business", "Colaboração", "Chat e reuniões", "assento", "USD", "mensal", "mensal", "", "CT-2026-0001", "Tecnologia", "CC-100", "Nome do responsável", "Uso diário por toda a empresa", "Ferramenta Y", "Migração de histórico", "", "50", "12,50", "2026-01-10"],
    ],
    ajuda: "Uma linha por licença (fornecedor + produto + plano). Assentos, preço e data da compra criam a primeira compra. Fornecedor pelo CNPJ ou nome; se não existir, entra como pré-cadastro.",
  },
  atribuicoes: {
    titulo: "Atribuições (quem usa)",
    colunas: ["email", "nome", "area", "centro_custo", "tipo_conta", "responsavel_email", "fornecedor", "produto", "plano", "data_inicio"],
    exemplo: [["ana.lima@empresa.com.br", "Ana Lima", "Tecnologia", "CC-100", "pessoa", "", "Fornecedor Exemplo Ltda", "Ferramenta X", "Business", "2026-01-10"]],
    ajuda: "Uma linha por pessoa e licença. O e-mail é a identidade: linhas sem e-mail vão para a fila de conciliação. Sem assento livre, a linha é recusada.",
  },
  movimentacoes: {
    titulo: "Movimentações (compras, reduções, renegociações, cancelamentos)",
    colunas: ["fornecedor", "produto", "plano", "tipo", "data", "quantidade", "preco_unitario", "responsavel", "referencia_pedido", "observacao"],
    exemplo: [["Fornecedor Exemplo Ltda", "Ferramenta X", "Business", "compra", "2026-04-01", "10", "12,50", "Nome do responsável", "PED-123", "Contratação do time novo"]],
    ajuda: "tipo: compra, reducao, renegociacao ou cancelamento. Na renegociação, informe o novo preço unitário.",
  },
  linhas: {
    titulo: "Linhas telefônicas",
    colunas: ["numero", "operadora", "plano", "franquia", "valor_mensal", "situacao", "contrato_codigo", "area", "centro_custo", "email_usuario", "data_inicio"],
    exemplo: [["11987654321", "Operadora Exemplo", "Corporativo 20 GB", "20 GB", "79,90", "ativa", "", "Comercial", "CC-200", "ana.lima@empresa.com.br", "2026-01-10"]],
    ajuda: "Uma linha por número (com DDD). O e-mail do usuário precisa estar cadastrado em Pessoas ou vir antes no arquivo de atribuições.",
  },
  contratosClientes: {
    titulo: "Contratos de clientes",
    colunas: ["cliente", "cliente_cnpj", "objeto", "numero_contrato_cliente", "empresa", "gestor", "data_inicio", "data_fim", "renovacao_automatica", "aviso_previo_dias", "tipo_receita", "moeda", "valor_mensal_fixo", "valor_mensal_variavel_estimado", "valor_total_contratado", "novo_valor_fixo", "novo_valor_a_partir_de", "situacao", "observacao"],
    exemplo: [["Cliente Exemplo S.A.", "", "Plataforma WiFi", "4600000001", "", "Nome do gestor", "2025-01-01", "2027-12-31", "nao", "60", "fixa", "BRL", "100000,00", "", "3600000,00", "95000,00", "2026-11-01", "vigente", "Texto livre"]],
    ajuda: "Uma linha por contrato. data_fim vazia ou “indeterminado” = prazo indeterminado (revisão anual). tipo_receita: fixa, variavel ou fixa + variavel. O gestor precisa estar cadastrado com o perfil Gestor. Sem data de início, o contrato entra com pendência para completar. Cliente inexistente é cadastrado (complete o CNPJ depois). Saldo e notas emitidas não vêm do arquivo: chegam do Contas a receber.",
  },
};

/** Contrato de cliente montado pela importação; a API grava como em registrarContratoCliente. */
export interface ContratoClienteImportado {
  clienteId: string;
  empresaId: string;
  gestorId: string;
  objeto: string;
  external_id?: string;
  moeda: Moeda;
  vigencia: Vigencia;
  receita: ValoresReceita;
  status: StatusContrato;
  observacoes?: string;
  confirmacoesPendentes?: string[];
  chaveImportacao: string;
}

export interface ContextoImportacao {
  hoje: string;
  fornecedores: Fornecedor[];
  contratos: (Pick<Contrato, "contrato_id" | "codigo"> & Partial<Pick<Contrato, "natureza" | "clienteId" | "objeto" | "external_id">>)[];
  /** Contratos de clientes. */
  clientes?: Cliente[];
  usuarios?: Usuario[];
  empresas?: Empresa[];
  licencas: Licenca[];
  movimentacoes: MovimentacaoLicenca[];
  atribuicoes: AtribuicaoLicenca[];
  colaboradores: Colaborador[];
  dominios: string[];
  linhas: LinhaTelefonica[];
  usos: UsoLinha[];
  /** Fila de usuários de licença pendentes (idempotência da importação). */
  pendencias?: PendenciaAtribuicao[];
}

/** Operações planejadas — ids "novo:*" referem-se a registros criados por linhas anteriores do arquivo. */
export type OperacaoImportacao =
  | { tipo: "fornecedor"; id: string; nome: string }
  | { tipo: "licenca"; licenca: Licenca; compra?: Omit<MovimentacaoLicenca, "id" | "registradoPorId" | "registradoEm"> }
  | { tipo: "colaborador"; colaborador: Colaborador }
  | { tipo: "atribuicao"; atribuicao: AtribuicaoLicenca }
  | { tipo: "movimentacao"; movimentacao: Omit<MovimentacaoLicenca, "id" | "registradoPorId" | "registradoEm"> }
  | { tipo: "linha"; linha: LinhaTelefonica }
  | { tipo: "uso"; uso: UsoLinha }
  | { tipo: "pendencia"; pendencia: PendenciaAtribuicao }
  | { tipo: "cliente"; cliente: Cliente }
  | { tipo: "contratoCliente"; contrato: ContratoClienteImportado };

export type SituacaoLinhaCsv = "Importar" | "Já existe" | "Recusada" | "Conciliação";

export interface LinhaPrevia {
  linha: number;
  situacao: SituacaoLinhaCsv;
  resumo: string;
  motivo?: string;
  dados: Record<string, string>;
}

export interface PlanoImportacao {
  linhas: LinhaPrevia[];
  operacoes: OperacaoImportacao[];
}

const opcao = <T extends string>(v: string, mapa: Record<string, T>): T | undefined => mapa[normalizarTexto(v).replace(/ /g, "_")];

const TIPO_COBRANCA = { assento: "Assento", por_assento: "Assento", fixo: "Fixo", valor_fixo: "Fixo", consumo: "Consumo", por_consumo: "Consumo" } as const;
const PERIODICIDADE = { mensal: "Mensal", anual: "Anual" } as const;
const VENCIMENTO = { data: "Data", mensal: "Mensal", sob_demanda: "Sob demanda", sobdemanda: "Sob demanda" } as const;
const MOEDA = { brl: "BRL", usd: "USD" } as const;
const TIPO_MOV: Record<string, TipoMovimentacao> = { compra: "Compra", reducao: "Redução", downgrade: "Redução", renegociacao: "Renegociação", cancelamento: "Cancelamento" };
const SITUACAO_LINHA = { ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada", portada: "Portada" } as const;
const TIPO_RECEITA: Record<string, TipoReceita> = { fixa: "Fixa", fixo: "Fixa", variavel: "Variável", fixavariavel: "Fixa + variável", fixovariavel: "Fixa + variável" };
const SITUACAO_CONTRATO = { vigente: "Vigente", cancelado: "Cancelado", encerrado: "Encerrado", suspenso: "Suspenso" } as const;
const SIM = new Set(["sim", "s", "yes", "automatica", "x", "1"]);

/** Chave de idempotência do contrato de cliente: número do contrato no cliente ou cliente + objeto. */
export function chaveContratoCliente(clienteId: string, objeto: string, numero?: string): string {
  return numero?.trim() ? `${clienteId}|n:${normalizarTexto(numero)}` : `${clienteId}|o:${normalizarTexto(objeto)}`;
}

export function acharCliente(ref: string, clientes: Cliente[]): Cliente | undefined {
  const dig = ref.replace(/\D/g, "");
  if (dig.length >= 11) {
    const c = clientes.find((x) => x.cnpj && x.cnpj.replace(/\D/g, "") === dig);
    if (c) return c;
  }
  const n = normalizarTexto(ref);
  return clientes.find((c) => normalizarTexto(c.razaoSocial) === n || normalizarTexto(c.nomeFantasia) === n);
}

/** Gestor pelo nome completo, nome de exibição ou e-mail. Precisa estar ativo e ter o perfil Gestor. */
export function acharGestor(ref: string, usuarios: Usuario[]): Usuario | undefined {
  const n = normalizarTexto(ref);
  if (!n) return undefined;
  return usuarios.find((u) => u.ativo && temPerfil(u, "Gestor") && [u.nome, u.nomeExibicao, u.email].some((x) => x && normalizarTexto(x) === n));
}

export function chaveLicenca(fornecedorId: string, produto: string, plano?: string): string {
  return `${fornecedorId}|${normalizarTexto(produto)}|${normalizarTexto(plano)}`;
}

export function acharFornecedor(ref: string, fornecedores: Fornecedor[]): Fornecedor | undefined {
  const dig = ref.replace(/\D/g, "");
  if (dig.length >= 11) {
    const f = fornecedores.find((x) => x.cnpj && x.cnpj.replace(/\D/g, "") === dig);
    if (f) return f;
  }
  const n = normalizarTexto(ref);
  return fornecedores.find((f) => normalizarTexto(f.razaoSocial) === n || normalizarTexto(f.nomeFantasia) === n);
}

function linhaDeTotal(r: Record<string, string>): boolean {
  return Object.values(r).some((v) => /^total\b/i.test(v.trim()));
}

/** Pré-visualização + plano. Simula o arquivo inteiro em ordem (assentos, pessoas e duplicados). */
export function planejarImportacao(tipo: TipoImportacao, texto: string, ctx: ContextoImportacao): PlanoImportacao {
  const registros = lerCsv(texto);
  const linhas: LinhaPrevia[] = [];
  const operacoes: OperacaoImportacao[] = [];
  // Estado simulado (o que já existe + o que as linhas anteriores do arquivo criam).
  const fornecedores = [...ctx.fornecedores];
  const licencas = [...ctx.licencas];
  const movs = [...ctx.movimentacoes];
  const atribs = [...ctx.atribuicoes];
  const colabs = [...ctx.colaboradores];
  const linhasTel = [...ctx.linhas];
  const usos = [...ctx.usos];
  const clientes = [...(ctx.clientes ?? [])];
  const pendencias = [...(ctx.pendencias ?? [])];
  const contratosNovos: string[] = [];
  let n = 0;
  const novoId = (p: string) => `novo:${p}:${++n}`;

  const resolverFornecedor = (ref: string): { id: string; novo?: string } | undefined => {
    if (!ref.trim()) return undefined;
    const f = acharFornecedor(ref, fornecedores);
    if (f) return { id: f.fornecedor_id };
    const id = novoId("f");
    fornecedores.push({ fornecedor_id: id, razaoSocial: ref.trim(), nomeFantasia: ref.trim(), statusCadastral: "Potencial" });
    operacoes.push({ tipo: "fornecedor", id, nome: ref.trim() });
    return { id, novo: ref.trim() };
  };
  const acharLicenca = (r: Record<string, string>) => {
    const f = acharFornecedor(r.fornecedor ?? "", fornecedores);
    if (!f) return undefined;
    const k = chaveLicenca(f.fornecedor_id, r.produto ?? "", r.plano);
    return licencas.find((l) => chaveLicenca(l.fornecedorId, l.produto, l.plano) === k);
  };
  const acharColab = (email: string) => {
    const k = chaveEmail(email, ctx.dominios);
    return colabs.find((c) => chaveEmail(c.email, ctx.dominios) === k);
  };
  // Código do sistema (CT-…) ou o código da planilha de carga (external_id, ex.: "121/AKR").
  const contratoPorCodigo = (cod?: string) => (cod ? ctx.contratos.find((c) => [c.codigo, c.external_id].some((x) => x && x.toLowerCase() === cod.trim().toLowerCase())) : undefined);

  registros.forEach((r, i) => {
    const linha = i + 2; // linha 1 = cabeçalho
    const previa = (situacao: SituacaoLinhaCsv, resumo: string, motivo?: string) => linhas.push({ linha, situacao, resumo, motivo, dados: r });
    if (linhaDeTotal(r)) return previa("Recusada", "Linha de total", "Totais são calculados pelo sistema; linha ignorada.");

    if (tipo === "licencas") {
      const resumo = [r.fornecedor, r.produto, r.plano].filter(Boolean).join(" · ");
      const erros: string[] = [];
      const tc = opcao(r.tipo_cobranca ?? "", TIPO_COBRANCA);
      const per = opcao(r.periodicidade ?? "", PERIODICIDADE);
      const ven = opcao(r.vencimento_tipo ?? "", VENCIMENTO);
      const moeda = opcao(r.moeda ?? "", MOEDA);
      if (!r.fornecedor) erros.push("fornecedor vazio");
      if (!tc) erros.push("tipo_cobranca inválido (assento, fixo ou consumo)");
      if (!per) erros.push("periodicidade inválida (mensal ou anual)");
      if (!ven) erros.push("vencimento_tipo inválido (data, mensal ou sob_demanda)");
      if (!moeda) erros.push("moeda inválida (BRL ou USD)");
      const dv = dataBR(r.data_vencimento);
      if (dv === "invalida") erros.push("data_vencimento inválida");
      const contrato = contratoPorCodigo(r.contrato_codigo);
      if (r.contrato_codigo && !contrato) erros.push(`contrato ${r.contrato_codigo} não encontrado`);
      const limite = numeroBR(r.limite_consumo_mensal);
      const assentos = numeroBR(r.assentos_iniciais);
      const preco = numeroBR(r.preco_unitario);
      const dc = dataBR(r.data_compra);
      if ([limite, assentos, preco].some((x) => Number.isNaN(x))) erros.push("número inválido");
      if (assentos !== undefined && (preco === undefined || !dc || dc === "invalida")) erros.push("compra inicial precisa de assentos, preco_unitario e data_compra");
      if (erros.length) return previa("Recusada", resumo, erros.join("; "));
      if (acharLicenca(r)) return previa("Já existe", resumo, "Licença já cadastrada (fornecedor + produto + plano).");
      const forn = resolverFornecedor(r.fornecedor)!;
      const l: Licenca = {
        id: novoId("l"), fornecedorId: forn.id, contrato_id: contrato?.contrato_id, produto: r.produto, plano: r.plano || undefined, categoria: r.categoria || undefined,
        utilizacao: r.utilizacao || undefined, tipoCobranca: tc!, moeda: moeda!, periodicidade: per!, vencimentoTipo: ven!, dataVencimento: dv && dv !== "invalida" ? dv : undefined,
        area: r.area || undefined, centroCusto: r.centro_custo || undefined, responsavel: r.responsavel || undefined, justificativaManutencao: r.justificativa_manutencao || undefined,
        substitutoPossivel: r.substituto_possivel || undefined, riscoTroca: r.risco_troca || undefined, limiteConsumoMensal: limite, status: "Ativa", criadoEm: ctx.hoje, atualizadoEm: ctx.hoje,
      };
      // Data de vencimento faltando não impede a carga: a licença entra “A completar” (alerta na tela).
      const semVencimento = l.vencimentoTipo === "Data" && !l.dataVencimento;
      const el = errosLicenca(l).filter((x) => !(semVencimento && /data de vencimento/.test(x)));
      if (el.length) {
        if (forn.novo) operacoes.pop(), fornecedores.pop();
        return previa("Recusada", resumo, el.join(" "));
      }
      let compra: Extract<OperacaoImportacao, { tipo: "licenca" }>["compra"];
      if (assentos !== undefined) {
        const m = { licencaId: l.id, tipo: "Compra" as const, data: dc!, quantidade: tc === "Assento" ? assentos : 1, precoUnitario: preco!, responsavel: r.responsavel || "Importação" };
        const em = errosMovimentacao(l, [], 0, m);
        if (em.length) {
          if (forn.novo) operacoes.pop(), fornecedores.pop();
          return previa("Recusada", resumo, em.join(" "));
        }
        compra = { ...m, valorAnualAntes: 0, valorAnualDepois: valorAnualOriginal(aplicarMovimentacao([], m), l.periodicidade) };
        movs.push({ ...compra, id: novoId("m"), registradoPorId: "", registradoEm: "" });
      }
      licencas.push(l);
      operacoes.push({ tipo: "licenca", licenca: l, compra });
      const avisos = [forn.novo && `Fornecedor "${forn.novo}" será pré-cadastrado.`, semVencimento && "Entra sem data de vencimento: complete na licença."].filter(Boolean);
      return previa("Importar", resumo, avisos.join(" ") || undefined);
    }

    if (tipo === "atribuicoes") {
      const resumo = `${r.email || r.nome || "(sem e-mail)"} → ${[r.produto, r.plano].filter(Boolean).join(" · ")}`;
      const l = acharLicenca(r);
      if (!l) return previa("Recusada", resumo, "licença não encontrada (importe as licenças primeiro)");
      const di = dataBR(r.data_inicio) ?? ctx.hoje;
      if (di === "invalida") return previa("Recusada", resumo, "data_inicio inválida");
      // Sem e-mail ou sem assento: vai para a fila de pendências (Licenças → Pessoas), que fica gravada.
      const paraFila = (motivo: PendenciaAtribuicao["motivo"], texto: string) => {
        const chave = `${l.id}|${r.email ? chaveEmail(r.email, ctx.dominios) : `nome:${normalizarTexto(r.nome)}`}`;
        if (pendencias.some((p) => p.chave === chave && p.status === "Aberta")) return previa("Já existe", resumo, "já está na fila de pendências");
        const p: PendenciaAtribuicao = { id: novoId("p"), licencaId: l.id, email: r.email ? chaveEmail(r.email, ctx.dominios) : undefined, nome: r.nome?.trim() || r.email?.split("@")[0] || "(sem nome)", area: r.area || undefined, centroCusto: r.centro_custo || undefined, motivo, status: "Aberta", dataInicio: di, chave, criadoEm: ctx.hoje };
        pendencias.push(p);
        operacoes.push({ tipo: "pendencia", pendencia: p });
        return previa("Conciliação", resumo, `${texto}: vai para a fila de pendências (Licenças → Pessoas).`);
      };
      if (!r.email) return paraFila("Sem e-mail", "Sem e-mail");
      if (!emailValido(r.email)) return previa("Recusada", resumo, "e-mail inválido");
      let c = acharColab(r.email);
      if (c?.status === "Desligado") return previa("Recusada", resumo, "colaborador desligado");
      const ativas = atribs.filter((a) => a.licencaId === l.id && a.status === "Ativa");
      if (c && ativas.some((a) => a.colaboradorId === c!.id)) return previa("Já existe", resumo, "pessoa já tem esta licença");
      if (l.tipoCobranca === "Assento") {
        const assentos = posicaoNaData(movs.filter((m) => m.licencaId === l.id), "9999-12-31").assentos;
        if (ativas.length >= assentos) return paraFila("Sem assento livre", `Sem assento livre (${ativas.length} de ${assentos})`);
      }
      if (l.status === "Cancelada") return previa("Recusada", resumo, "licença cancelada");
      let aviso: string | undefined;
      if (!c) {
        const tipoConta = normalizarTexto(r.tipo_conta) === "compartilhada" ? "Compartilhada" : "Pessoa";
        const resp = r.responsavel_email ? acharColab(r.responsavel_email) : undefined;
        if (tipoConta === "Compartilhada" && !resp) return previa("Recusada", resumo, "conta compartilhada precisa de responsavel_email já cadastrado");
        c = { id: novoId("c"), email: chaveEmail(r.email, ctx.dominios), nome: r.nome?.trim() || r.email.split("@")[0], area: r.area || undefined, centroCusto: r.centro_custo || undefined, status: "Ativo", tipoConta, responsavelId: resp?.id };
        colabs.push(c);
        operacoes.push({ tipo: "colaborador", colaborador: c });
        aviso = "Pessoa nova será cadastrada.";
      }
      const a: AtribuicaoLicenca = { id: novoId("a"), licencaId: l.id, colaboradorId: c.id, status: "Ativa", dataInicio: di };
      atribs.push(a);
      operacoes.push({ tipo: "atribuicao", atribuicao: a });
      return previa("Importar", resumo, aviso);
    }

    if (tipo === "movimentacoes") {
      const resumo = `${r.tipo} · ${[r.produto, r.plano].filter(Boolean).join(" · ")} · ${r.data}`;
      const tm = TIPO_MOV[normalizarTexto(r.tipo).replace(/ /g, "")];
      if (!tm) return previa("Recusada", resumo, "tipo inválido (compra, reducao, renegociacao ou cancelamento)");
      const l = acharLicenca(r);
      if (!l) return previa("Recusada", resumo, "licença não encontrada");
      const data = dataBR(r.data);
      if (!data || data === "invalida") return previa("Recusada", resumo, "data inválida");
      const quantidade = numeroBR(r.quantidade);
      const precoUnitario = numeroBR(r.preco_unitario);
      if (Number.isNaN(quantidade) || Number.isNaN(precoUnitario)) return previa("Recusada", resumo, "número inválido");
      const chave = [l.id, tm, data, quantidade ?? "", precoUnitario ?? "", normalizarTexto(r.referencia_pedido)].join("|");
      if (movs.some((m) => m.chaveImportacao === chave)) return previa("Já existe", resumo, "movimentação já importada");
      const daLicenca = movs.filter((m) => m.licencaId === l.id);
      const ativas = atribs.filter((a) => a.licencaId === l.id && a.status === "Ativa").length;
      const m = { licencaId: l.id, tipo: tm, data, quantidade: tm === "Compra" && l.tipoCobranca !== "Assento" ? 1 : quantidade, precoUnitario, responsavel: r.responsavel, referenciaPedido: r.referencia_pedido || undefined, observacao: r.observacao || undefined };
      // Cancelamento encerra as atribuições; por isso não é bloqueado por pessoas com assento.
      const erros = errosMovimentacao(l, daLicenca, tm === "Cancelamento" ? 0 : ativas, m);
      if (erros.length) return previa("Recusada", resumo, erros.join(" "));
      const antes = valorAnualOriginal(posicaoNaData(daLicenca, "9999-12-31").lotes, l.periodicidade);
      const depois = valorAnualOriginal(aplicarMovimentacao(posicaoNaData(daLicenca, "9999-12-31").lotes, m), l.periodicidade);
      const mov = { ...m, valorAnualAntes: antes, valorAnualDepois: depois, chaveImportacao: chave };
      movs.push({ ...mov, id: novoId("m"), registradoPorId: "", registradoEm: "" });
      operacoes.push({ tipo: "movimentacao", movimentacao: mov });
      return previa("Importar", resumo);
    }

    if (tipo === "contratosClientes") return planejarContratoCliente(r, ctx, { clientes, contratosNovos, novoId, operacoes, previa });

    // linhas telefônicas
    const numero = somenteDigitosLinha(r.numero ?? "");
    const resumo = `${r.numero} · ${r.operadora}`;
    const situacao = r.situacao ? opcao(r.situacao, SITUACAO_LINHA) : "Ativa";
    if (!situacao) return previa("Recusada", resumo, "situacao inválida (ativa, suspensa, cancelada ou portada)");
    if (linhasTel.some((x) => x.numero === numero)) return previa("Já existe", resumo, "linha já cadastrada");
    const valor = numeroBR(r.valor_mensal);
    const contrato = contratoPorCodigo(r.contrato_codigo);
    if (r.contrato_codigo && !contrato) return previa("Recusada", resumo, `contrato ${r.contrato_codigo} não encontrado`);
    const l: LinhaTelefonica = {
      id: novoId("t"), numero, operadora: r.operadora?.trim() ?? "", plano: r.plano || undefined, franquia: r.franquia || undefined, valorMensal: valor as number, situacao,
      contrato_id: contrato?.contrato_id, area: r.area || undefined, centroCusto: r.centro_custo || undefined, chaveImportacao: numero, criadoEm: ctx.hoje, atualizadoEm: ctx.hoje,
    };
    const erros = errosLinha({ ...l, valorMensal: Number.isNaN(valor) ? undefined : valor }, linhasTel);
    if (erros.length) return previa("Recusada", resumo, erros.join(" "));
    let aviso: string | undefined;
    let uso: UsoLinha | undefined;
    if (r.email_usuario) {
      const c = acharColab(r.email_usuario);
      if (!c) aviso = `Usuário ${r.email_usuario} não cadastrado: linha entra sem usuário.`;
      else if (c.status === "Desligado") aviso = "Usuário desligado: linha entra sem usuário.";
      else if (situacao === "Ativa" || situacao === "Suspensa") {
        const di = dataBR(r.data_inicio);
        uso = { id: novoId("u"), linhaId: l.id, colaboradorId: c.id, status: "Ativa", dataInicio: di && di !== "invalida" ? di : ctx.hoje };
      }
    }
    linhasTel.push(l);
    operacoes.push({ tipo: "linha", linha: l });
    if (uso) usos.push(uso), operacoes.push({ tipo: "uso", uso });
    return previa("Importar", resumo, aviso);
  });
  return { linhas, operacoes };
}

interface EstadoPlanoCliente {
  clientes: Cliente[];
  /** Chaves dos contratos criados por linhas anteriores do arquivo. */
  contratosNovos: string[];
  novoId: (p: string) => string;
  operacoes: OperacaoImportacao[];
  previa: (situacao: SituacaoLinhaCsv, resumo: string, motivo?: string) => void;
}

function planejarContratoCliente(r: Record<string, string>, ctx: ContextoImportacao, e: EstadoPlanoCliente): void {
  const resumo = [r.cliente, r.objeto].filter(Boolean).join(" · ") || "(linha vazia)";
  const erros: string[] = [];
  const avisos: string[] = [];
  const pendentes: string[] = [];
  if (!r.cliente?.trim()) erros.push("cliente vazio");
  if (!r.objeto?.trim()) erros.push("objeto vazio");
  const gestor = acharGestor(r.gestor ?? "", ctx.usuarios ?? []);
  if (!gestor) erros.push(r.gestor?.trim() ? `gestor “${r.gestor.trim()}” não encontrado com perfil Gestor (cadastre em Administração → Usuários)` : "gestor vazio");
  const empresas = ctx.empresas ?? [];
  const empresa = r.empresa?.trim() ? empresas.find((x) => normalizarTexto(x.nome) === normalizarTexto(r.empresa)) : empresas[0];
  if (!empresa) erros.push(r.empresa?.trim() ? `empresa “${r.empresa.trim()}” não encontrada` : "nenhuma empresa do grupo cadastrada");
  const tipoReceita = TIPO_RECEITA[normalizarTexto(r.tipo_receita).replace(/[^a-z]/g, "")];
  if (!tipoReceita) erros.push("tipo_receita inválido (fixa, variavel ou fixa + variavel)");
  const moeda = (r.moeda?.trim() ? r.moeda.trim().toUpperCase() : "BRL") as ContratoClienteImportado["moeda"];
  if (!["BRL", "USD", "EUR"].includes(moeda)) erros.push("moeda inválida (BRL, USD ou EUR)");
  const situacao = r.situacao?.trim() ? opcao(r.situacao, SITUACAO_CONTRATO) : "Vigente";
  if (!situacao) erros.push("situacao inválida (vigente, cancelado, encerrado ou suspenso)");
  const di = dataBR(r.data_inicio);
  const indeterminado = !r.data_fim?.trim() || /^indeterminad/.test(normalizarTexto(r.data_fim));
  const df = indeterminado ? undefined : dataBR(r.data_fim);
  const dn = dataBR(r.novo_valor_a_partir_de);
  if (di === "invalida") erros.push("data_inicio inválida");
  if (df === "invalida") erros.push("data_fim inválida (data ou “indeterminado”)");
  if (dn === "invalida") erros.push("novo_valor_a_partir_de inválida");
  const num = (v?: string) => (v && /^n\/?a$/i.test(v.trim()) ? undefined : numeroBR(v));
  const fixo = num(r.valor_mensal_fixo);
  const variavel = num(r.valor_mensal_variavel_estimado);
  const total = num(r.valor_total_contratado);
  const novoFixo = num(r.novo_valor_fixo);
  const aviso = numeroBR(r.aviso_previo_dias);
  if ([fixo, variavel, total, novoFixo, aviso].some((x) => Number.isNaN(x))) erros.push("número inválido");
  if (erros.length) return e.previa("Recusada", resumo, erros.join("; "));

  let cliente = acharCliente(r.cliente_cnpj || r.cliente, e.clientes) ?? acharCliente(r.cliente, e.clientes);
  const clienteNovo = !cliente;
  if (!cliente) {
    const nome = r.cliente.trim();
    const dig = (r.cliente_cnpj ?? "").replace(/\D/g, "");
    cliente = { cliente_id: e.novoId("cl"), razaoSocial: nome, nomeFantasia: nome, cnpj: dig.length === 14 ? dig : undefined, statusCadastral: "Ativo" };
  }
  const chave = chaveContratoCliente(cliente.cliente_id, r.objeto, r.numero_contrato_cliente);
  const existe = ctx.contratos.some((c) => c.natureza === "Receita" && c.clienteId && chaveContratoCliente(c.clienteId, c.objeto ?? "", c.external_id) === chave) || e.contratosNovos.includes(chave);
  if (existe) return e.previa("Já existe", resumo, "Contrato já registrado (mesmo cliente e número, ou mesmo cliente e objeto).");

  const receita: ValoresReceita = { tipoReceita: tipoReceita!, valorTotalContratado: total || undefined };
  if (tipoReceita !== "Variável") receita.valorMensalFixo = fixo;
  if (tipoReceita !== "Fixa") receita.valorMensalVariavelEstimado = variavel;
  // Planilha legada costuma ter um só valor para "fixa + variável": entra no fixo e fica pendente de separar.
  if (tipoReceita === "Fixa + variável" && fixo === undefined && variavel !== undefined) (receita.valorMensalFixo = variavel), (receita.valorMensalVariavelEstimado = undefined);
  if (tipoReceita === "Fixa + variável" && (receita.valorMensalFixo === undefined || receita.valorMensalVariavelEstimado === undefined)) {
    receita.valorMensalFixo ??= 0;
    receita.valorMensalVariavelEstimado ??= 0;
    pendentes.push("Separar receita fixa e variável");
  }
  if (tipoReceita === "Variável" && variavel === undefined && !total) {
    receita.valorMensalVariavelEstimado = 0;
    pendentes.push("Estimativa da receita variável (ou contrato em que é apurada)");
  }
  if (novoFixo !== undefined) {
    if (!dn) return e.previa("Recusada", resumo, "novo_valor_fixo precisa de novo_valor_a_partir_de");
    receita.escalonamento = [{ aPartirDe: dn, valorMensalFixo: novoFixo }];
  }
  const vigencia: Vigencia = {
    dataInicio: di ?? "",
    dataFim: df ?? "",
    tipoVigencia: indeterminado ? "Prazo indeterminado" : "Prazo determinado",
    avisoPrevioDias: aviso ?? 60,
    renovacaoAutomatica: indeterminado || SIM.has(normalizarTexto(r.renovacao_automatica)),
    prazoGestorDias: 30,
  } as Vigencia;
  const contrato: ContratoClienteImportado = {
    clienteId: cliente.cliente_id, empresaId: empresa!.id, gestorId: gestor!.id, objeto: r.objeto.trim(), external_id: r.numero_contrato_cliente?.trim() || undefined,
    moeda, vigencia, receita, status: situacao!, observacoes: r.observacao?.trim() || undefined, confirmacoesPendentes: pendentes.length ? pendentes : undefined, chaveImportacao: chave,
  };
  // Mesmas regras do registro manual; sem data de início entra com pendência (completa depois na capa).
  const ev = errosContratoReceita({ ...contrato, natureza: "Receita", vigencia: { ...vigencia, dataInicio: di ?? "0000-01-01" } } as unknown as Contrato);
  if (ev.length) return e.previa("Recusada", resumo, ev.join(" "));
  if (!di) avisos.push("Sem data de início: entra com pendência para completar.");
  if (moeda !== "BRL") avisos.push("Moeda estrangeira: informe a cotação no contrato.");
  if (clienteNovo) {
    e.clientes.push(cliente);
    e.operacoes.push({ tipo: "cliente", cliente });
    avisos.unshift(`Cliente “${cliente.razaoSocial}” será cadastrado.`);
  }
  e.contratosNovos.push(chave);
  e.operacoes.push({ tipo: "contratoCliente", contrato });
  if (pendentes.length) avisos.push(`Pendente: ${pendentes.join("; ")}.`);
  return e.previa("Importar", resumo, avisos.join(" ") || undefined);
}
