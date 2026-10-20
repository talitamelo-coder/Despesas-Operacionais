import { normalizarBusca, somenteDigitos } from "../formatacao";
import type { IndiceReajuste, ISODate, Moeda, Periodicidade } from "../types";

/**
 * Importação da planilha legada de contratos: parse CSV, mapeamento de colunas,
 * validação e relatório (importados, inconsistências, incompletos, duplicidades).
 * No MVP o arquivo é CSV (exportação "Salvar como CSV" do Excel).
 */

export const CAMPOS_IMPORTACAO = [
  { campo: "codigo", rotulo: "Código do contrato", obrigatorio: false, sinonimos: ["codigo", "cod", "contrato", "n contrato", "numero"] },
  { campo: "fornecedor", rotulo: "Fornecedor (razão social)", obrigatorio: true, sinonimos: ["fornecedor", "razao social", "prestador"] },
  // CNPJ é opcional: fornecedor no exterior não tem. Sem CNPJ, o fornecedor é reconhecido pelo nome.
  { campo: "cnpj", rotulo: "CNPJ", obrigatorio: false, sinonimos: ["cnpj", "cnpj fornecedor"] },
  { campo: "pais", rotulo: "País do fornecedor", obrigatorio: false, sinonimos: ["pais", "país", "country", "pais fornecedor"] },
  { campo: "empresa", rotulo: "Empresa", obrigatorio: true, sinonimos: ["empresa", "contratante", "unidade de negocio", "filial"] },
  { campo: "objeto", rotulo: "Objeto", obrigatorio: true, sinonimos: ["objeto", "descricao", "servico"] },
  { campo: "gestor", rotulo: "Gestor", obrigatorio: true, sinonimos: ["gestor", "responsavel", "gestor do contrato"] },
  { campo: "analista", rotulo: "Analista", obrigatorio: false, sinonimos: ["analista", "comprador", "suprimentos"] },
  { campo: "valorAnual", rotulo: "Valor anual", obrigatorio: true, sinonimos: ["valor anual", "valor", "valor total anual"] },
  { campo: "moeda", rotulo: "Moeda", obrigatorio: false, sinonimos: ["moeda"] },
  { campo: "dataInicio", rotulo: "Data início", obrigatorio: true, sinonimos: ["inicio", "data inicio", "inicio vigencia"] },
  // Data fim: data ou "indeterminado" (prazo indeterminado com revisão anual).
  { campo: "dataFim", rotulo: "Data fim", obrigatorio: true, sinonimos: ["fim", "data fim", "termino", "vencimento", "fim vigencia"] },
  { campo: "avisoPrevioDias", rotulo: "Aviso prévio (dias)", obrigatorio: false, sinonimos: ["aviso previo", "aviso"] },
  { campo: "renovacaoAutomatica", rotulo: "Renovação automática", obrigatorio: false, sinonimos: ["renovacao automatica", "renov auto", "auto renovacao"] },
  { campo: "tipo", rotulo: "Tipo de contrato", obrigatorio: false, sinonimos: ["tipo", "categoria"] },
  { campo: "centroCusto", rotulo: "Centro de custo", obrigatorio: false, sinonimos: ["centro de custo", "cc"] },
  { campo: "projeto", rotulo: "Projeto", obrigatorio: false, sinonimos: ["projeto"] },
  { campo: "quantidade", rotulo: "Quantidade", obrigatorio: false, sinonimos: ["quantidade", "qtd", "qtde"] },
  { campo: "unidade", rotulo: "Unidade", obrigatorio: false, sinonimos: ["unidade", "unidade de medida", "un"] },
  { campo: "periodicidade", rotulo: "Periodicidade de pagamento", obrigatorio: false, sinonimos: ["periodicidade de pagamento", "periodicidade", "frequencia de pagamento"] },
  { campo: "condicaoPagamento", rotulo: "Condição de pagamento", obrigatorio: false, sinonimos: ["condicao de pagamento", "prazo de pagamento", "forma de pagamento"] },
  { campo: "indiceReajuste", rotulo: "Índice de reajuste", obrigatorio: false, sinonimos: ["indice de reajuste", "reajuste", "indice"] },
  { campo: "multa", rotulo: "Multa rescisória", obrigatorio: false, sinonimos: ["multa rescisoria", "multa"] },
  { campo: "condicoesRescisao", rotulo: "Condições de rescisão", obrigatorio: false, sinonimos: ["condicoes de rescisao", "rescisao", "regra de rescisao"] },
  { campo: "observacoes", rotulo: "Observações", obrigatorio: false, sinonimos: ["observacoes", "observacao", "obs"] },
] as const;

const PERIODICIDADES: Periodicidade[] = ["Mensal", "Trimestral", "Semestral", "Anual", "Pagamento único"];
const INDICES: IndiceReajuste[] = ["IPCA", "IGP-M", "INPC", "IPC-Fipe", "Dissídio", "Outro"];
const deLista = <T extends string>(lista: T[], v: string): T | undefined => lista.find((x) => normalizarBusca(x).replace(/[^a-z0-9]/g, "") === normalizarBusca(v).replace(/[^a-z0-9]/g, ""));

export type CampoImportacao = (typeof CAMPOS_IMPORTACAO)[number]["campo"];
export type Mapeamento = Partial<Record<CampoImportacao, string>>; // campo -> cabeçalho da planilha

export interface RegistroImportado {
  linha: number;
  codigo?: string;
  fornecedor: string;
  /** Só dígitos; vazio para fornecedor sem CNPJ (exterior). */
  cnpj: string;
  /** Preenchido quando o fornecedor é do exterior. */
  pais?: string;
  empresa: string;
  objeto: string;
  gestor: string;
  analista?: string;
  valorAnual: number;
  moeda: Moeda;
  dataInicio: ISODate;
  /** Vazio quando prazo indeterminado. */
  dataFim: ISODate;
  indeterminado?: boolean;
  avisoPrevioDias: number;
  renovacaoAutomatica: boolean;
  tipo?: string;
  centroCusto?: string;
  projeto?: string;
  quantidade?: number;
  unidade?: string;
  periodicidade?: Periodicidade;
  condicaoPagamento?: string;
  indiceReajuste?: IndiceReajuste;
  multa?: string;
  condicoesRescisao?: string;
  observacoes?: string;
}

export interface RelatorioImportacao {
  total: number;
  importados: RegistroImportado[];
  inconsistencias: { linha: number; erros: string[] }[];
  incompletos: { linha: number; faltando: string[] }[];
  duplicidades: { linha: number; motivo: string }[];
}

// ---------------------------------------------------------------- CSV

export function parseCSV(texto: string): { cabecalhos: string[]; linhas: string[][] } {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i];
    if (aspas) {
      if (ch === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      atual.push(campo.trim());
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpo[i + 1] === "\n") i++;
      atual.push(campo.trim());
      if (atual.some((c) => c !== "")) linhas.push(atual);
      atual = [];
      campo = "";
    } else campo += ch;
  }
  atual.push(campo.trim());
  if (atual.some((c) => c !== "")) linhas.push(atual);
  const [cabecalhos = [], ...resto] = linhas;
  return { cabecalhos, linhas: resto };
}

export function sugerirMapeamento(cabecalhos: string[]): Mapeamento {
  const m: Mapeamento = {};
  const usados = new Set<string>();
  const norm = cabecalhos.map((c) => ({ original: c, n: normalizarBusca(c).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() }));
  for (const def of CAMPOS_IMPORTACAO) {
    // Correspondência exata primeiro, depois parcial.
    const exato = norm.find((h) => !usados.has(h.original) && def.sinonimos.some((s) => h.n === s));
    const parcial = exato ?? norm.find((h) => !usados.has(h.original) && def.sinonimos.some((s) => h.n.includes(s)));
    if (parcial) {
      m[def.campo] = parcial.original;
      usados.add(parcial.original);
    }
  }
  return m;
}

// ---------------------------------------------------------------- Conversões

export function parseNumeroBR(s: string): number | undefined {
  if (!s) return undefined;
  let t = s.replace(/[R$\sA-Za-z]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDataBR(s: string): ISODate | undefined {
  if (!s) return undefined;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (m) {
    const [, d, mo, y] = m;
    return validarData(Number(y), Number(mo), Number(d));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (m) return validarData(Number(m[1]), Number(m[2]), Number(m[3]));
  return undefined;
}

function validarData(y: number, m: number, d: number): ISODate | undefined {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString().slice(0, 10);
}

function parseBool(s: string): boolean {
  return ["sim", "s", "yes", "true", "1", "x"].includes(normalizarBusca(s.trim()));
}

export function cnpjValido(cnpj: string): boolean {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(d.slice(0, 12), p1);
  const d2 = calc(d.slice(0, 12) + d1, [6, ...p1]);
  return d.endsWith(`${d1}${d2}`);
}

// ---------------------------------------------------------------- Processamento

export function processarImportacao(
  cabecalhos: string[],
  linhas: string[][],
  mapeamento: Mapeamento,
  existentes: { codigos: string[]; chaves: string[] } = { codigos: [], chaves: [] },
): RelatorioImportacao {
  const idx = (campo: CampoImportacao) => (mapeamento[campo] ? cabecalhos.indexOf(mapeamento[campo]!) : -1);
  const indices = Object.fromEntries(CAMPOS_IMPORTACAO.map((c) => [c.campo, idx(c.campo)])) as Record<CampoImportacao, number>;
  const rel: RelatorioImportacao = { total: linhas.length, importados: [], inconsistencias: [], incompletos: [], duplicidades: [] };
  const codigosVistos = new Set(existentes.codigos.map((c) => c.toUpperCase()));
  const chavesVistas = new Set(existentes.chaves);

  linhas.forEach((cols, i) => {
    const linha = i + 2; // +1 cabeçalho, +1 base 1
    const v = (campo: CampoImportacao) => (indices[campo] >= 0 ? (cols[indices[campo]] ?? "").trim() : "");

    const faltando = CAMPOS_IMPORTACAO.filter((c) => c.obrigatorio && !v(c.campo)).map((c) => c.rotulo);
    if (faltando.length) {
      rel.incompletos.push({ linha, faltando });
      return;
    }

    const erros: string[] = [];
    const valorAnual = parseNumeroBR(v("valorAnual"));
    if (valorAnual === undefined || valorAnual < 0) erros.push(`Valor anual inválido: "${v("valorAnual")}"`);
    const dataInicio = parseDataBR(v("dataInicio"));
    if (!dataInicio) erros.push(`Data início inválida: "${v("dataInicio")}"`);
    const indeterminado = /^indeterminad/.test(normalizarBusca(v("dataFim")));
    const dataFim = indeterminado ? "" : parseDataBR(v("dataFim"));
    if (dataFim === undefined) erros.push(`Data fim inválida: "${v("dataFim")}" (use uma data ou "indeterminado")`);
    if (dataInicio && dataFim && dataFim < dataInicio) erros.push("Data fim anterior à data início");
    if (v("cnpj") && !cnpjValido(v("cnpj"))) erros.push(`CNPJ inválido: "${v("cnpj")}"`);
    const moedaTxt = (v("moeda") || "BRL").toUpperCase().replace("R$", "BRL").replace("US$", "USD");
    if (!["BRL", "USD", "EUR"].includes(moedaTxt)) erros.push(`Moeda não suportada: "${v("moeda")}"`);
    const aviso = v("avisoPrevioDias") ? parseNumeroBR(v("avisoPrevioDias")) : 0;
    if (aviso === undefined || aviso < 0) erros.push(`Aviso prévio inválido: "${v("avisoPrevioDias")}"`);
    const quantidade = v("quantidade") ? parseNumeroBR(v("quantidade")) : undefined;
    if (v("quantidade") && (quantidade === undefined || quantidade < 0)) erros.push(`Quantidade inválida: "${v("quantidade")}"`);
    const periodicidade = v("periodicidade") ? deLista(PERIODICIDADES, v("periodicidade")) : undefined;
    if (v("periodicidade") && !periodicidade) erros.push(`Periodicidade inválida: "${v("periodicidade")}" (${PERIODICIDADES.join(", ")})`);
    const indice = v("indiceReajuste") && !/^(nao|n|sem|-)$/.test(normalizarBusca(v("indiceReajuste"))) ? deLista(INDICES, v("indiceReajuste")) : undefined;
    if (v("indiceReajuste") && !indice && !/^(nao|n|sem|-)$/.test(normalizarBusca(v("indiceReajuste")))) erros.push(`Índice de reajuste inválido: "${v("indiceReajuste")}" (${INDICES.join(", ")} ou "Não")`);
    if (erros.length) {
      rel.inconsistencias.push({ linha, erros });
      return;
    }

    const codigo = v("codigo") || undefined;
    const chave = chaveDuplicidade(identificadorFornecedor(v("cnpj"), v("fornecedor")), v("objeto"), dataFim!, v("empresa"));
    if (codigo && codigosVistos.has(codigo.toUpperCase())) {
      rel.duplicidades.push({ linha, motivo: `Código ${codigo} já existe` });
      return;
    }
    if (chavesVistas.has(chave)) {
      rel.duplicidades.push({ linha, motivo: "Mesmo fornecedor (CNPJ ou nome), objeto, data fim e empresa de outro registro" });
      return;
    }
    if (codigo) codigosVistos.add(codigo.toUpperCase());
    chavesVistas.add(chave);

    rel.importados.push({
      linha,
      codigo,
      fornecedor: v("fornecedor"),
      cnpj: somenteDigitos(v("cnpj")),
      pais: paisExterior(v("pais")),
      empresa: v("empresa"),
      objeto: v("objeto"),
      gestor: v("gestor"),
      analista: v("analista") || undefined,
      valorAnual: valorAnual!,
      moeda: moedaTxt as Moeda,
      dataInicio: dataInicio!,
      dataFim: dataFim!,
      indeterminado: indeterminado || undefined,
      avisoPrevioDias: aviso ?? 0,
      renovacaoAutomatica: !indeterminado && parseBool(v("renovacaoAutomatica")),
      tipo: v("tipo") || undefined,
      centroCusto: v("centroCusto") || undefined,
      projeto: v("projeto") || undefined,
      quantidade,
      unidade: v("unidade") || undefined,
      periodicidade,
      condicaoPagamento: v("condicaoPagamento") || undefined,
      indiceReajuste: indice,
      multa: v("multa") && !/^(nao|n|sem|-)$/.test(normalizarBusca(v("multa"))) ? v("multa") : undefined,
      condicoesRescisao: v("condicoesRescisao") || undefined,
      observacoes: v("observacoes") || undefined,
    });
  });
  return rel;
}

/** Fornecedor identificado pelo CNPJ; sem CNPJ (exterior), pelo nome normalizado. */
export function identificadorFornecedor(cnpj: string | undefined, nome: string): string {
  const d = somenteDigitos(cnpj ?? "");
  return d || `nome:${normalizarBusca(nome)}`;
}

/** País informado e diferente de Brasil = fornecedor do exterior. */
export function paisExterior(pais?: string): string | undefined {
  const p = pais?.trim();
  return p && !["brasil", "brazil", "br"].includes(normalizarBusca(p)) ? p : undefined;
}

/** Chave de duplicidade de um contrato já cadastrado (mesma regra da importação). */
export function chaveDuplicidade(fornecedor: string, objeto: string, dataFim: ISODate, empresa = ""): string {
  // A empresa entra na chave: o mesmo fornecedor/objeto contratado por duas empresas do grupo são dois contratos.
  return `${fornecedor.startsWith("nome:") ? fornecedor : somenteDigitos(fornecedor)}|${normalizarBusca(objeto)}|${dataFim}|${normalizarBusca(empresa)}`;
}
