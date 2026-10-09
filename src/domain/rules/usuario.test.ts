import { describe, expect, it } from "vitest";
import { conferirSenha, gerarCredencial, usuarioPublico, validarUsuario } from "./usuario";
import type { Usuario } from "../types";

const u: Usuario = { id: "", nome: "Ana Souza", email: "ana@empresa.com.br", perfil: "Solicitante", area: "Comercial", ativo: true };

describe("cadastro de usuário", () => {
  it("exige nome, e-mail válido e único, senha mínima, perfil e área", () => {
    expect(validarUsuario(u, "123456", { novo: true, emailsExistentes: [] })).toEqual({});
    const e = validarUsuario({ ...u, nome: "", email: "x", area: "" }, "123", { novo: true, emailsExistentes: [] });
    expect(Object.keys(e).sort()).toEqual(["area", "email", "nome", "senha"]);
    expect(validarUsuario(u, "", { novo: true, emailsExistentes: [] }).senha).toBe("Informe a senha.");
    expect(validarUsuario(u, "", { novo: false, emailsExistentes: [] }).senha).toBeUndefined();
    expect(validarUsuario(u, "123456", { novo: true, emailsExistentes: ["ana@empresa.com.br"] }).email).toMatch(/Já existe/);
  });

  it("guarda só o hash da senha e confere corretamente", async () => {
    const c = await gerarCredencial("segredo1");
    expect(JSON.stringify(c)).not.toContain("segredo1");
    expect(await conferirSenha("segredo1", c)).toBe(true);
    expect(await conferirSenha("errada", c)).toBe(false);
    const pub = usuarioPublico({ ...u, credencial: c });
    expect(pub.credencial).toBeUndefined();
    expect(pub.temSenha).toBe(true);
  });
});
