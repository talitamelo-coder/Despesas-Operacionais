-- Contrato por demanda: o valor anual passa a poder ser uma previsão de consumo (base do saldo).
-- Reforço de saldo usa a mesma tabela de aditivos/aportes; nada muda nela.
ALTER TABLE contratos ADD COLUMN valor_anual_estimado BOOLEAN NOT NULL DEFAULT FALSE
  COMMENT 'Contrato por demanda: valor anual é previsão de consumo (base do saldo)' AFTER valor_anual;
