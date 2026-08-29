-- Conferência detalhada: Ourinhos / ago / Açougue
-- Compare Σ abs com o Excel filtrado da mesma forma.

select
  l.cod_dcto,
  count(*) as linhas,
  round(sum(l.valor_original), 2) as soma_original,
  round(sum(abs(l.valor_original)), 2) as soma_abs,
  round(sum(l.valor_apresentacao), 2) as soma_apresentacao
from lancamentos l
join lojas j on j.id = l.loja_id
join departamentos d on d.id = l.departamento_id
where j.nome = 'Ourinhos'
  and l.mes = 'ago'
  and d.nome = 'Açougue'
group by l.cod_dcto
order by l.cod_dcto;

-- Listar linhas 5201/5601 para cruzar com o BI linha a linha
select
  l.data,
  l.cod_dcto,
  p.codigo as cod_produto,
  p.nome as produto,
  l.quantidade_original,
  l.valor_original,
  l.valor_apresentacao
from lancamentos l
join lojas j on j.id = l.loja_id
join departamentos d on d.id = l.departamento_id
join produtos p on p.id = l.produto_id
where j.nome = 'Ourinhos'
  and l.mes = 'ago'
  and d.nome = 'Açougue'
  and l.cod_dcto in ('5201','5601')
order by l.cod_dcto, l.data, p.codigo;
