import { describe, expect, it } from "vitest";
import { ordenarAlfabetica } from "./formatacao";

describe("ordem alfabética", () => {
  it("ignora acento e maiúsculas, ordena números pelo valor e não altera a original", () => {
    const original = ["Operações", "atendimento", "Área B", "Engenharia", "Item 10", "Item 2"];
    expect(ordenarAlfabetica(original)).toEqual(["Área B", "atendimento", "Engenharia", "Item 2", "Item 10", "Operações"]);
    expect(original[0]).toBe("Operações");
    expect(ordenarAlfabetica([{ n: "Zeta" }, { n: "Alfa" }], (x) => x.n).map((x) => x.n)).toEqual(["Alfa", "Zeta"]);
  });
});
