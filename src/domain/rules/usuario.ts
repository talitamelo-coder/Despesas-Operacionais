import type { Credencial, Usuario } from "../types";

/** Regras do cadastro de usuário e da senha. */

export const SENHA_MINIMA = 6;
const ITERACOES = 210_000; // recomendação OWASP para PBKDF2-SHA256
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AREAS_PADRAO = ["Atendimento", "Comercial", "Engenharia", "Facilities", "Financeiro", "Jurídico", "Marketing", "Operações", "Recursos Humanos", "Suprimentos", "Tecnologia"];

const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del", "van", "von"]);
const SUFIXOS = new Set(["junior", "júnior", "jr", "jr.", "filho", "neto", "sobrinho", "segundo", "terceiro"]);

/**
 * Nome e sobrenome a partir do nome completo: primeiro nome + último sobrenome, sem partículas
 * ("Maria Clara de Souza Lima" → "Maria Lima"). Sufixos ficam com o sobrenome ("Paulo Lima Júnior" → "Paulo Lima Júnior").
 */
export function nomeCurto(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const ultimo = partes.length - 1;
  const temSufixo = SUFIXOS.has(partes[ultimo].toLowerCase());
  const fim = temSufixo ? ultimo - 1 : ultimo;
  const sobrenome = partes.slice(1, fim + 1).filter((p) => !PARTICULAS.has(p.toLowerCase())).at(-1);
  return [partes[0], sobrenome, temSufixo ? partes[ultimo] : undefined].filter(Boolean).join(" ");
}

/** Nome mostrado nas telas: o informado ou, se vazio, o sugerido pelo nome completo. */
export function nomeDeExibicao(u: Pick<Usuario, "nome" | "nomeExibicao">): string {
  return u.nomeExibicao?.trim() || nomeCurto(u.nome);
}

/** Nome completo padronizado: espaços únicos e partículas em minúsculas ("Ana De Souza" → "Ana de Souza"). */
export function padronizarNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes
    .map((p, i) => {
      if (i > 0 && PARTICULAS.has(p.toLowerCase())) return p.toLowerCase();
      return p === p.toUpperCase() || p === p.toLowerCase() ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p;
    })
    .join(" ");
}

const chaveNome = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const tokens = (s: string) => chaveNome(s).split(" ").filter((t) => !PARTICULAS.has(t));

export type SituacaoNomeLote = "Novo" | "Já cadastrado" | "Possível duplicado" | "Repetido na lista";

export interface PlanoUsuarioLote {
  nome: string;
  situacao: SituacaoNomeLote;
  /** Usuário existente parecido (mesmo primeiro nome e sobrenomes contidos um no outro). */
  parecido?: string;
}

/**
 * Cadastro em lote a partir de uma lista de nomes (um por linha). Quem já existe (mesmo nome, sem
 * diferenciar acento/maiúscula) é ignorado; nome parecido com um existente ("Rodrigo Gabriel" ×
 * "Rodrigo Waetge Gabriel") é apontado para a pessoa decidir.
 */
export function planejarUsuariosEmLote(nomes: string[], existentes: Pick<Usuario, "nome" | "nomeExibicao">[]): PlanoUsuarioLote[] {
  const vistos = new Set<string>();
  const plano: PlanoUsuarioLote[] = [];
  for (const bruto of nomes) {
    const nome = padronizarNome(bruto);
    if (!nome) continue;
    const chave = chaveNome(nome);
    if (vistos.has(chave)) {
      plano.push({ nome, situacao: "Repetido na lista" });
      continue;
    }
    vistos.add(chave);
    const igual = existentes.find((u) => chaveNome(u.nome) === chave || (u.nomeExibicao && chaveNome(u.nomeExibicao) === chave));
    if (igual) {
      plano.push({ nome, situacao: "Já cadastrado", parecido: igual.nome });
      continue;
    }
    const t = tokens(nome);
    const parecido = existentes.find((u) => {
      const e = tokens(u.nome);
      if (!e.length || e[0] !== t[0]) return false;
      const [menor, maior] = e.length <= t.length ? [e, t] : [t, e];
      return menor.length >= 2 && menor.every((x) => maior.includes(x));
    });
    plano.push(parecido ? { nome, situacao: "Possível duplicado", parecido: parecido.nome } : { nome, situacao: "Novo" });
  }
  return plano;
}

/** Erros por campo. `novo`: senha obrigatória no cadastro; na edição, vazia = manter a atual. */
export function validarUsuario(u: Usuario, senha: string, opcoes: { novo: boolean; emailsExistentes: string[] }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!u.nome.trim()) e.nome = "Informe o nome completo.";
  if (u.nomeExibicao && u.nomeExibicao.trim().length > 60) e.nomeExibicao = "Use até 60 caracteres (nome e sobrenome).";
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
