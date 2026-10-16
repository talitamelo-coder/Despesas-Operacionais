import { describe, expect, it } from "vitest";
import { conferirSenha, gerarCredencial, usuarioPublico, validarUsuario, nomeCurto, nomeDeExibicao } from "./usuario";
import type { Usuario } from "../types";
import { comPerfis, perfisDo, temPerfil, usuarioPode } from "./permissoes";

const u: Usuario = { id: "", nome: "Ana Souza", email: "ana@empresa.com.br", perfil: "Solicitante", area: "Comercial", ativo: true };

describe("vários perfis na mesma pessoa", () => {
  it("permissões são a soma dos perfis", () => {
    const u = { perfil: "Solicitante" as const, perfisAdicionais: ["Gestor" as const] };
    expect(usuarioPode(u, "visualizar")).toBe(true);
    expect(usuarioPode(u, "avaliar_renovacao")).toBe(true);
    expect(usuarioPode({ perfil: "Solicitante" }, "avaliar_renovacao")).toBe(false);
    expect(temPerfil(u, "Gestor")).toBe(true);
    expect(perfisDo({ perfil: "Gestor", perfisAdicionais: ["Gestor", "Leitura"] })).toEqual(["Gestor", "Leitura"]);
    expect(comPerfis(["Solicitante", "Gestor"])).toEqual({ perfil: "Gestor", perfisAdicionais: ["Solicitante"] });
    expect(comPerfis(["Juridico"])).toEqual({ perfil: "Juridico", perfisAdicionais: undefined });
  });
});

describe("nome de exibição", () => {
  it("sugere nome e sobrenome a partir do nome completo", () => {
    expect(nomeCurto("Maria Clara de Souza Lima")).toBe("Maria Lima");
    expect(nomeCurto("João da Silva")).toBe("João Silva");
    expect(nomeCurto("Paulo Sérgio Lima Júnior")).toBe("Paulo Lima Júnior");
    expect(nomeCurto("Ana Souza")).toBe("Ana Souza");
    expect(nomeCurto("  Talita  ")).toBe("Talita");
    expect(nomeDeExibicao({ nome: "Maria Clara de Souza Lima", nomeExibicao: "Clara Lima" })).toBe("Clara Lima");
    expect(nomeDeExibicao({ nome: "Maria Clara de Souza Lima", nomeExibicao: " " })).toBe("Maria Lima");
  });
});

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
