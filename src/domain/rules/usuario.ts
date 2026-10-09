import type { Credencial, Usuario } from "../types";

/** Regras do cadastro de usuário e da senha. */

export const SENHA_MINIMA = 6;
const ITERACOES = 210_000; // recomendação OWASP para PBKDF2-SHA256
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AREAS_PADRAO = ["Atendimento", "Comercial", "Engenharia", "Facilities", "Financeiro", "Jurídico", "Marketing", "Operações", "Recursos Humanos", "Suprimentos", "Tecnologia"];

/** Erros por campo. `novo`: senha obrigatória no cadastro; na edição, vazia = manter a atual. */
export function validarUsuario(u: Usuario, senha: string, opcoes: { novo: boolean; emailsExistentes: string[] }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!u.nome.trim()) e.nome = "Informe o nome completo.";
  if (!u.email.trim()) e.email = "Informe o e-mail.";
  else if (!EMAIL.test(u.email.trim())) e.email = "E-mail inválido.";
  else if (opcoes.emailsExistentes.includes(u.email.trim().toLowerCase())) e.email = "Já existe usuário com este e-mail.";
  if (opcoes.novo && !senha) e.senha = "Informe a senha.";
  else if (senha && senha.length < SENHA_MINIMA) e.senha = `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`;
  if (!u.perfil) e.perfil = "Selecione o perfil.";
  if (!u.area?.trim()) e.area = "Selecione a área.";
  return e;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteracoes }, chave, 256);
  return new Uint8Array(bits);
}

export async function gerarCredencial(senha: string): Promise<Credencial> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { algoritmo: "PBKDF2-SHA256", iteracoes: ITERACOES, salt: b64(salt), hash: b64(await derivar(senha, salt, ITERACOES)) };
}

export async function conferirSenha(senha: string, c: Credencial): Promise<boolean> {
  const calculado = await derivar(senha, deB64(c.salt), c.iteracoes);
  const esperado = deB64(c.hash);
  if (calculado.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= calculado[i] ^ esperado[i];
  return dif === 0;
}

/** Versão pública do usuário: sem credencial. */
export function usuarioPublico(u: Usuario): Usuario {
  const { credencial, ...resto } = u;
  return { ...resto, temSenha: Boolean(credencial) };
}
