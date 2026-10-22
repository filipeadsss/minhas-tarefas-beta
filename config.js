/* Modo de funcionamento.
   "local": sem conta e sem servidor. Cada pessoa usa no próprio navegador e as tarefas ficam salvas ali.
            É o jeito mais simples de começar: basta publicar no Vercel.
   "nuvem": com conta (e-mail e senha) e banco no Supabase. Dá para ver quem usa e as tarefas
            acompanham a pessoa entre celular e computador. Exige o passo a passo do Supabase no README.
   Se estiver em "nuvem", preencha também url e anonKey (Supabase > Project Settings > API).
   Use só a chave PÚBLICA (anon/publishable). NUNCA coloque a chave service_role aqui.
   contato: seu e-mail para os testadores falarem com você (aparece em "Meus dados" e na política de privacidade). */
window.APP_CONFIG = {
  modo: "local",
  url: "",
  anonKey: "",
  contato: ""
};
