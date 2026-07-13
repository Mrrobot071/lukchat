# Hot Chat
Site: https://mrrobot071.github.io/lukchat/

Chat privado em tempo real com visual inspirado no Direct do Instagram, mantendo a identidade escura com gradientes vermelho e rosa.

## O que está incluído

- lista de salas e conversa em duas colunas no desktop;
- navegação de uma tela por vez em celulares;
- uma senha independente para cada sala;
- senhas de sala armazenadas somente como hash `bcrypt` no banco do servidor;
- sessão opaca em cookie `HttpOnly`, `SameSite=Strict` e com expiração;
- troca de senha que revoga imediatamente os acessos anteriores da sala;
- mensagens, indicador de digitação e presença online em tempo real;
- criação, edição e limpeza de salas protegidas por senha administrativa;
- proteção contra excesso de tentativas, limite de tamanho e escape seguro das mensagens;
- SQLite local com limite configurável de mensagens por sala.

O navegador nunca recebe a senha configurada nem o hash. Ele envia a senha digitada ao servidor e recebe apenas um identificador aleatório de sessão em cookie protegido.

## Iniciar

Requer Node.js 22 ou mais recente.

No Windows, o jeito mais simples e abrir o arquivo:

```powershell
C:\Users\tec\OneDrive\Desktop\ct\leads\hot-chat\abrir-hot-chat.bat
```

Ele instala dependencias se precisar, cria o `.env` se ainda nao existir, abre o navegador e inicia o servidor.

```powershell
cd "C:\Users\tec\OneDrive\Desktop\ct\leads\hot-chat"
npm install
npm run setup
npm start
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000).

O `npm run setup` cria o arquivo `.env` e mostra duas credenciais geradas:

- a senha administrativa, usada para criar ou configurar salas;
- a senha inicial da sala `Geral`.

Neste workspace o setup já foi executado. As credenciais atuais estão no arquivo `.env`, que não deve ser publicado nem enviado ao navegador.

## Criar e administrar salas

Use o botão `+` no topo da lista para criar uma sala. Cada criação exige:

1. nome e descrição;
2. senha exclusiva da sala;
3. senha administrativa do servidor.

Dentro de uma conversa, o botão de engrenagem permite renomear a sala, alterar sua descrição, trocar a senha ou limpar as mensagens. Quando a senha muda, todas as sessões daquela sala são invalidadas e os participantes precisam inserir a nova senha.

## Configuração

As opções ficam no `.env`:

| Variável | Finalidade |
| --- | --- |
| `PORT` | Porta HTTP, padrão `3000` |
| `HOST` | Interface de rede; use `127.0.0.1` localmente |
| `COOKIE_SECURE` | Use `true` quando o site estiver em HTTPS |
| `SESSION_TTL_HOURS` | Validade da autorização de sala |
| `ADMIN_PASSWORD` | Senha administrativa, somente no servidor |
| `DEFAULT_ROOM_*` | Dados usados para criar a primeira sala em banco vazio |
| `MESSAGE_LIMIT_PER_ROOM` | Quantidade máxima preservada por sala |

As mensagens, hashes e sessões ficam em `data/hot-chat.db`. Faça backup desse arquivo com o servidor parado. A pasta `data` e o arquivo `.env` não devem ser servidos publicamente.

## Acesso pela rede ou produção

Para aceitar conexões de outros dispositivos da rede local, altere `HOST=0.0.0.0` e libere apenas a porta necessária no firewall. Em produção:

- publique atrás de HTTPS (Nginx, Caddy ou serviço equivalente);
- configure `COOKIE_SECURE=true`;
- use uma senha administrativa longa e exclusiva;
- proteja e faça backup do `.env` e de `data/hot-chat.db`;
- mantenha uma única instância do servidor por arquivo SQLite.

## Verificação

```powershell
npm run check
npm test
```

Os testes cobrem senha correta e incorreta, isolamento entre salas, cookie seguro, privacidade das prévias e envio via WebSocket.
