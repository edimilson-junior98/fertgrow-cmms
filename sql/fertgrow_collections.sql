-- FertGrow CMMS: substitui a linha única e gigante de fertgrow_db (id=1, um
-- JSON de 4+ MB com TUDO dentro) por uma linha por "coleção" (ordens, ativos,
-- estoque, etc.). Cada alteração passa a gravar só a coleção que mudou, em vez
-- de reescrever o banco inteiro -- o que estava causando "canceling statement
-- due to statement timeout" no Postgres.
--
-- Rodar uma vez manualmente no SQL Editor do Supabase (projeto
-- woabzpjzjkaqkjmzsiqj). Não é executado automaticamente pelo app.

create table if not exists public.fertgrow_collections (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.fertgrow_collections enable row level security;

create policy "fertgrow_collections_select_all" on public.fertgrow_collections for select using (true);
create policy "fertgrow_collections_insert_all" on public.fertgrow_collections for insert with check (true);
create policy "fertgrow_collections_update_all" on public.fertgrow_collections for update using (true) with check (true);
create policy "fertgrow_collections_delete_all" on public.fertgrow_collections for delete using (true);

-- Habilita o Realtime (notificação instantânea de UPDATE) nesta tabela, igual
-- já está habilitado em fertgrow_db. Se já existir alguma publicação
-- "supabase_realtime" diferente ou isso já estiver configurado por fora, pode
-- dar erro de "already member of publication" -- nesse caso é só ignorar.
alter publication supabase_realtime add table public.fertgrow_collections;
