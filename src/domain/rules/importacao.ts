import { normalizarBusca, somenteDigitos } from "../formatacao";
import type { ISODate, Moeda } from "../types";

/**
 * Importação da planilha legada de contratos: parse CSV, mapeamento de colunas,
 * validação e relatório (importados, inconsistências, incompletos, duplicidades).
 * No MVP o arquivo é CSV (exportação "Salvar como CSV" do Excel).
 */

export const CAMPOS_IMPORTACAO = [
  { campo: "codigo", rotulo: "Código do contrato", obrigatorio: false, sinonimos: ["codigo", "cod", "contrato", "n contrato", "numero"] },
  { campo: "fornecedor", rotulo: "Fornecedor (razão social)", obrigatorio: true, sinonimos: ["fornecedor", "razao social", "prestador"] },
  { campo: "cnpj", rotulo: "CNPJ", obrigatorio: true, sinonimos: ["cnpj", "cnpj fornecedor"] },
  { campo: "empresa", rotulo: "Empresa", obrigatorio: true, sinonimos: ["empresa", "contratante", "unidade"] },
  { campo: "objeto", rotulo: "Objeto", obrigatorio: true, sinonimos: ["objeto", "descricao", "servico"] },
  { campo: "gestor", rotulo: "Gestor", obrigatorio: true, sinonimos: ["gestor", "responsavel", "gestor do contrato"] },
  { campo: "analista", rotulo: "Analista", obrigatorio: false, sinonimos: ["analista", "comprador", "suprimentos"] },
  { campo: "valorAnual", rotulo: "Valor anual", obrigatorio: true, sinonimos: ["valor anual", "valor", "valor total anual"] },
  { campo: "moeda", rotulo: "Moeda", obrigatorio: false, sinonimos: ["moeda"] },
  { campo: "dataInicio", rotulo: "Data início", obrigatorio: true, sinonimos: ["inicio", "data inicio", "inicio vigencia"] },
  { campo: "dataFim", rotulo: "Data fim", obrigatorio: true, sinonimos: ["fim", "data fim", "termino", "vencimento", "fim vigencia"] },
  { campo: "avisoPrevioDias", rotulo: "Aviso prévio (dias)", obrigatorio: false, sinonimos: ["aviso previo", "aviso"] },
  { campo: "renovacaoAutomatica", rotulo: "Renovação automática", obrigatorio: false, sinonimos: ["renovacao automatica", "renov auto", "auto renovacao"] },
  { campo: "tipo", rotulo: "Tipo de contrato", obrigatorio: false, sinonimos: ["tipo", "categoria"] },
  { campo: "centroCusto", rotulo: "Centro de custo", obrigatorio: false, sinonimos: ["centro de custo", "cc"] },
  { campo: "projeto", rotulo: "Projeto", obrigatorio: false, sinonimos: ["projeto"] },
] as const;

export type CampoImportacao = (typeof CAMPOS_IMPORTACAO)[number]["campo"];
export type Mapeamento = Partial<Record<CampoImportacao, string>>; // campo -> cabeçalho da planilha

export interface RegistroImportado {
  linha: number;
  codigo?: string;
  fornecedor: string;
  cnpj: string;
  empresa: string;
  objeto: string;
  gestor: string;
  analista?: string;
  valorAnual: number;
  moeda: Moeda;
  dataInicio: ISODate;
  dataFim: ISODate;
  avisoPrevioDias: number;
  renovacaoAutomatica: boolean;
  tipo?: string;
  centroCusto?: string;
  projeto?: string;
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
    const dataFim = parseDataBR(v("dataFim"));
    if (!dataFim) erros.push(`Data fim inválida: "${v("dataFim")}"`);
    if (dataInicio && dataFim && dataFim < dataInicio) erros.push("Data fim anterior à data início");
    if (!cnpjValido(v("cnpj"))) erros.push(`CNPJ inválido: "${v("cnpj")}"`);
    const moedaTxt = (v("moeda") || "BRL").toUpperCase().replace("R$", "BRL").replace("US$", "USD");
    if (!["BRL", "USD", "EUR"].includes(moedaTxt)) erros.push(`Moeda não suportada: "${v("moeda")}"`);
    const aviso = v("avisoPrevioDias") ? parseNumeroBR(v("avisoPrevioDias")) : 0;
    if (aviso === undefined || aviso < 0) erros.push(`Aviso prévio inválido: "${v("avisoPrevioDias")}"`);
    if (erros.length) {
      rel.inconsistencias.push({ linha, erros });
      return;
    }

    const codigo = v("codigo") || undefined;
    const chave = `${somenteDigitos(v("cnpj"))}|${normalizarBusca(v("objeto"))}|${dataFim}`;
    if (codigo && codigosVistos.has(codigo.toUpperCase())) {
      rel.duplicidades.push({ linha, motivo: `Código ${codigo} já existe` });
      return;
    }
    if (chavesVistas.has(chave)) {
      rel.duplicidades.push({ linha, motivo: "Mesmo CNPJ, objeto e data fim de outro registro" });
      return;
    }
    if (codigo) codigosVistos.add(codigo.toUpperCase());
    chavesVistas.add(chave);

    rel.importados.push({
      linha,
      codigo,
      fornecedor: v("fornecedor"),
      cnpj: somenteDigitos(v("cnpj")),
      empresa: v("empresa"),
      objeto: v("objeto"),
      gestor: v("gestor"),
      analista: v("analista") || undefined,
      valorAnual: valorAnual!,
      moeda: moedaTxt as Moeda,
      dataInicio: dataInicio!,
      dataFim: dataFim!,
      avisoPrevioDias: aviso ?? 0,
      renovacaoAutomatica: parseBool(v("renovacaoAutomatica")),
      tipo: v("tipo") || undefined,
      centroCusto: v("centroCusto") || undefined,
      projeto: v("projeto") || undefined,
    });
  });
  return rel;
}

/** Chave de duplicidade de um contrato já cadastrado (mesma regra da importação). */
export function chaveDuplicidade(cnpj: string, objeto: string, dataFim: ISODate): string {
  return `${somenteDigitos(cnpj)}|${normalizarBusca(objeto)}|${dataFim}`;
}
