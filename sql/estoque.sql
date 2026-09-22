-- FertGrow CMMS: tabela espelho de db.estoque, escrita apenas pelo app CMMS.
-- Leitura liberada para consumidores externos via a mesma chave anon já usada
-- em toda a aplicação. Nunca executado automaticamente pelo app — rodar uma
-- vez manualmente no SQL Editor do Supabase.

create table if not exists public.estoque (
  id                    text primary key,
  codigo                text not null,
  cod_produto           text not null default '',
  armazem               text not null default '',
  descricao             text not null,
  grupo                 text not null default '',
  unidade               text not null default 'un',
  qtd_atual             numeric not null default 0,
  custo_unitario        numeric not null default 0,
  custo_unitario_fifo1  numeric,
  saldo_atualizado      numeric not null default 0,
  status_saldo          text not null default '',
  updated_at            timestamptz not null default now(),
  constraint estoque_codigo_armazem_key unique (codigo, armazem)
);

alter table public.estoque enable row level security;

create policy "estoque_select_all" on public.estoque for select using (true);
create policy "estoque_insert_all" on public.estoque for insert with check (true);
create policy "estoque_update_all" on public.estoque for update using (true) with check (true);
create policy "estoque_delete_all" on public.estoque for delete using (true);
