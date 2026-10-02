import { useCallback, useEffect, useRef, useState } from "react";
import { aoMudar } from "@/services";

/**
 * Consulta assíncrona à camada de serviços, com recarga automática quando os dados mudam.
 * Mesmo comportamento com mock ou API REST.
 */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[]): { dados: T | undefined; carregando: boolean; erro?: string; recarregar: () => void } {
  const [dados, setDados] = useState<T>();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string>();
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executar = useCallback(fn, deps);

  const recarregar = useCallback(() => {
    const atual = ++seq.current;
    setCarregando(true);
    executar()
      .then((d) => atual === seq.current && (setDados(d), setErro(undefined)))
      .catch((e: Error) => atual === seq.current && setErro(e.message))
      .finally(() => atual === seq.current && setCarregando(false));
  }, [executar]);

  useEffect(() => {
    recarregar();
    return aoMudar(recarregar);
  }, [recarregar]);

  return { dados, carregando, erro, recarregar };
}
