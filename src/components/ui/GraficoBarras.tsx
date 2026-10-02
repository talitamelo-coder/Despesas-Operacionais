import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SerieItem } from "@/domain/rules/indicadores";
import { formatarMoeda } from "@/domain/formatacao";
import { Vazio } from "./Diversos";

/**
 * Barras horizontais de UMA medida por categoria (um único tom — identidade vem do rótulo,
 * não da cor). Tooltip por barra; grade e eixos recessivos.
 */
export function GraficoBarras({ dados, formato = "moeda", altura }: { dados: SerieItem[]; formato?: "moeda" | "quantidade"; altura?: number }) {
  if (!dados.length) return <Vazio titulo="Sem dados para o período" />;
  const fmt = (v: number) => (formato === "moeda" ? formatarMoeda(v, "BRL", true) : String(v));
  const campo = formato === "moeda" ? "valor" : "quantidade";
  const h = altura ?? Math.max(160, dados.length * 34 + 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--color-borda)" />
          <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: "var(--color-texto-fraco)" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="nome" width={170} tick={{ fontSize: 12, fill: "var(--color-texto-suave)" }} axisLine={false} tickLine={false} tickFormatter={(s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s)} />
          <Tooltip
            cursor={{ fill: "var(--color-primaria-50)" }}
            formatter={(v) => [formato === "moeda" ? formatarMoeda(Number(v)) : `${v} contratos`, formato === "moeda" ? "Valor" : "Quantidade"]}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-borda)", fontSize: 12 }}
          />
          <Bar dataKey={campo} fill="var(--color-primaria-600)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 11, fill: "var(--color-texto-suave)", formatter: (v: unknown) => fmt(Number(v)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
