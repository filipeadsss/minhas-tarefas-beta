# Minhas tarefas (beta)

Versão de teste do sistema de tarefas para outras pessoas usarem. Tem dois modos, escolhidos no arquivo `config.js`:

| | **Local** (padrão, comece por aqui) | **Nuvem** (segunda fase) |
|---|---|---|
| Conta e senha | Não tem. A pessoa abre o link e usa | E-mail e senha |
| Onde ficam as tarefas | No navegador da própria pessoa | No Supabase (banco online) |
| Entre pessoas | Nenhuma conexão (cada navegador é um sistema) | Nenhuma conexão (regras de acesso no banco) |
| Celular + computador | Não sincroniza | Sincroniza |
| Você vê quem usa | Só visitas por dia, sem identificar | Sim: dias de uso e último acesso por pessoa |
| O que você precisa montar | GitHub + Vercel | GitHub + Vercel + Supabase |

O que o sistema tem: adicionar, editar, mover, concluir e excluir tarefas; abas Urgente, Aguardando, Acompanhando, Início do dia, Hoje, Noite, Próximos dias, Revisar e Finalizadas; compromissos com calendário; filtro por origem; visão em quadros ou lista; backup e restauração.

O que ficou de fora de propósito: tarefas recorrentes, avisos por e-mail, previsão do tempo e integrações (Google Agenda, Claude). Tudo isso dependia da sua conta.

Arquivos: `index.html`, `style.css`, `app.js` (o site, sem etapa de build), `config.js` (modo e dados do Supabase), `privacidade.html` e `privacidade.js` (política de privacidade, revise antes de divulgar), `vercel.json` (cabeçalhos de segurança), `supabase/schema.sql` (só para o modo nuvem).

---

## Fase 1: modo local (cerca de 15 minutos, sem Supabase)

1. **Contato (opcional).** Abra `config.js` e preencha `contato` com o seu e-mail. Ele aparece em "Meus dados e backup" e na política de privacidade. Deixe `modo: "local"`.
2. **GitHub.** Crie um repositório (pode ser privado) e suba todos os arquivos desta pasta (no site: **Add file > Upload files** e arraste tudo).
3. **Vercel.** Em vercel.com, **Add New > Project**, escolha o repositório, deixe **Framework Preset: Other** (sem Build Command) e clique em **Deploy**.
4. **Deixar o link aberto.** Em **Settings > Deployment Protection** do projeto, deixe o domínio de produção público (**Standard Protection** mantém o domínio principal aberto). Teste abrindo o link em uma janela anônima, sem estar logado no Vercel.
5. **Contagem de visitas (opcional).** No projeto, abra a aba **Analytics** e ative o Web Analytics. O site já tem o script necessário.

Teste antes de convidar: abra no computador e no celular, adicione tarefas, recarregue, baixe e restaure um backup.

### O que o modo local mede (e o que não mede)

- O Vercel Web Analytics mostra **quantas pessoas abriram o site por dia**, de que aparelho e de que país. Segundo a documentação do Vercel, não usa cookies e **não acompanha a mesma pessoa entre dias diferentes**. Com 5 testadores, "3 visitantes hoje" já diz algo, mas não diz quem.
- Então a retenção você mede conversando: pergunte no dia 2 e no dia 7 se a pessoa abriu e o que fez. Com poucos testadores isso rende mais do que qualquer painel.
- Se a pessoa topar, ela pode te mandar o arquivo de backup. Ele mostra as tarefas dela com data de criação e conclusão, o que mostra o uso real (peça com consentimento claro: é o conteúdo dela).

### Cuidados do modo local

- **Os dados ficam no navegador.** Se a pessoa limpar os dados do navegador, trocar de aparelho ou usar outro navegador, as tarefas não aparecem. O sistema mostra um aviso quando ela tem 3 ou mais tarefas e nenhum backup recente. Combine com cada testador: usar sempre o mesmo navegador no mesmo aparelho.
- **iPhone/Safari:** até onde sei, o Safari pode apagar os dados de sites que ficam cerca de 7 dias sem uso. Quem para de usar por uma semana pode perder tudo, e essas são justamente as pessoas que você quer entender. Peça para adicionar o site à tela inicial e para fazer backup. Vale confirmar esse comportamento no seu próprio iPhone.
- **Quem abre o link está num sistema vazio.** Se você abrir o link no seu computador, vê o seu próprio sistema de teste (não o de ninguém).
- **Dispositivos compartilhados:** quem usar um computador de uso comum vê as tarefas de quem usou antes naquele navegador.
- **Vercel Hobby é para uso não comercial.** O beta gratuito costuma ficar dentro disso, mas **quando você cobrar mensalidade, precisa do plano Pro** ou outra hospedagem. O mesmo projeto funciona no Cloudflare Pages e no Netlify (conecte o repositório, sem build); nesses casos, os cabeçalhos do `vercel.json` precisam ir para um arquivo `_headers`, e o script de Analytics (`/_vercel/insights/script.js`) deve ser removido do `index.html`.
- **Privacidade:** no modo local você não guarda nenhum dado pessoal dos testadores, o que simplifica bastante. A política em `privacidade.html` já descreve isso. É um texto-base: revise com um advogado antes de cobrar ou divulgar em larga escala. Avise os testadores para não escreverem dados de saúde no sistema.

### Mensagem para convidar (sugestão)

> Estou testando um sistema de tarefas que montei para mim, pensado para quem tem dificuldade em manter organização. Está em beta e é gratuito. Não precisa de cadastro: é só abrir o link e usar. Suas tarefas ficam salvas no seu navegador e só você vê. Use sempre o mesmo navegador e, de vez em quando, faça um backup (botão "Meus dados e backup"). Se puder usar por uma semana e me contar o que atrapalhou e o que ajudou, ajuda muito. Link: ...

---

## Fase 2: modo nuvem (quando fizer sentido)

Passe para o modo nuvem se os testadores pedirem para usar no celular e no computador, ou se você precisar ver o uso por pessoa. É um segundo passo, e dá para fazer depois sem refazer o site.

Atenção: quem já usou no modo local não leva as tarefas automaticamente para a nuvem. A pessoa baixa um backup no modo local e o importa no modo nuvem (a opção de importar ainda não existe na versão nuvem; combine antes de migrar).

### 1. Supabase (login e banco)

1. Crie uma conta em supabase.com e um projeto. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
2. Em **SQL Editor > New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success".
3. Em **Authentication > Sign In / Providers > Email**: deixe o provedor ligado, desligue **Confirm email** (para o beta) e coloque senha mínima de 8 caracteres.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon / publishable** (a pública). Nunca use a `service_role` / `secret`.

### 2. Config

No `config.js`:

```js
window.APP_CONFIG = {
  modo: "nuvem",
  url: "https://xxxxxxxx.supabase.co",
  anonKey: "chave-publica-aqui",
  contato: "seu-email@exemplo.com"
};
```

Suba a mudança para o GitHub; o Vercel publica de novo sozinho.

### 3. Supabase: endereço do site

Em **Authentication > URL Configuration**, coloque o endereço do seu site no Vercel em **Site URL** e em **Redirect URLs** (necessário para o link de "esqueci minha senha").

### 4. Ver quem usa

No **SQL Editor**, rode:

```sql
select * from uso_resumo;
```

Mostra e-mail, cadastro, primeiro e último dia de uso, **dias sem voltar**, **dias de uso**, aberturas e quantidade de tarefas. Não mostra o conteúdo das tarefas.

### Limites do modo nuvem

- **E-mails do Supabase:** o envio embutido é bem limitado. Por isso a confirmação de e-mail fica desligada no beta, e o "esqueci minha senha" pode falhar com muita gente.
- **Qualquer pessoa com o link pode criar conta.** Se vazar, desligue novas contas em **Authentication > Sign In / Providers > Allow new users to sign up**.
- **Plano gratuito:** o Supabase pausa projetos após 1 semana sem atividade e não faz backup automático. Use "Baixar meus dados" de tempos em tempos.
- **Biblioteca:** o modo nuvem carrega `supabase-js` 2.45.4 por CDN (jsdelivr). Se aparecer "Sem conexão", veja no console do navegador se esse arquivo carregou.
- **Privacidade:** com conta, você passa a guardar e-mail e tarefas dos testadores, e a política em `privacidade.html` tem uma seção para isso. As regras de acesso estão no `schema.sql` e foram testadas com duas contas simulando acesso cruzado. Não desligue o RLS e não coloque a chave `service_role` no código.

---

## Próximos passos possíveis (só se o teste mostrar uso real)

1. Importar backup no modo nuvem, para migrar testadores.
2. Tarefas recorrentes simples (sem aviso por e-mail).
3. Instalar como aplicativo no celular (PWA), que também ajuda a proteger os dados no iPhone.
4. Lembretes no navegador/celular.
5. Convite por código em vez de conta aberta.
6. Cobrança (Stripe, Mercado Pago ou Pix) com hospedagem comercial.
