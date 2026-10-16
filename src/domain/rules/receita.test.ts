import { describe, expect, it } from "vitest";
import { validarCliente } from "./clientes";
import { aplicarAditivoRegistrado, errosContratoReceita, fixoNoPeriodo, receitaMensalNaData, valorMensalFixoNaData } from "./receita";
import { erroSaldoEmissao, saldoDoContrato } from "./saldo";
import type { Contrato, EmissaoFaturamento } from "../types";

const contrato = (receita: Contrato["receita"], vig: Partial<Contrato["vigencia"]> = {}): Contrato =>
  ({
    contrato_id: "r1", codigo: "CT-R", natureza: "Receita", status: "Vigente", clienteId: "cl1", fornecedorId: "", empresaId: "e", objeto: "WiFi", gestorId: "u",
    condicoes: { moeda: "BRL", valorAnual: 0, periodicidadePagamento: "Mensal", condicaoPagamento: "" },
    vigencia: { dataInicio: "2026-01-01", dataFim: "2026-12-31", tipoVigencia: "Prazo determinado", avisoPrevioDias: 60, renovacaoAutomatica: false, prazoGestorDias: 30, ...vig },
    receita,
  }) as unknown as Contrato;
const nf = (valor: number, status: EmissaoFaturamento["status"] = "Emitida"): EmissaoFaturamento => ({ id: `n${valor}`, contrato_id: "r1", numeroDocumento: "NF", data: "2026-03-10", valor, status, origem: "Contas a receber", registradoEm: "" });
const vazio = { pedidos: [], aportes: [], linhas: [], licencas: { licencas: [], movimentacoes: [], atribuicoes: [], colaboradores: [], cotacoes: [], parametros: [] } };

describe("contratos de receita", () => {
  it("escalonamento previsto muda o fixo a partir da data", () => {
    const r = { tipoReceita: "Fixa" as const, valorMensalFixo: 1000, escalonamento: [{ aPartirDe: "2026-11-01", valorMensalFixo: 900 }] };
    expect(valorMensalFixoNaData(r, "2026-10-31")).toBe(1000);
    expect(valorMensalFixoNaData(r, "2026-11-01")).toBe(900);
    expect(fixoNoPeriodo(r, "2026-01-01", "2026-12-31")).toBe(10 * 1000 + 2 * 900);
    expect(receitaMensalNaData({ ...r, contratoPrincipalId: "x" }, "2026-05-01")).toBe(0);
  });

  it("saldo a faturar = contratado − notas emitidas; emissão acima do saldo é recusada", () => {
    const c = contrato({ tipoReceita: "Fixa", valorMensalFixo: 1000 });
    const s = saldoDoContrato(c, { ...vazio, emissoes: [nf(3000), nf(500, "Cancelada")] });
    expect(s.contratado).toBe(12000);
    expect(s.realizado).toBe(3000);
    expect(s.disponivel).toBe(9000);
    expect(erroSaldoEmissao(s, 9500, "Vigente")).toMatch(/aditivo/);
    expect(erroSaldoEmissao(s, 1000, "Vigente")).toBeUndefined();
    const total = saldoDoContrato(contrato({ tipoReceita: "Variável", valorMensalVariavelEstimado: 50, valorTotalContratado: 5000 }), vazio);
    expect(total.contratado).toBe(5000);
    expect(saldoDoContrato(contrato({ tipoReceita: "Variável", valorMensalVariavelEstimado: 50 }), vazio).indisponivel).toMatch(/variável/);
  });

  it("valida o registro e o aditivo (valores só mudam por aditivo)", () => {
    expect(errosContratoReceita({ ...contrato({ tipoReceita: "Fixa" }) })).toContain("Informe o valor mensal fixo.");
    expect(errosContratoReceita(contrato({ tipoReceita: "Variável", contratoPrincipalId: "p" }))).toEqual([]);
    const c = contrato({ tipoReceita: "Fixa", valorMensalFixo: 1000 });
    const r = aplicarAditivoRegistrado(c, { contrato_id: "r1", numero: "2º Aditivo", data: "2026-06-01", tipo: "Valor e prazo", descricao: "Renegociação", novoValorMensalFixo: 1200, aPartirDe: "2026-07-01", novaDataFim: "2027-06-30" });
    expect(r.erros).toEqual([]);
    expect(r.contrato.vigencia.dataFim).toBe("2027-06-30");
    expect(valorMensalFixoNaData(r.contrato.receita!, "2026-08-01")).toBe(1200);
    expect(c.receita!.escalonamento).toBeUndefined(); // o original não é alterado
    expect(aplicarAditivoRegistrado(c, { contrato_id: "r1", numero: "", data: "", tipo: "Valor", descricao: "" }).erros.length).toBeGreaterThan(2);
  });

  it("cliente: CNPJ obrigatório só no Brasil", () => {
    const base = { cliente_id: "", razaoSocial: "Cliente", nomeFantasia: "", statusCadastral: "Ativo" as const };
    expect(validarCliente(base, []).cnpj).toBe("Informe o CNPJ.");
    expect(validarCliente({ ...base, estrangeiro: true, pais: "Chile" }, [])).toEqual({});
    expect(validarCliente({ ...base, cnpj: "11.222.333/0001-81" }, [{ ...base, cliente_id: "x", cnpj: "11222333000181" }]).cnpj).toMatch(/Já existe/);
  });
});
