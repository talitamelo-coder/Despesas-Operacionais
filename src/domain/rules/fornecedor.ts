import { somenteDigitos } from "../formatacao";
import type { Fornecedor, RegimeTributario, TipoChavePix, TipoConta } from "../types";
import { cnpjValido } from "./importacao";

/** Regras do cadastro de fornecedor: validação, sugestões e mascaramento de dados sensíveis. */

export const REGIMES_TRIBUTARIOS: RegimeTributario[] = ["Não informado", "Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real", "Outro"];
export const TIPOS_CONTA: TipoConta[] = ["Corrente", "Poupança", "Pagamento"];
export const TIPOS_CHAVE_PIX: TipoChavePix[] = ["CNPJ", "CPF", "E-mail", "Telefone", "Chave aleatória"];
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Bancos mais comuns (código COMPE) — o sistema sugere o nome a partir do código. */
const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil S.A.",
  "004": "Banco do Nordeste do Brasil S.A.",
  "033": "Banco Santander (Brasil) S.A.",
  "041": "Banco do Estado do Rio Grande do Sul S.A.",
  "070": "BRB - Banco de Brasília S.A.",
  "077": "Banco Inter S.A.",
  "104": "Caixa Econômica Federal",
  "208": "Banco BTG Pactual S.A.",
  "212": "Banco Original S.A.",
  "237": "Banco Bradesco S.A.",
  "260": "Nu Pagamentos S.A.",
  "336": "Banco C6 S.A.",
  "341": "Itaú Unibanco S.A.",
  "422": "Banco Safra S.A.",
  "655": "Banco Votorantim S.A.",
  "748": "Banco Cooperativo Sicredi S.A.",
  "756": "Banco Cooperativo Sicoob S.A.",
};

export function nomeDoBanco(codigo?: string): string | undefined {
  const c = somenteDigitos(codigo ?? "");
  return c ? BANCOS[c.padStart(3, "0")] : undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cpfValido(cpf: string): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const soma = d.slice(0, n).split("").reduce((a, x, i) => a + Number(x) * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function chavePixValida(tipo: TipoChavePix, chave: string): boolean {
  const c = chave.trim();
  switch (tipo) {
    case "CNPJ":
      return cnpjValido(c);
    case "CPF":
      return cpfValido(c);
    case "E-mail":
      return EMAIL.test(c);
    case "Telefone": {
      const d = somenteDigitos(c);
      return d.length >= 10 && d.length <= 13;
    }
    case "Chave aleatória":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c);
  }
}

/** Erros por campo. Vazio = cadastro válido. */
export function validarFornecedor(f: Fornecedor): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.razaoSocial?.trim()) e.razaoSocial = "Informe a razão social.";
  const cnpjObrigatorio = !f.estrangeiro && f.statusCadastral !== "Potencial";
  if (f.cnpj?.trim()) {
    if (!cnpjValido(f.cnpj)) e.cnpj = "CNPJ inválido.";
  } else if (cnpjObrigatorio) e.cnpj = "Informe o CNPJ.";
  if (f.email?.trim() && !EMAIL.test(f.email.trim())) e.email = "E-mail inválido.";
  if (f.telefone?.trim()) {
    const d = somenteDigitos(f.telefone);
    if (d.length < 10 || d.length > 13) e.telefone = "Telefone inválido (inclua o DDD).";
  }
  if (f.uf?.trim() && !UFS.includes(f.uf.trim().toUpperCase())) e.uf = "UF inválida.";
  if (f.cep?.trim() && somenteDigitos(f.cep).length !== 8) e.cep = "CEP deve ter 8 dígitos.";
  const b = f.dadosBancarios;
  if (b?.codigoBanco?.trim() && !/^\d{3}$/.test(somenteDigitos(b.codigoBanco).padStart(3, "0"))) e["dadosBancarios.codigoBanco"] = "Código do banco tem 3 dígitos.";
  if (b?.agencia?.trim() && !/^\d{1,5}$/.test(b.agencia.trim())) e["dadosBancarios.agencia"] = "Agência deve ter só números.";
  if (b?.conta?.trim() && !/^\d{1,13}$/.test(b.conta.trim())) e["dadosBancarios.conta"] = "Conta deve ter só números.";
  if (f.pix?.chave?.trim() && !chavePixValida(f.pix.tipo, f.pix.chave)) e["pix.chave"] = `Chave PIX não corresponde ao tipo ${f.pix.tipo}.`;
  return e;
}

/** Mantém só os 4 últimos caracteres: "••••1234". */
export function mascarar(v?: string): string | undefined {
  if (!v) return v;
  const t = v.trim();
  return t.length <= 4 ? "••••" : `••••${t.slice(-4)}`;
}

/** Cópia com dados bancários e PIX mascarados — usada na auditoria e em telas de consulta. */
export function fornecedorMascarado(f: Fornecedor): Fornecedor {
  return {
    ...f,
    dadosBancarios: f.dadosBancarios && {
      ...f.dadosBancarios,
      agencia: mascarar(f.dadosBancarios.agencia),
      digitoAgencia: f.dadosBancarios.digitoAgencia ? "•" : undefined,
      conta: mascarar(f.dadosBancarios.conta),
      digitoConta: f.dadosBancarios.digitoConta ? "•" : undefined,
    },
    pix: f.pix && { ...f.pix, chave: mascarar(f.pix.chave) },
  };
}

/** Normaliza antes de salvar: só dígitos em documentos e códigos, UF maiúscula, campos vazios removidos. */
export function normalizarFornecedor(f: Fornecedor): Fornecedor {
  const limpo = (v?: string) => (v?.trim() ? v.trim() : undefined);
  const b = f.dadosBancarios;
  const temBanco = b && Object.entries(b).some(([k, v]) => k !== "tipoConta" && limpo(v as string));
  return {
    ...f,
    razaoSocial: f.razaoSocial.trim(),
    nomeFantasia: limpo(f.nomeFantasia) ?? f.razaoSocial.trim(),
    cnpj: f.cnpj?.trim() ? somenteDigitos(f.cnpj) : undefined,
    inscricaoEstadual: limpo(f.inscricaoEstadual),
    email: limpo(f.email)?.toLowerCase(),
    telefone: limpo(f.telefone),
    endereco: limpo(f.endereco),
    cidade: limpo(f.cidade),
    uf: limpo(f.uf)?.toUpperCase(),
    cep: f.cep?.trim() ? somenteDigitos(f.cep) : undefined,
    dadosBancarios: temBanco
      ? {
          codigoBanco: b!.codigoBanco ? somenteDigitos(b!.codigoBanco).padStart(3, "0") : undefined,
          nomeBanco: limpo(b!.nomeBanco) ?? nomeDoBanco(b!.codigoBanco),
          agencia: limpo(b!.agencia),
          digitoAgencia: limpo(b!.digitoAgencia),
          conta: limpo(b!.conta),
          digitoConta: limpo(b!.digitoConta),
          tipoConta: b!.tipoConta ?? "Corrente",
        }
      : undefined,
    pix: f.pix?.chave?.trim() ? { tipo: f.pix.tipo, chave: f.pix.chave.trim() } : undefined,
  };
}
