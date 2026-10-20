import { normalizarBusca, somenteDigitos } from "../formatacao";
import { normalizarFornecedor, validarFornecedor } from "./fornecedor";
import type { DadosBancarios, Fornecedor, TipoConta } from "../types";

/**
 * Aba "Fornecedores" da planilha de carga: cadastro completo (endereço, dados bancários…) importado
 * junto com os contratos. Fornecedor já cadastrado só é COMPLETADO: campos preenchidos nunca são sobrescritos.
 */

export const ABA_FORNECEDORES = "Fornecedores";

export const COLUNAS_FORNECEDORES = [
  { campo: "codigo", rotulo: "Código no sistema atual" },
  { campo: "razaoSocial", rotulo: "Razão social", obrigatorio: true },
  { campo: "nomeFantasia", rotulo: "Nome fantasia" },
  { campo: "cnpj", rotulo: "CNPJ" },
  { campo: "pais", rotulo: "País (se exterior)" },
  { campo: "inscricaoEstadual", rotulo: "Inscrição estadual" },
  { campo: "email", rotulo: "E-mail" },
  { campo: "telefone", rotulo: "Telefone" },
  { campo: "endereco", rotulo: "Endereço" },
  { campo: "cidade", rotulo: "Cidade" },
  { campo: "uf", rotulo: "UF" },
  { campo: "cep", rotulo: "CEP" },
  { campo: "codigoBanco", rotulo: "Código do banco" },
  { campo: "nomeBanco", rotulo: "Banco" },
  { campo: "agencia", rotulo: "Agência" },
  { campo: "digitoAgencia", rotulo: "Dígito da agência" },
  { campo: "conta", rotulo: "Conta" },
  { campo: "digitoConta", rotulo: "Dígito da conta" },
  { campo: "tipoConta", rotulo: "Tipo de conta" },
] as const;

type Campo = (typeof COLUNAS_FORNECEDORES)[number]["campo"];

export interface RelatorioFornecedores {
  fornecedores: Fornecedor[];
  erros: { linha: number; erros: string[] }[];
}

const chave = (s: string) => normalizarBusca(s.replace(/\*/g, "")).replace(/[^a-z0-9]/g, "");
const TIPOS_CONTA: Record<string, TipoConta> = { corrente: "Corrente", contacorrente: "Corrente", poupanca: "Poupança", pagamento: "Pagamento" };

/** Lê a aba Fornecedores (cabeçalhos = rótulos de COLUNAS_FORNECEDORES, em qualquer ordem). */
export function processarFornecedores(cabecalhos: string[], linhas: string[][]): RelatorioFornecedores {
  const idx = Object.fromEntries(COLUNAS_FORNECEDORES.map((c) => [c.campo, cabecalhos.findIndex((h) => chave(h) === chave(c.rotulo))])) as Record<Campo, number>;
  const rel: RelatorioFornecedores = { fornecedores: [], erros: [] };
  const vistos = new Set<string>();
  linhas.forEach((cols, i) => {
    const linha = i + 2;
    const v = (c: Campo) => (idx[c] >= 0 ? (cols[idx[c]] ?? "").trim() : "");
    let conta = v("conta");
    let digitoConta = v("digitoConta");
    // "30527-5" numa coluna só: separa o dígito.
    const m = /^(\d+)-(\w)$/.exec(conta);
    if (m && !digitoConta) (conta = m[1]), (digitoConta = m[2]);
    const banco: DadosBancarios = {
      codigoBanco: v("codigoBanco") || undefined,
      nomeBanco: v("nomeBanco") || undefined,
      agencia: v("agencia") || undefined,
      digitoAgencia: v("digitoAgencia") || undefined,
      conta: conta || undefined,
      digitoConta: digitoConta || undefined,
      tipoConta: TIPOS_CONTA[chave(v("tipoConta"))],
    };
    const cnpj = somenteDigitos(v("cnpj"));
    const f: Fornecedor = {
      fornecedor_id: "",
      codigoFornecedor: v("codigo") || undefined,
      razaoSocial: v("razaoSocial"),
      nomeFantasia: v("nomeFantasia") && !/^\*+$/.test(v("nomeFantasia")) ? v("nomeFantasia") : "",
      cnpj: cnpj && !/^0+$/.test(cnpj) ? cnpj : undefined,
      estrangeiro: v("pais") ? true : undefined,
      pais: v("pais") || undefined,
      inscricaoEstadual: v("inscricaoEstadual") || undefined,
      email: v("email") || undefined,
      telefone: v("telefone") || undefined,
      endereco: v("endereco") || undefined,
      cidade: v("cidade") || undefined,
      uf: v("uf") || undefined,
      cep: v("cep") && !/^0+$/.test(somenteDigitos(v("cep"))) ? v("cep") : undefined,
      dadosBancarios: banco,
      statusCadastral: "Ativo",
    };
    const erros = Object.values(validarFornecedor(f));
    const id = f.cnpj ?? `nome:${normalizarBusca(f.razaoSocial)}`;
    if (!erros.length && vistos.has(id)) erros.push("Fornecedor repetido na aba (mesmo CNPJ ou razão social).");
    if (erros.length) return void rel.erros.push({ linha, erros });
    vistos.add(id);
    rel.fornecedores.push(normalizarFornecedor(f));
  });
  return rel;
}

/** Mesmo fornecedor: pelo CNPJ; sem CNPJ, pela razão social ou nome fantasia. */
export function acharFornecedorCadastrado(f: Pick<Fornecedor, "cnpj" | "razaoSocial">, lista: Fornecedor[]): Fornecedor | undefined {
  if (f.cnpj) return lista.find((x) => x.cnpj && somenteDigitos(x.cnpj) === somenteDigitos(f.cnpj!));
  const n = normalizarBusca(f.razaoSocial);
  return lista.find((x) => !x.cnpj && (normalizarBusca(x.razaoSocial) === n || normalizarBusca(x.nomeFantasia) === n));
}

/**
 * Completa um fornecedor já cadastrado com os dados da planilha: só preenche o que está vazio.
 * Dados bancários entram inteiros apenas se o cadastro ainda não tem conta.
 */
export function completarFornecedor(atual: Fornecedor, planilha: Fornecedor): { fornecedor: Fornecedor; campos: string[] } {
  const novo: Fornecedor = { ...atual };
  const campos: string[] = [];
  const simples = ["codigoFornecedor", "inscricaoEstadual", "email", "telefone", "endereco", "cidade", "uf", "cep", "pais"] as const;
  for (const k of simples) {
    if (!atual[k] && planilha[k]) ((novo as unknown as Record<string, unknown>)[k] = planilha[k]), campos.push(k);
  }
  if ((!atual.nomeFantasia || atual.nomeFantasia === atual.razaoSocial) && planilha.nomeFantasia && planilha.nomeFantasia !== planilha.razaoSocial) (novo.nomeFantasia = planilha.nomeFantasia), campos.push("nomeFantasia");
  if (!atual.cnpj && planilha.cnpj) (novo.cnpj = planilha.cnpj), campos.push("cnpj");
  if (!atual.dadosBancarios?.conta && planilha.dadosBancarios?.conta) (novo.dadosBancarios = planilha.dadosBancarios), campos.push("dadosBancarios");
  if (atual.statusCadastral === "Potencial" && (novo.cnpj || novo.estrangeiro)) (novo.statusCadastral = "Ativo"), campos.push("statusCadastral");
  return { fornecedor: novo, campos };
}
