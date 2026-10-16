import { somenteDigitos } from "../formatacao";
import { cnpjValido } from "./importacao";
import type { Cliente } from "../types";

/** Cadastro de clientes: separado do de fornecedores. CNPJ obrigatório só para cliente nacional. */
export function validarCliente(c: Cliente, existentes: Cliente[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.razaoSocial?.trim()) e.razaoSocial = "Informe a razão social.";
  if (c.estrangeiro) {
    if (!c.pais?.trim()) e.pais = "Informe o país do cliente.";
  } else if (!c.cnpj?.trim()) e.cnpj = "Informe o CNPJ.";
  else if (!cnpjValido(c.cnpj)) e.cnpj = "CNPJ inválido.";
  else if (existentes.some((x) => x.cliente_id !== c.cliente_id && x.cnpj && somenteDigitos(x.cnpj) === somenteDigitos(c.cnpj!))) e.cnpj = "Já existe cliente com este CNPJ.";
  if (c.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) e.email = "E-mail inválido.";
  return e;
}

export function novoCliente(): Cliente {
  return { cliente_id: "", razaoSocial: "", nomeFantasia: "", statusCadastral: "Ativo" };
}
