Site: https://mrrobot071.github.io/lukchat/

# Chat Realtime Privado

Sistema de chat privado em tempo real utilizando HTML, CSS, JavaScript puro e Supabase.

Interface moderna, responsiva e otimizada para desktop e mobile, com autenticação simples por senha, limpeza automática de mensagens e sincronização realtime.

---

## Features

- Login privado com senha
- Cache de sessão no navegador
- Chat em tempo real via Supabase Realtime
- Interface responsiva
- Troca de nome dinâmica
- Limpeza manual do chat
- Temporizador automático para apagar mensagens
- Scroll automático
- Layout dark mode
- Funciona sem framework

---

## Stack

- HTML5
- CSS3
- JavaScript Vanilla
- Supabase

---

## Estrutura do Banco

Criar tabela no Supabase:

```sql
create table mensagens (
    id bigint generated always as identity primary key,
    usuario text,
    texto text,
    criado_em timestamp with time zone default now()
);
```

---

## Ativar Realtime

No painel do Supabase:

1. Abrir projeto
2. Database
3. Replication
4. Ativar tabela `mensagens`
5. Habilitar:
   - INSERT
   - UPDATE
   - DELETE

---

## Configuração

Editar no código:

```js
const SENHA = "a1234";

const SUPABASE_URL =
"https://SEU-PROJETO.supabase.co";

const SUPABASE_KEY =
"SUA_PUBLIC_KEY";
```

---

## Como Rodar

### Local

Basta abrir o arquivo `.html` no navegador.

### Deploy

Deploy recomendado:

- Vercel
- Supabase

---

## Responsividade

O sistema possui:

- suporte a `100dvh`
- adaptação para mobile
- teclado mobile otimizado
- layout responsivo

---

## Funcionalidades

### Login Persistente

Sessão salva no `localStorage`.

Tempo padrão:

```js
6 horas
```

### Temporizador Automático

Permite configurar limpeza automática das mensagens por minutos.

### Realtime

O chat atualiza instantaneamente utilizando:

```js
postgres_changes
```

Sem necessidade de refresh.

---

## Segurança

Atualmente utiliza autenticação simples via frontend.

Recomendado para produção:

- Supabase Auth
- RLS
- JWT
- Rate Limit

---

## Melhorias Futuras

- usuários online
- salas privadas
- upload de arquivos
- notificações
- áudio
- criptografia
- mensagens temporárias


---

## Licença

MIT License
