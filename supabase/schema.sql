-- Minhas tarefas (beta): banco de dados
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem quebrar nada (usa "if not exists" / "or replace").

------------------------------------------------------------------
-- 1. Tarefas: cada linha pertence a um usuário
------------------------------------------------------------------
create table if not exists public.tarefas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint tarefas_tamanho check (pg_column_size(data) < 20000)
);

create index if not exists tarefas_user_idx on public.tarefas (user_id, criada_em desc);

alter table public.tarefas enable row level security;

drop policy if exists tarefas_proprias on public.tarefas;
create policy tarefas_proprias on public.tarefas
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- O Supabase libera tudo por padrão; aqui fechamos e abrimos só o necessário.
revoke all on public.tarefas from anon, authenticated;
grant select, delete on public.tarefas to authenticated;
grant insert (data) on public.tarefas to authenticated;                   -- user_id vem de auth.uid()
grant update (data, atualizada_em) on public.tarefas to authenticated;    -- ninguém troca o dono

-- Limite por pessoa, para um erro não encher o banco.
create or replace function public.limite_tarefas() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.tarefas where user_id = new.user_id) >= 3000 then
    raise exception 'limite de tarefas atingido';
  end if;
  return new;
end $$;

drop trigger if exists tarefas_limite on public.tarefas;
create trigger tarefas_limite before insert on public.tarefas
  for each row execute function public.limite_tarefas();

-- Atualização parcial de uma tarefa (mescla os campos enviados).
create or replace function public.atualizar_tarefa(p_id uuid, p_patch jsonb) returns void
language sql security invoker set search_path = '' as $$
  update public.tarefas
     set data = data || p_patch, atualizada_em = now()
   where id = p_id;
$$;

revoke all on function public.atualizar_tarefa(uuid, jsonb) from public, anon;
grant execute on function public.atualizar_tarefa(uuid, jsonb) to authenticated;

------------------------------------------------------------------
-- 2. Registro de uso (um registro por pessoa por dia)
--    As pessoas não leem nem escrevem esta tabela direto.
------------------------------------------------------------------
create table if not exists public.acessos (
  user_id     uuid not null references auth.users(id) on delete cascade,
  dia         date not null,
  aberturas   int  not null default 1,
  primeiro_em timestamptz not null default now(),
  ultimo_em   timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.acessos enable row level security;
revoke all on public.acessos from anon, authenticated;

create or replace function public.registrar_acesso() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  insert into public.acessos (user_id, dia)
  values (uid, (now() at time zone 'America/Sao_Paulo')::date)
  on conflict (user_id, dia)
  do update set aberturas = public.acessos.aberturas + 1, ultimo_em = now();
end $$;

revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

------------------------------------------------------------------
-- 3. Painel de uso (só você vê, pelo painel do Supabase)
--    Mostra e-mail, primeiro e último dia de uso, dias de uso e
--    quantidade de tarefas. Não mostra o conteúdo das tarefas.
------------------------------------------------------------------
create or replace view public.uso_resumo as
select u.email,
       u.created_at::date                         as cadastro,
       min(a.dia)                                 as primeiro_dia,
       max(a.dia)                                 as ultimo_dia,
       (current_date - max(a.dia))                as dias_sem_voltar,
       count(a.dia)                               as dias_de_uso,
       coalesce(sum(a.aberturas), 0)              as aberturas,
       (select count(*) from public.tarefas t where t.user_id = u.id) as tarefas
  from auth.users u
  left join public.acessos a on a.user_id = u.id
 group by u.id, u.email, u.created_at
 order by max(a.dia) desc nulls last;

revoke all on public.uso_resumo from anon, authenticated;

------------------------------------------------------------------
-- 4. Excluir a própria conta e todos os dados (LGPD)
------------------------------------------------------------------
create or replace function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  delete from auth.users where id = auth.uid();   -- apaga tarefas e acessos em cascata
end $$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
