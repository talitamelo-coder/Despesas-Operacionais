import { describe, expect, it } from "vitest";
import { erroSaldoApos, erroSaldoPedido, faixaAlertaSaldo, mesesDaLinha, periodoDoSaldo, saldoDoContrato, type ContextoSaldo } from "./saldo";
import type { Contrato, Licenca, LinhaTelefonica, MovimentacaoLicenca, PedidoContrato } from "../types";

const contrato = (extra: Partial<Contrato["vigencia"]> = {}, valorAnual = 12000): Contrato =>
  ({
    contrato_id: "c1",
    codigo: "CT-1",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual, periodicidadePagamento: "Mensal", condicaoPagamento: "" },
    vigencia: { dataInicio: "2026-01-01", dataFim: "2027-12-31", tipoVigencia: "Prazo determinado", avisoPrevioDias: 30, renovacaoAutomatica: false, prazoGestorDias: 30, ...extra },
  }) as unknown as Contrato;
const pedido = (valor: number, status: PedidoContrato["status"] = "Aprovado", data = "2026-03-01"): PedidoContrato => ({ id: `p${valor}${status}`, contrato_id: "c1", numero: "P", data, valor, status, origem: "Registro manual", registradoPorId: "u", registradoEm: "" });
const vazio: ContextoSaldo = { pedidos: [], aportes: [], linhas: [], licencas: { licencas: [], movimentacoes: [], atribuicoes: [], colaboradores: [], cotacoes: [], parametros: [] } };

describe("saldo do contrato", () => {
  it("contratado = valor anual × anos da vigência + aportes; consumido = pedidos", () => {
    const s = saldoDoContrato(contrato(), { ...vazio, pedidos: [pedido(5000), pedido(3000, "Pago"), pedido(999, "Cancelado")], aportes: [{ id: "a", contrato_id: "c1", data: "2026-05-01", valor: 1000, motivo: "Aditivo", registradoPorId: "u", registradoEm: "" }] });
    expect(s.contratadoBase).toBeCloseTo(24000, -1);
    expect(s.contratado).toBeCloseTo(25000, -1);
    expect(s.comprometido).toBe(5000);
    expect(s.realizado).toBe(3000);
    expect(s.disponivel).toBeCloseTo(17000, -1);
  });

  it("bloqueia pedido acima do disponível e contrato sem vigência", () => {
    const s = saldoDoContrato(contrato({}, 1200), vazio);
    expect(erroSaldoPedido(s, 5000, "Vigente")).toMatch(/Adicione pelo menos/);
    expect(erroSaldoPedido(s, 100, "Vigente")).toBeUndefined();
    expect(erroSaldoPedido(s, 100, "Cancelado")).toMatch(/não aceita/);
    expect(erroSaldoPedido(saldoDoContrato(contrato({ dataInicio: "" }), vazio), 1, "Vigente")).toMatch(/vigência/);
  });

  it("prazo indeterminado: saldo do ciclo anual", () => {
    const c = contrato({ tipoVigencia: "Prazo indeterminado", dataFim: "", dataInicio: "2025-03-10" });
    expect(periodoDoSaldo(c)).toEqual({ inicio: "2025-03-10", fim: "2026-03-09" });
    const s = saldoDoContrato(c, { ...vazio, pedidos: [pedido(500, "Aprovado", "2025-05-01"), pedido(700, "Aprovado", "2026-05-01")] });
    expect(s.comprometido).toBe(500);
  });

  it("licenças e linhas vinculadas consomem o saldo", () => {
    const l: Licenca = { id: "l", fornecedorId: "f", contrato_id: "c1", produto: "X", tipoCobranca: "Assento", moeda: "BRL", periodicidade: "Mensal", vencimentoTipo: "Mensal", status: "Ativa", criadoEm: "", atualizadoEm: "" };
    const m: MovimentacaoLicenca = { id: "m", licencaId: "l", tipo: "Compra", data: "2026-01-05", quantidade: 2, precoUnitario: 50, responsavel: "R", valorAnualAntes: 0, valorAnualDepois: 1200, registradoPorId: "u", registradoEm: "" };
    const linha: LinhaTelefonica = { id: "t", numero: "11900000000", operadora: "O", contrato_id: "c1", valorMensal: 10, situacao: "Ativa", criadoEm: "2026-07-15T00:00:00Z", atualizadoEm: "2026-07-15T00:00:00Z" };
    const s = saldoDoContrato(contrato(), { ...vazio, linhas: [linha], licencas: { ...vazio.licencas, licencas: [l], movimentacoes: [m] } });
    expect(s.licencas).toBe(100 * 24);
    expect(mesesDaLinha(linha, periodoDoSaldo(contrato())!)).toBe(18);
    expect(s.linhas).toBe(180);
    expect(faixaAlertaSaldo({ ...s, percentualConsumido: 85 })).toBe(80);
  });

  it("operação que deixa o saldo negativo é bloqueada; a que melhora, não", () => {
    const antes = saldoDoContrato(contrato({}, 1200), vazio);
    expect(erroSaldoApos(antes, { ...antes, disponivel: -10 }, "CT-1")).toMatch(/Adicione saldo/);
    expect(erroSaldoApos({ ...antes, disponivel: -50 }, { ...antes, disponivel: -10 }, "CT-1")).toBeUndefined();
  });
});
