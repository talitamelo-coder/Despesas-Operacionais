import { describe, expect, it } from "vitest";
import { erroSaldoPedido, faixaAlertaSaldo, periodoDoSaldo, saldoDoContrato, type ContextoSaldo } from "./saldo";
import type { Contrato, PedidoContrato } from "../types";

const contrato = (extra: Partial<Contrato["vigencia"]> = {}, valorAnual = 12000): Contrato =>
  ({
    contrato_id: "c1",
    codigo: "CT-1",
    status: "Vigente",
    condicoes: { moeda: "BRL", valorAnual, periodicidadePagamento: "Mensal", condicaoPagamento: "" },
    vigencia: { dataInicio: "2026-01-01", dataFim: "2027-12-31", tipoVigencia: "Prazo determinado", avisoPrevioDias: 30, renovacaoAutomatica: false, prazoGestorDias: 30, ...extra },
  }) as unknown as Contrato;
const pedido = (valor: number, status: PedidoContrato["status"] = "Aprovado", data = "2026-03-01"): PedidoContrato => ({ id: `p${valor}${status}`, contrato_id: "c1", numero: "P", data, valor, status, origem: "Registro manual", registradoPorId: "u", registradoEm: "" });
const vazio: ContextoSaldo = { pedidos: [], aportes: [] };

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
    const vig = contrato();
    expect(erroSaldoPedido(s, 5000, vig)).toMatch(/Adicione pelo menos/);
    expect(erroSaldoPedido(s, 100, vig)).toBeUndefined();
    // Cancelado (não renovado) segue aceitando até o fim da vigência; encerrado não.
    expect(erroSaldoPedido(s, 100, { status: "Cancelado", vigencia: { ...vig.vigencia, dataFim: "2027-12-31" } }, "2027-06-01")).toBeUndefined();
    expect(erroSaldoPedido(s, 100, { status: "Cancelado", vigencia: { ...vig.vigencia, dataFim: "2027-12-31" } }, "2028-01-02")).toMatch(/não aceita/);
    expect(erroSaldoPedido(s, 100, { ...vig, status: "Encerrado" })).toMatch(/não aceita/);
    expect(erroSaldoPedido(saldoDoContrato(contrato({ dataInicio: "" }), vazio), 1, vig)).toMatch(/vigência/);
  });

  it("prazo indeterminado: saldo do ciclo anual", () => {
    const c = contrato({ tipoVigencia: "Prazo indeterminado", dataFim: "", dataInicio: "2025-03-10" });
    expect(periodoDoSaldo(c)).toEqual({ inicio: "2025-03-10", fim: "2026-03-09" });
    const s = saldoDoContrato(c, { ...vazio, pedidos: [pedido(500, "Aprovado", "2025-05-01"), pedido(700, "Aprovado", "2026-05-01")] });
    expect(s.comprometido).toBe(500);
  });

  it("alerta de saldo em 80% e 100%", () => {
    const s = saldoDoContrato(contrato(), vazio);
    expect(faixaAlertaSaldo({ ...s, percentualConsumido: 85 })).toBe(80);
    expect(faixaAlertaSaldo({ ...s, percentualConsumido: 100 })).toBe(100);
  });
});
