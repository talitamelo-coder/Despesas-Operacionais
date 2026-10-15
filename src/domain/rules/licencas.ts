import { diffDias, hoje } from "../datas";
import { converterParaBRL } from "./cambio";
import type { AtribuicaoLicenca, Colaborador, Contrato, ISODate, ProdutoLicenca } from "../types";

/**
 * Regras do controle de licenças — ÚNICA fonte destes cálculos.
 * Contrato = o que foi comprado. Licenças = quem usa. Nenhuma regra aqui altera contrato.
 */

export interface ResumoProduto {
  contratadas: number;
  emUso: number;
  livres: number;
  excedente: number;
  percentualUso: number;
  /** Custo mensal por licença em BRL (sem impostos). undefined = sem cotação para converter. */
  custoUnitarioMensalBRL?: number;
  custoMensalBRL?: number;
  custoAnualBRL?: number;
  custoAnualComImpostosBRL?: number;
  /** Quanto se paga por ano em licenças sem ninguém usando. */
  custoOciosoAnualBRL?: number;
}

export function atribuicoesAtivas(atribuicoes: AtribuicaoLicenca[], produtoId?: string): AtribuicaoLicenca[] {
  return atribuicoes.filter((a) => a.status === "Ativa" && (!produtoId || a.produtoId === produtoId));
}

export function custoUnitarioMensalBRL(p: ProdutoLicenca): number | undefined {
  const brl = converterParaBRL(p.valorUnitario, p.moeda, p.cotacao);
  if (brl === undefined) return undefined;
  return p.periodicidade === "Anual" ? brl / 12 : brl;
}

/** Fator de IOF e impostos sobre o custo (ex.: IOF 3,5% em compras internacionais). */
export function fatorImpostos(p: Pick<ProdutoLicenca, "iofPercentual" | "impostosPercentual">): number {
  return (1 + (p.iofPercentual ?? 0) / 100) * (1 + (p.impostosPercentual ?? 0) / 100);
}

export function resumoProduto(p: ProdutoLicenca, atribuicoes: AtribuicaoLicenca[]): ResumoProduto {
  const ativas = atribuicoesAtivas(atribuicoes, p.id);
  const contratadas = p.situacao === "Ativo" ? p.quantidadeContratada : 0;
  // Sem controle por pessoa: considera tudo em uso (não há como medir ociosidade).
  const semControle = p.controlePorUsuario === false;
  const emUso = semControle ? Math.max(contratadas, ativas.length) : ativas.length;
  const livres = Math.max(0, contratadas - emUso);
  const excedente = Math.max(0, emUso - contratadas);
  const unit = custoUnitarioMensalBRL(p);

  // Linhas telefônicas: custo é a soma do valor de cada linha (fatura), não quantidade × preço.
  const somaLinhas = ativas.reduce((acc, a) => acc + (a.valorMensalBRL ?? 0), 0);
  const usaValorPorAtribuicao = p.categoria === "Linha telefônica" || ativas.some((a) => a.valorMensalBRL !== undefined);
  const custoMensal = p.situacao !== "Ativo" ? 0 : usaValorPorAtribuicao ? somaLinhas : unit !== undefined ? unit * contratadas : undefined;

  return {
    contratadas,
    emUso,
    livres,
    excedente,
    percentualUso: contratadas ? (emUso / contratadas) * 100 : emUso ? 100 : 0,
    custoUnitarioMensalBRL: unit,
    custoMensalBRL: custoMensal,
    custoAnualBRL: custoMensal !== undefined ? custoMensal * 12 : undefined,
    custoAnualComImpostosBRL: custoMensal !== undefined ? custoMensal * 12 * fatorImpostos(p) : undefined,
    custoOciosoAnualBRL: unit !== undefined && !usaValorPorAtribuicao && !semControle ? livres * unit * 12 : 0,
  };
}

/** Custo mensal de uma atribuição específica (o que aquela pessoa custa naquele produto). */
export function custoMensalAtribuicao(a: AtribuicaoLicenca, p: ProdutoLicenca): number | undefined {
  return a.valorMensalBRL ?? custoUnitarioMensalBRL(p);
}

export interface ResumoColaborador {
  licencas: number;
  custoMensalBRL: number;
}

export function resumoColaborador(colaboradorId: string, atribuicoes: AtribuicaoLicenca[], produtos: ProdutoLicenca[]): ResumoColaborador {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const ativas = atribuicoes.filter((a) => a.status === "Ativa" && a.colaboradorId === colaboradorId);
  const custo = ativas.reduce((acc, a) => {
    const p = porId.get(a.produtoId);
    return acc + ((p && custoMensalAtribuicao(a, p)) || 0);
  }, 0);
  return { licencas: ativas.length, custoMensalBRL: custo };
}

// ---------------------------------------------------------------- Alertas

export type TipoAlertaLicenca = "Mais usuários que licenças" | "Licenças ociosas" | "Vencimento próximo" | "Colaborador inativo com licença";

export interface AlertaLicenca {
  tipo: TipoAlertaLicenca;
  gravidade: "Crítico" | "Atenção";
  produtoId?: string;
  colaboradorId?: string;
  mensagem: string;
}

export const DIAS_ALERTA_VENCIMENTO_LICENCA = 60;

export function alertasLicencas(
  produtos: ProdutoLicenca[],
  atribuicoes: AtribuicaoLicenca[],
  colaboradores: Colaborador[],
  referencia: ISODate = hoje(),
): AlertaLicenca[] {
  const alertas: AlertaLicenca[] = [];
  for (const p of produtos.filter((x) => x.situacao === "Ativo")) {
    const r = resumoProduto(p, atribuicoes);
    if (r.excedente > 0)
      alertas.push({ tipo: "Mais usuários que licenças", gravidade: "Crítico", produtoId: p.id, mensagem: `${p.nome}: ${r.emUso} em uso para ${r.contratadas} contratada(s) — risco de cobrança extra ou cadastro desatualizado` });
    if (r.livres > 0 && (r.custoOciosoAnualBRL ?? 0) > 0)
      alertas.push({ tipo: "Licenças ociosas", gravidade: "Atenção", produtoId: p.id, mensagem: `${p.nome}: ${r.livres} licença(s) sem uso` });
    if (p.vencimento) {
      const dias = diffDias(referencia, p.vencimento);
      if (dias >= 0 && dias <= DIAS_ALERTA_VENCIMENTO_LICENCA)
        alertas.push({ tipo: "Vencimento próximo", gravidade: "Atenção", produtoId: p.id, mensagem: `${p.nome}: vence em ${dias} dia(s) — revisar quantidade antes de renovar` });
    }
  }
  const inativos = new Set(colaboradores.filter((c) => !c.ativo).map((c) => c.id));
  const jaAvisado = new Set<string>();
  for (const a of atribuicoesAtivas(atribuicoes)) {
    if (inativos.has(a.colaboradorId) && !jaAvisado.has(a.colaboradorId)) {
      jaAvisado.add(a.colaboradorId);
      const nome = colaboradores.find((c) => c.id === a.colaboradorId)?.nome ?? "Colaborador";
      alertas.push({ tipo: "Colaborador inativo com licença", gravidade: "Crítico", colaboradorId: a.colaboradorId, mensagem: `${nome} está inativo e ainda tem licença(s) ativa(s)` });
    }
  }
  return alertas.sort((x, y) => (x.gravidade === y.gravidade ? 0 : x.gravidade === "Crítico" ? -1 : 1));
}

// ---------------------------------------------------------------- Ligação com contrato (somente leitura)

/** Aviso quando a quantidade do contrato difere da soma das licenças cadastradas para ele. */
export function divergenciaComContrato(c: Contrato, produtos: ProdutoLicenca[]): string | undefined {
  const doContrato = produtos.filter((p) => p.contrato_id === c.contrato_id && p.situacao === "Ativo" && p.categoria === "Software");
  if (!doContrato.length || !c.condicoes.quantidade) return undefined;
  const soma = doContrato.reduce((a, p) => a + p.quantidadeContratada, 0);
  return soma !== c.condicoes.quantidade ? `Contrato indica ${c.condicoes.quantidade} e o controle de licenças soma ${soma}. Conferir.` : undefined;
}

/** Visibilidade: Gestor vê apenas colaboradores da própria área. */
export function colaboradorVisivel(c: Colaborador, usuario: { perfil: string; area?: string }, podeGerir: boolean): boolean {
  if (podeGerir) return true;
  return Boolean(usuario.area) && c.area === usuario.area;
}

// ---------------------------------------------------------------- Vínculo automático com contrato (importação)

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const GENERICOS = new Set(["ltda", "s a", "sa", "me", "inc", "servicos", "tecnologia", "brasil", "do", "de", "da", "the"]);

/** Primeira palavra significativa do nome do fornecedor (ex.: "Atlassian", "Claro"). */
export function chaveFornecedor(nome: string): string {
  return normalizar(nome).split(" ").find((w) => w.length >= 3 && !GENERICOS.has(w)) ?? normalizar(nome);
}

/**
 * Sugere o contrato de um produto pelo nome do fornecedor: só vincula quando há
 * exatamente UM contrato vigente desse fornecedor; senão devolve os candidatos para confirmação.
 */
export function sugerirContrato(
  fornecedorNome: string,
  contratos: Pick<Contrato, "contrato_id" | "fornecedorId" | "status">[],
  fornecedores: { fornecedor_id: string; razaoSocial: string; nomeFantasia?: string }[],
): { contrato_id?: string; candidatos: number } {
  const chave = chaveFornecedor(fornecedorNome);
  if (!chave) return { candidatos: 0 };
  const ids = new Set(
    fornecedores.filter((f) => normalizar(`${f.razaoSocial} ${f.nomeFantasia ?? ""}`).split(" ").includes(chave)).map((f) => f.fornecedor_id),
  );
  const candidatos = contratos.filter((c) => ids.has(c.fornecedorId) && c.status === "Vigente");
  return candidatos.length === 1 ? { contrato_id: candidatos[0].contrato_id, candidatos: 1 } : { candidatos: candidatos.length };
}
