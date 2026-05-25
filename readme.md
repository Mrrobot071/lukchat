https://mrrobot071.github.io/lukchat/

Chat Privado com Integração Formspree
Este é um projeto simples de interface de chat em tempo real de via única, construído utilizando HTML5, CSS3 moderno e JavaScript puro (Vanilla JS). Ele foi projetado para capturar mensagens de usuários por meio de um formulário seguro e encaminhá-las diretamente para o painel ou e-mail do Formspree.

🚀 Funcionalidades
Tela de Bloqueio por Senha: Proteção simples na camada do cliente (Front-end) para restringir o acesso inicial à interface do chat.

Identificação de Usuário: Sistema integrado com localStorage para definir e salvar o nome do usuário localmente. O usuário pode alterar o nome a qualquer momento clicando no botão de perfil.

Feedback Visual Instantâneo: Ao enviar uma mensagem com sucesso, ela é renderizada imediatamente na tela para manter o histórico visual da conversa ativa.

Integração Serverless: Envio de dados estruturados (Nome do usuário, conteúdo da mensagem e carimbo de data/hora) diretamente para o endpoint do Formspree via requisições assíncronas (fetch API).

Design Responsivo: Interface escura (Dark Mode) moderna, responsiva e otimizada para dispositivos móveis e desktops.

🛠️ Tecnologias Utilizadas
HTML5: Estrutura semântica do chat e formulários.

CSS3: Estilização customizada com gradientes, Flexbox e variáveis de design moderno.

JavaScript (ES6+): Manipulação do DOM, gerenciamento de estado local (localStorage) e integração com API externa utilizando Async/Await.

Formspree: Serviço de backend para processamento e armazenamento dos formulários recebidos.

⚙️ Como Configurar
Abra o arquivo HTML principal.

Localize a seção // CONFIG dentro da tag <script>.

Altere as seguintes variáveis de acordo com a sua necessidade:

SENHA: Defina a palavra-chave necessária para desbloquear a tela do chat.

FORMSPREE_URL: Insira a URL do endpoint criada na sua conta do Formspree.

JavaScript
// CONFIG
const SENHA = "SuaSenhaAqui";
const FORMSPREE_URL = "https://formspree.io/f/seu_id_aqui";
📄 Licença
Este projeto é de uso livre para fins acadêmicos, pessoais ou profissionais. Modifique e distribua conforme necessário.
