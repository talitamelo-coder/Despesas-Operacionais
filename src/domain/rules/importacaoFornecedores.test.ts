import { describe, expect, it } from "vitest";
import { completarFornecedor, COLUNAS_FORNECEDORES, processarFornecedores } from "./importacaoFornecedores";
import type { Fornecedor } from "../types";

const cab = COLUNAS_FORNECEDORES.map((c) => c.rotulo);
const linha = (v: Record<string, string>) => COLUNAS_FORNECEDORES.map((c) => v[c.campo] ?? "");

describe("aba Fornecedores da carga", () => {
  it("lê endereço e dados bancários, separa dígito da conta e recusa CNPJ inválido e repetido", () => {
    const r = processarFornecedores(cab, [
      linha({ codigo: "51233", razaoSocial: "Fornecedor A Ltda", nomeFantasia: "********", cnpj: "11.222.333/0001-81", endereco: "Rua X, 10", cidade: "Rio de Janeiro", uf: "rj", cep: "20000-000", codigoBanco: "341", agencia: "1234", conta: "30527-5", tipoConta: "corrente" }),
      linha({ razaoSocial: "Fornecedor B", cnpj: "11.111.111/1111-11" }),
      linha({ razaoSocial: "Fornecedor A de novo", cnpj: "11222333000181" }),
    ]);
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4]);
    const f = r.fornecedores[0];
    expect(f).toMatchObject({ codigoFornecedor: "51233", cnpj: "11222333000181", uf: "RJ", cep: "20000000", nomeFantasia: "Fornecedor A Ltda" });
    expect(f.dadosBancarios).toMatchObject({ codigoBanco: "341", conta: "30527", digitoConta: "5", tipoConta: "Corrente" });
  });

  it("completa o cadastro existente sem sobrescrever o que já está preenchido", () => {
    const atual: Fornecedor = { fornecedor_id: "f1", razaoSocial: "A", nomeFantasia: "A", cnpj: "11222333000181", email: "ja@tem.com", dadosBancarios: { codigoBanco: "001", conta: "999" }, statusCadastral: "Ativo" };
    const planilha: Fornecedor = { fornecedor_id: "", razaoSocial: "A", nomeFantasia: "A Fantasia", cnpj: "11222333000181", email: "outro@x.com", endereco: "Rua Y", dadosBancarios: { codigoBanco: "341", conta: "1" }, statusCadastral: "Ativo" };
    const { fornecedor, campos } = completarFornecedor(atual, planilha);
    expect(fornecedor.email).toBe("ja@tem.com");
    expect(fornecedor.dadosBancarios?.conta).toBe("999");
    expect(fornecedor.endereco).toBe("Rua Y");
    expect(campos.sort()).toEqual(["endereco", "nomeFantasia"]);
  });
});
