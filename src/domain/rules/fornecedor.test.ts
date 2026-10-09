import { describe, expect, it } from "vitest";
import { chavePixValida, fornecedorMascarado, nomeDoBanco, normalizarFornecedor, validarFornecedor } from "./fornecedor";
import type { Fornecedor } from "../types";

const base: Fornecedor = { fornecedor_id: "f1", razaoSocial: "Fornecedor Ltda", nomeFantasia: "", cnpj: "11.222.333/0001-81", statusCadastral: "Ativo" };

describe("cadastro de fornecedor", () => {
  it("exige razão social e CNPJ (exceto estrangeiro ou potencial)", () => {
    expect(validarFornecedor(base)).toEqual({});
    expect(validarFornecedor({ ...base, cnpj: "" }).cnpj).toBe("Informe o CNPJ.");
    expect(validarFornecedor({ ...base, cnpj: "", estrangeiro: true }).cnpj).toBeUndefined();
    expect(validarFornecedor({ ...base, cnpj: "", statusCadastral: "Potencial" }).cnpj).toBeUndefined();
    expect(validarFornecedor({ ...base, cnpj: "11.222.333/0001-00" }).cnpj).toBe("CNPJ inválido.");
  });

  it("valida e-mail, telefone, UF, CEP e PIX", () => {
    const e = validarFornecedor({ ...base, email: "x@", telefone: "123", uf: "XX", cep: "123", pix: { tipo: "E-mail", chave: "nao-e-email" } });
    expect(Object.keys(e).sort()).toEqual(["cep", "email", "pix.chave", "telefone", "uf"]);
    expect(chavePixValida("CNPJ", "11.222.333/0001-81")).toBe(true);
    expect(chavePixValida("CPF", "529.982.247-25")).toBe(true);
    expect(chavePixValida("Telefone", "(11) 99999-9999")).toBe(true);
    expect(chavePixValida("Chave aleatória", "123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("sugere o nome do banco e normaliza", () => {
    expect(nomeDoBanco("341")).toBe("Itaú Unibanco S.A.");
    const n = normalizarFornecedor({ ...base, uf: "sp", cep: "01310-100", dadosBancarios: { codigoBanco: "1", agencia: "0001", conta: "12345" } });
    expect(n.cnpj).toBe("11222333000181");
    expect(n.uf).toBe("SP");
    expect(n.cep).toBe("01310100");
    expect(n.nomeFantasia).toBe("Fornecedor Ltda");
    expect(n.dadosBancarios).toMatchObject({ codigoBanco: "001", nomeBanco: "Banco do Brasil S.A.", tipoConta: "Corrente" });
    expect(normalizarFornecedor({ ...base, dadosBancarios: { tipoConta: "Corrente" } }).dadosBancarios).toBeUndefined();
  });

  it("mascara conta, agência e chave PIX", () => {
    const m = fornecedorMascarado({ ...base, dadosBancarios: { agencia: "0001", conta: "12345678", digitoConta: "9" }, pix: { tipo: "E-mail", chave: "financeiro@empresa.com.br" } });
    expect(m.dadosBancarios?.conta).toBe("••••5678");
    expect(m.dadosBancarios?.agencia).toBe("••••");
    expect(m.dadosBancarios?.digitoConta).toBe("•");
    expect(m.pix?.chave).toBe("••••m.br");
  });
});
