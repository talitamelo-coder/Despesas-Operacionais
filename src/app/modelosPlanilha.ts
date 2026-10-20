import { UNIDADES_PADRAO } from "@/domain/rules/cadastro";
import { CAMPOS_IMPORTACAO, type CampoImportacao } from "@/domain/rules/importacao";
import { ABA_FORNECEDORES, COLUNAS_FORNECEDORES } from "@/domain/rules/importacaoFornecedores";
import { MODELOS_CSV, type TipoImportacao } from "@/domain/rules/importacaoCsv";
import { temPerfil } from "@/domain/rules/permissoes";
import type { Configuracao, Empresa, TipoContrato, Usuario } from "@/domain/types";
import { gerarXlsx, lerXlsx, type ColunaModelo } from "./xlsx";

/**
 * Modelos Excel para carga em lote. As listas suspensas vêm dos cadastros atuais (empresas, gestores,
 * tipos, moedas, unidades…), para o arquivo voltar sem erro de digitação.
 */

interface Cadastros {
  usuarios: Usuario[];
  empresas: Empresa[];
  tipos: TipoContrato[];
  config: Configuracao;
}

const SIM_NAO = ["Sim", "Não"];
const nomes = (us: Usuario[]) => us.filter((u) => u.ativo).map((u) => u.nome).sort((a, b) => a.localeCompare(b));
const unidades = (cfg: Configuracao) => (cfg.listasAuxiliares["Unidades"]?.length ? cfg.listasAuxiliares["Unidades"] : UNIDADES_PADRAO);

const COLUNA_FORNECEDOR: Partial<Record<CampoImportacao, Partial<ColunaModelo>>> = {
  codigo: { largura: 16, formato: "texto" },
  fornecedor: { largura: 34 },
  cnpj: { largura: 20, formato: "texto" },
  pais: { largura: 16 },
  empresa: { largura: 26, lista: "Empresas" },
  objeto: { largura: 40 },
  gestor: { largura: 24, lista: "Gestores" },
  analista: { largura: 24, lista: "Analistas" },
  valorAnual: { largura: 16, formato: "numero" },
  valorMensal: { largura: 14, formato: "numero" },
  moeda: { largura: 9, lista: "Moedas" },
  dataInicio: { largura: 13, formato: "data" },
  dataFim: { largura: 15, formato: "data" },
  avisoPrevioDias: { largura: 12, formato: "inteiro" },
  renovacaoAutomatica: { largura: 13, lista: "Sim/Não" },
  tipo: { largura: 24, lista: "Tipos de contrato" },
  centroCusto: { largura: 16 },
  projeto: { largura: 20, lista: "Projetos" },
  quantidade: { largura: 11, formato: "numero" },
  unidade: { largura: 14, lista: "Unidades" },
  periodicidade: { largura: 16, lista: "Periodicidades" },
  condicaoPagamento: { largura: 28 },
  indiceReajuste: { largura: 14, lista: "Índices de reajuste" },
  multa: { largura: 30 },
  condicoesRescisao: { largura: 34 },
  observacoes: { largura: 40 },
};

/** Modelo Excel de contratos de fornecedores (mesmas colunas da importação em Administração). */
export function modeloContratosFornecedores(cad: Cadastros): Uint8Array {
  return gerarXlsx({
    abas: [{
      nome: "Contratos",
      colunas: CAMPOS_IMPORTACAO.map((c) => ({ titulo: c.rotulo, obrigatoria: c.obrigatorio, ...COLUNA_FORNECEDOR[c.campo] })),
      linhas: [],
    }, {
      nome: ABA_FORNECEDORES,
      colunas: COLUNAS_FORNECEDORES.map((c) => ({ titulo: c.rotulo, obrigatoria: "obrigatorio" in c && c.obrigatorio, largura: c.campo === "razaoSocial" || c.campo === "endereco" ? 36 : 16, formato: ["cnpj", "cep", "agencia", "conta", "codigoBanco", "telefone", "inscricaoEstadual"].includes(c.campo) ? ("texto" as const) : undefined, lista: c.campo === "tipoConta" ? "Tipos de conta" : undefined })),
      linhas: [],
    }],
    listas: {
      "Tipos de conta": ["Corrente", "Poupança", "Pagamento"],
      Empresas: cad.empresas.filter((e) => e.ativo).map((e) => e.nome),
      Gestores: nomes(cad.usuarios.filter((u) => temPerfil(u, "Gestor"))),
      Analistas: nomes(cad.usuarios.filter((u) => temPerfil(u, "Suprimentos") || temPerfil(u, "Administrador"))),
      Moedas: cad.config.moedas,
      "Sim/Não": SIM_NAO,
      "Tipos de contrato": cad.tipos.filter((t) => t.ativo).map((t) => t.nome),
      Projetos: cad.config.listasAuxiliares["Projetos"] ?? [],
      Unidades: unidades(cad.config),
      Periodicidades: cad.config.periodicidades,
      "Índices de reajuste": [...cad.config.indicesReajuste, "Não"],
    },
    instrucoes: [
      "1. Preencha a aba Contratos: uma linha por contrato, a partir da linha 2. Colunas com * (em laranja) são obrigatórias.",
      "   Exemplo: Fornecedor Exemplo Ltda | 11.222.333/0001-81 | Empresa | Serviço de limpeza | Gestor | 120000 | BRL | 01/01/2026 | 31/12/2026 | 90 | Não | … | 30 dias após emissão da NF | IPCA | 20% sobre o saldo remanescente",
      "2. Use as listas suspensas (empresa, gestor, moeda, tipo, unidade…). Elas vêm dos cadastros do sistema; se um nome não estiver na lista, o Excel avisa.",
      "3. Datas no formato dd/mm/aaaa. Contrato sem prazo final: escreva “indeterminado” em Data fim (o sistema cria a revisão anual).",
      "4. Valor anual em número, sem “R$” (ou só o Valor mensal: o sistema calcula o anual × 12). Moeda estrangeira: informe a cotação depois, na capa do contrato.",
      "5. Fornecedor: pelo CNPJ; sem CNPJ (exterior), pelo nome e país. Fornecedor novo é cadastrado na carga.",
      "6. Gestor não cadastrado é criado como usuário (complete o e-mail em Administração → Usuários).",
      "7. Multa e condições de rescisão são texto livre. Índice de reajuste vazio ou “Não” = sem reajuste.",
      "8. Suba o arquivo em Administração → Importação da planilha. Antes de gravar, o sistema mostra o relatório: prontos, inconsistências, incompletos e duplicidades.",
      "9. Pode subir o mesmo arquivo de novo: contratos já existentes (mesmo código, ou mesmo fornecedor + objeto + data fim + empresa) são apontados como duplicidade e não são gravados.",
      "10. Aba Fornecedores (opcional): cadastro completo dos fornecedores (endereço, dados bancários…), um por linha. Na carga, fornecedor novo é cadastrado e o já existente (mesmo CNPJ) só é completado — nada que já está preenchido é sobrescrito. Use o mesmo CNPJ/razão social da aba Contratos.",
    ],
  });
}

/** Modelo Excel para as importações por planilha (contratos de clientes, licenças, linhas). */
export function modeloImportacao(tipo: TipoImportacao, cad: Cadastros): Uint8Array {
  const m = MODELOS_CSV[tipo];
  const listas: Record<string, string[]> = {};
  const colunas: ColunaModelo[] = m.colunas.map((c) => {
    const base: ColunaModelo = { titulo: c, largura: Math.max(14, Math.min(34, c.length + 6)) };
    if (/^data|a_partir_de$/.test(c)) base.formato = "data";
    if (/^valor|^preco|^novo_valor_fixo$|^limite|^assentos|^quantidade$/.test(c)) base.formato = "numero";
    if (c === "aviso_previo_dias") base.formato = "inteiro";
    if (c === "cliente_cnpj" || c === "numero_contrato_cliente" || c === "numero") base.formato = "texto";
    return base;
  });
  if (tipo === "contratosClientes") {
    const lista = (col: string, nome: string, itens: string[]) => {
      listas[nome] = itens;
      const c = colunas.find((x) => x.titulo === col);
      if (c) c.lista = nome;
    };
    lista("empresa", "Empresas", cad.empresas.filter((e) => e.ativo).map((e) => e.nome));
    lista("gestor", "Gestores", nomes(cad.usuarios.filter((u) => temPerfil(u, "Gestor"))));
    lista("tipo_receita", "Tipo de receita", ["fixa", "variavel", "fixa + variavel"]);
    lista("moeda", "Moedas", cad.config.moedas);
    lista("renovacao_automatica", "Sim/Não", ["sim", "nao"]);
    lista("situacao", "Situação", ["vigente", "cancelado", "encerrado", "suspenso"]);
    for (const c of ["cliente", "objeto", "gestor", "tipo_receita"]) {
      const col = colunas.find((x) => x.titulo === c);
      if (col) col.obrigatoria = true;
    }
  }
  return gerarXlsx({
    abas: [{ nome: m.titulo.slice(0, 31), colunas, linhas: m.exemplo }],
    listas,
    instrucoes: [
      "Preencha a primeira aba: uma linha por registro. Não mude os nomes das colunas. Apague a linha de exemplo.",
      m.ajuda,
      "Datas no formato dd/mm/aaaa. Valores em número, sem símbolo de moeda.",
      "Suba o arquivo preenchido (.xlsx ou .csv). Antes de gravar, o sistema mostra a prévia linha a linha; reimportar o mesmo arquivo não duplica.",
    ],
  });
}

/** Aba opcional de um .xlsx (ex.: "Fornecedores" na carga de contratos). Ausente = undefined. */
export async function lerAbaOpcional(f: File, nome: string): Promise<{ cabecalhos: string[]; linhas: string[][] } | undefined> {
  if (!/\.xlsx$/i.test(f.name)) return undefined;
  let tabela: string[][];
  try {
    tabela = await lerXlsx(await f.arrayBuffer(), nome);
  } catch (e) {
    if (/não encontrada/.test((e as Error).message)) return undefined;
    throw e;
  }
  const [cab = [], ...linhas] = tabela;
  const cabecalhos = cab.map((c) => c.replace(/\s*\*$/, "").trim());
  return { cabecalhos, linhas: linhas.map((l) => cabecalhos.map((_, i) => l[i] ?? "")) };
}

/** Lê .xlsx ou .csv e devolve cabeçalhos + linhas (cabeçalho sem a marca “ *” de obrigatória). */
export async function lerPlanilha(f: File): Promise<{ cabecalhos: string[]; linhas: string[][] } | { texto: string }> {
  if (/\.xlsx$/i.test(f.name)) {
    const [cab = [], ...linhas] = await lerXlsx(await f.arrayBuffer());
    const cabecalhos = cab.map((c) => c.replace(/\s*\*$/, "").trim());
    return { cabecalhos, linhas: linhas.map((l) => cabecalhos.map((_, i) => l[i] ?? "")) };
  }
  if (/\.xls$/i.test(f.name)) throw new Error("Formato .xls antigo não é lido: no Excel, use Arquivo → Salvar como → Pasta de Trabalho do Excel (.xlsx).");
  return { texto: await f.text() };
}
