import { Link } from "react-router-dom";
import { Vazio } from "@/components/ui/Diversos";

export function NaoEncontrado() {
  return <Vazio titulo="Página não encontrada" descricao="O endereço acessado não existe neste módulo." acao={<Link to="/" className="text-sm text-primaria-700">Voltar ao Dashboard</Link>} />;
}
