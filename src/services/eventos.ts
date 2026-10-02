/** Barramento mínimo de mudanças: telas reconsultam quando os dados mudam. */
type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

export function aoMudar(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificarMudanca(): void {
  for (const fn of ouvintes) fn();
}
