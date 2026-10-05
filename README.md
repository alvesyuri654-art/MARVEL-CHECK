# Marvel Check — Torre de Controle Logístico & Checklist de Anomalias

Sistema operacional corporativo para monitoramento, controle de anomalias operacionais, conferência em 5 etapas e extração automática de relatórios em PDF com integração oficial para envio por e-mail via **Outlook / Microsoft 365 / Microsoft Graph API**.

---

## 🚀 Visão Geral do Fluxo

Ao finalizar as 5 etapas do checklist até atingir 100% de conclusão:
1. O usuário clica em **`📄 Extrair Relatório`** no canto inferior direito;
2. É exibido o modal de conferência com os 6 campos complementares do chamado (*Protocolo, Frota, Nota Devolução, Nota Origem, Contato e Observação*);
3. O usuário clica em **`📄 Confirmar e Extrair Relatório`**;
4. **Em um único clique**, o sistema:
   - Exibe feedback imediato: `"Gerando relatório..."`;
   - Renderiza o relatório oficial com identidade visual corporativa em memória através de `html2pdf.js`;
   - Disponibiliza o download local imediato do arquivo no navegador com o nome `Relatorio_Anomalias_YYYY-MM-DD_Protocolo_[PROTOCOLO]_Frota_[FROTA].pdf`;
   - Atualiza o feedback para `"Relatório gerado. Enviando por e-mail..."`;
   - Captura o binário real do PDF gerado e o envia para o backend (`/api/email/send` ou `/api/send-report`);
   - O backend anexa o mesmo PDF gerado e despacha o e-mail via **Microsoft Graph API Oficial** (ou cliente **Outlook / Microsoft 365** local);
   - Apresenta a confirmação visual na tela: `"Relatório gerado e enviado com sucesso para anomalia@marvel.com.br."`.

---

## 🔐 Configuração das Variáveis de Ambiente (`.env`)

O projeto utiliza o arquivo `.env` para carregar as configurações de e-mail e credenciais de conexão sem expor informações sensíveis.

> [!IMPORTANT]
> O arquivo `.env` está listado no `.gitignore` e **NUNCA deve ser commitado no GitHub**. Para criar o seu arquivo local de ambiente, faça uma cópia do arquivo `.env.example`:
> ```bash
> copy .env.example .env
> ```

### Variáveis Suportadas

| Variável | Descrição | Exemplo / Padrão |
|---|---|---|
| `MICROSOFT_TENANT_ID` | Directory (Tenant) ID no Microsoft Entra ID | `8f5b...` *(vazio para usar cliente Outlook local)* |
| `MICROSOFT_CLIENT_ID` | Application (Client) ID no Microsoft Entra ID | `3c2a...` *(vazio para usar cliente Outlook local)* |
| `MICROSOFT_CLIENT_SECRET` | Valor do Segredo do Cliente gerado no Entra ID | `k7Q8...` *(vazio para usar cliente Outlook local)* |
| `REPORT_EMAIL_FROM` | Conta de e-mail corporativa remetente | `yuri.alves@marvel.com.br` |
| `REPORT_EMAIL_TO` | Destinatário corporativo dos relatórios | `anomalia@marvel.com.br` |
| `DEFAULT_SUBJECT` | Template do assunto do e-mail | `Relatório de Anomalias - Protocolo {protocolo} - Frota {frota}` |
| `DEFAULT_BODY` | Template do corpo do e-mail | `Olá, segue em anexo o relatório de anomalias gerado pelo sistema. Atenciosamente.` |

---

## ☁️ Integração com Microsoft 365 / Microsoft Graph API

O sistema suporta duas formas seguras e oficiais de envio corporativo:

### Modo 1: Microsoft Graph API (Nuvem / Servidor / Deploy)
Ideal para servidores na nuvem, pipelines e ambientes corporativos sem dependência de interface gráfica.
1. Acesse o **Portal do Microsoft Entra ID** ([entra.microsoft.com](https://entra.microsoft.com));
2. Vá em **Registros de Aplicativo (App Registrations)** → **Novo Registro**;
3. Registre o nome da aplicação (ex: `Marvel Check - Torre de Controle`);
4. Em **Permissões de API (API Permissions)**:
   - Adicione **Microsoft Graph**;
   - Selecione **Permissões de Aplicativo (Application Permissions)**;
   - Marque a permissão **`Mail.Send`**;
   - Clique em **Conceder consentimento do administrador (Grant admin consent)**;
5. Em **Certificados e Segredos (Certificates & Secrets)**:
   - Crie um novo segredo de cliente (**New client secret**);
   - Copie o **Valor (Value)** imediatamente e configure na variável `MICROSOFT_CLIENT_SECRET`;
6. Configure `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET` no seu arquivo `.env` (ou nas variáveis de ambiente do servidor de produção).

### Modo 2: Cliente Corporativo Microsoft 365 / Outlook (MAPI COM no Windows)
Ideal para desktops e estações de trabalho de operadores rodando Windows com o Microsoft 365 / Outlook configurado.
- Se as credenciais do Microsoft Entra ID estiverem vazias no `.env`, o backend detecta automaticamente o cliente oficial do Outlook instalado na estação e despacha o e-mail autenticado pela conta do operador (`yuri.alves@marvel.com.br`) sem necessidade de credenciais no código.

---

## 💻 Como Executar Localmente

### Pré-requisitos
- Sistema operacional Windows (PowerShell 5.1 ou superior);
- Navegador moderno (Google Chrome, Microsoft Edge ou Firefox).

### Passos de Execução
1. Abra a pasta raiz do projeto no terminal ou PowerShell:
   ```powershell
   cd C:\Users\yuri.alves\.gemini\antigravity\scratch\marvel-checklist-anomalias
   ```
2. Inicie o servidor local através do script oficial:
   ```powershell
   .\start.ps1
   ```
   *(Ou execute o arquivo `ABRIR_SISTEMA.cmd` ou dê duplo clique em `abrir_sistema.vbs`)*;
3. O servidor subirá automaticamente em `http://localhost:18080/` (ou em porta dinâmica mapeada no arquivo `active_port.txt`);
4. O navegador padrão será aberto na tela inicial de identificação do operador.

---

## 🧪 Como Testar a Integração

### Teste 1: Geração de PDF e Download Local
1. Identifique-se na tela de login informando o nome do operador;
2. Selecione um atendimento ou clique em **`+ Novo checklist`**;
3. Complete todas as tarefas das 5 etapas até o progresso atingir **100% Concluído**;
4. No canto inferior direito, clique em **`📄 Extrair Relatório`**;
5. No modal exibido, preencha os 6 dados complementares e clique em **`📄 Confirmar e Extrair Relatório`**;
6. O navegador fará o download local do arquivo `Relatorio_Anomalias_YYYY-MM-DD_...pdf`.

### Teste 2: Envio de E-mail Automático com PDF Anexo
1. Após a geração do PDF, observe a transição automática para o status `"Relatório gerado. Enviando por e-mail..."`;
2. Ao concluir, a notificação verde de sucesso é apresentada:
   `✓ Relatório gerado e enviado com sucesso para anomalia@marvel.com.br.`;
3. Abra o seu aplicativo do Outlook ou acesse [outlook.office.com](https://outlook.office.com);
4. Acesse a pasta **Itens Enviados (Sent Items)**;
5. Verifique a mensagem enviada com o anexo PDF correspondente e tamanho real (~594 KB).

### Teste 3: Resiliência e Tratamento de Falhas
- Caso a conexão de e-mail falhe, o PDF gerado **não é perdido**: o download permanece disponível e a interface exibe a mensagem amigável:
  `⚠️ Relatório gerado com sucesso, mas não foi possível enviar o e-mail. O PDF continua disponível para download.`

---

## 📦 Como Publicar e Fazer Deploy

### Papel do GitHub no Fluxo
> [!NOTE]
> O **GitHub** é o repositório de versionamento de código fonte. O simples ato de subir o código para o GitHub não realiza o envio de e-mails, pois o envio precisa de um ambiente de execução (servidor backend ou Cloud Function) para processar as requisições de forma segura e com acesso às variáveis de ambiente.

### Variáveis para o Ambiente de Produção
No painel do seu provedor de hospedagem (Azure App Service, AWS, Render, Vercel com Serverless Functions, container Docker ou servidor Windows/Linux), configure as seguintes variáveis de ambiente:
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `REPORT_EMAIL_FROM`
- `REPORT_EMAIL_TO`

### Arquivos Versionados
- `index.html` — Estrutura da interface
- `app.js` — Aplicação SPA, roteamento e controle de fluxo
- `data.js` — Base de dados de etapas e tarefas
- `styles.css` — Estilos visuais e responsividade
- `html2pdf.bundle.min.js` — Biblioteca local autônoma para geração de PDF
- `start.ps1` — Servidor HTTP e dispatcher de e-mail
- `.gitignore` — Proteção de segredos e credenciais locais
- `.env.example` — Template documentado para configuração do ambiente
