https://mrrobot071.github.io/lukchat/

Aqui está uma versão do **README.md** com uma abordagem estritamente **profissional, técnica e arquitetural**, ideal para valorizar o seu portfólio no GitHub perante recrutadores e outros desenvolvedores.

---

# Chat Privado Serverless

Uma aplicação web *Single-Page Application* (SPA) de chat em tempo real, construída com arquitetura *serverless* utilizando **Vanilla JavaScript (ES6+)** e integrada ao ecossistema do **Supabase**. O projeto foca em persistência efêmera de dados, comunicação orientada a eventos e uma interface minimalista com foco em experiência do usuário (UX) em modo escuro.

## 🚀 Arquitetura e Fluxo de Dados

A aplicação opera de forma descentralizada em camadas puras de front-end, consumindo serviços *Backend-as-a-Service* (BaaS):

1. **Camada de Apresentação:** Construída com HTML5 estrutural e CSS3 avançado (propriedades de *Flexbox*, *Gradients* e gerenciamento de *Overflow* para rolagem interna).
2. **Sincronização em Tempo Real:** Utiliza o cliente *Realtime* do Supabase baseado em **WebSockets** para escutar eventos de `INSERT` na tabela do banco de dados PostgreSQL.
3. **Mecanismo de Contingência (Polling & Focus):** Implementa um ciclo de *polling* a cada 1 segundo como redundância, além de um gatilho no evento `window.focus` para garantir a consistência do estado local assim que o usuário retorna à aba.
4. **Gerenciamento de Estado Efêmero:**
* Local: Persistência do identificador do usuário via `localStorage`.
* Cache de Renderização: Utilização da estrutura de dados `Set()` em memória para controle de concorrência e prevenção de duplicidade de IDs de mensagens na DOM.
* Expiração de Dados (TTL): Rotina concorrente no cliente que executa queries de deleção intervalada (`setInterval`) agindo como um coletor de lixo (*garbage collector*) para mensagens obsoletas.



---

## 🛠️ Stack Tecnológica

* **Core:** HTML5 / CSS3 (Modern Dark Theme)
* **Runtime / Engine:** JavaScript Nativo (ECMAScript 6) via Módulos ES (`type="module"`)
* **BaaS (Backend as a Service):** [Supabase](https://supabase.com/)
* **Banco de Dados:** PostgreSQL
* **Realtime Engine:** PostgreSQL CDC (Change Data Capture) via WebSockets


* **Provedor de Dependências:** CDN jsDelivr

---

## 📋 Infraestrutura do Banco de Dados

Para a correta execução do projeto, o esquema da tabela no PostgreSQL deve seguir a seguinte estrutura de dados:

```sql
CREATE TABLE public.mensagens (
    id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    usuario TEXT NOT NULL,
    texto TEXT NOT NULL,
    CONSTRAINT mensagens_pkey PRIMARY KEY (id)
);

```

> ⚙️ **Nota de Configuração (Segurança):**
> Para ambientes de homologação ou portfólio onde não há autenticação de usuários via JWT, certifique-se de que a tabela possui políticas de **RLS (Row Level Security)** que concedam permissões de `SELECT`, `INSERT` e `DELETE` para a role `anon`.

---

## ⚙️ Variáveis de Inicialização

As seguintes diretivas de controle podem ser configuradas diretamente no escopo do módulo principal do script:

| Propriedade | Tipo | Descrição |
| --- | --- | --- |
| `SENHA` | `String` | Credencial de autenticação estática para liberação do contêiner do chat. |
| `AUTO_DELETE` | `Boolean` | Flag que habilita/desabilita o expurgo automatizado de registros. |
| `AUTO_DELETE_MINUTES` | `Number` | Janela de tempo de vida (TTL) das mensagens em minutos antes da deleção. |
| `AUTO_REFRESH_SECONDS` | `Number` | Intervalo de tempo do *fallback loop* para requisições HTTP GET de sincronização. |

---

## 💻 Instalação e Execução

Como o projeto adota uma abordagem *zero-build* (sem necessidade de empacotadores como Vite, Webpack ou transpiladores), o deploy e a execução local são simplificados.

### Execução Local

Devido às restrições de segurança de escopo de **ES Modules**, o navegador bloqueia a execução utilizando o protocolo `file:///`. Portanto, é obrigatória a inicialização através de um servidor HTTP local.

**Opção 1 (VS Code):**
Utilizar a extensão **Live Server**.

**Opção 2 (Node.js):**

```bash
# Executar servidor estático na raiz do projeto
npx serve .

```

**Opção 3 (Python):**

```bash
# Para Python 3.x
python -m http.server 8000

```
