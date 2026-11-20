# Deploy em produção

O AgendaFácil é uma aplicação **Next.js com banco PostgreSQL**.

A hospedagem escolhida é a **Vercel** com banco **Neon**. As alternativas com Docker continuam disponíveis no final deste guia.

---

## Vercel + Neon (hospedagem escolhida)

O projeto já está configurado para a Vercel (`vercel.json`):

- **Build:** `npm run vercel-build` — aplica as migrações do banco e gera o build de produção. Se a migração falhar, o deploy é cancelado e a versão anterior continua no ar.
- **Região:** funções em **São Paulo (`gru1`)**.
- **Retenção de dados (LGPD):** Vercel Cron diário em `/api/v1/cron/maintenance`, protegido por `CRON_SECRET`.

### 1. Importar o projeto

1. Envie o código para o GitHub (`git push`).
2. Em <https://vercel.com/new>, importe o repositório. A Vercel detecta o Next.js e usa as configurações do `vercel.json` — não altere o _Build Command_.

### 2. Criar o banco (Neon)

1. No projeto da Vercel: **Storage → Create Database → Neon (Serverless Postgres)**.
2. Escolha a região **AWS São Paulo (`sa-east-1`)** — dados no Brasil e menor latência.
3. Conecte o banco aos ambientes **Production** e **Preview**. A integração cria as variáveis `DATABASE_URL` (com pooler, usada pela aplicação) e `DATABASE_URL_UNPOOLED` (conexão direta, usada pelas migrações) automaticamente.
4. Recomendado: ative a opção de **criar um branch do banco para cada Preview**. Assim os deploys de teste nunca mexem nos dados reais.

**Plano gratuito do Neon:** dá conta de um TCC (0,5 GB por projeto). O banco "dorme" depois de 5 minutos sem uso, e o primeiro acesso depois disso demora cerca de 1 segundo a mais. Abra o site alguns minutos antes da apresentação para acordar o banco.

**Banco criado direto em neon.tech, sem a integração:** em _Connect_, copie as duas strings e cadastre-as você mesmo na Vercel:

- `DATABASE_URL`: a conexão **com** _Connection pooling_ (host termina em `-pooler`), usada pela aplicação;
- `DATABASE_URL_UNPOOLED`: a conexão **sem** pooling, usada pelas migrações.

Pode colar as URLs como o Neon mostra (`?sslmode=require&channel_binding=require`). A aplicação trata esses parâmetros e sempre verifica o certificado SSL.

### 3. Variáveis de ambiente

Gere os segredos no seu computador:

```bash
npm run secrets:generate
```

Em **Settings → Environment Variables**, cadastre:

| Variável                                                                             | Ambientes           | Valor                                                                          |
| ------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------ |
| `DATA_ENCRYPTION_KEY`                                                                | Production, Preview | gerada acima — **a mesma em todos** se os previews usarem o mesmo banco        |
| `CRON_SECRET`                                                                        | Production          | gerado acima                                                                   |
| `APP_URL`                                                                            | **só Production**   | `https://seudominio.com.br` (os previews usam a URL da Vercel automaticamente) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`                 | **só Production**   | dados do seu provedor de e-mail (passo 5)                                      |
| `LEGAL_NAME`, `LEGAL_DOCUMENT`, `LEGAL_ADDRESS`, `PRIVACY_CONTACT_EMAIL`, `DPO_NAME` | Production, Preview | dados do controlador (LGPD)                                                    |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                           | Production          | opcional — login com Google                                                    |

> ⚠️ **Guarde a `DATA_ENCRYPTION_KEY` em local seguro** (gerenciador de senhas). Sem ela, telefones e mensagens criptografados ficam irrecuperáveis. Nunca a altere depois de entrar em produção. Marque as variáveis secretas como **Sensitive**.

Depois de cadastrar, faça um novo deploy (**Deployments → ⋯ → Redeploy**).

### 4. Domínio próprio

1. **Settings → Domains → Add** → `seudominio.com.br` (adicione também `www.seudominio.com.br` redirecionando para o principal).
2. No painel do registro do domínio (ex.: Registro.br), crie os registros DNS que a Vercel mostrar — normalmente:

| Tipo  | Nome  | Valor                  |
| ----- | ----- | ---------------------- |
| A     | `@`   | `76.76.21.21`          |
| CNAME | `www` | `cname.vercel-dns.com` |

Use **os valores exibidos no painel da Vercel**, que podem variar. Alternativamente, aponte os _nameservers_ do domínio para a Vercel. 3. O HTTPS é emitido automaticamente. Confirme que `APP_URL` usa exatamente esse domínio e teste `https://seudominio.com.br/api/v1/status`.

`APP_URL` é usada nos links dos e-mails. Se ela estiver errada, o link de confirmação aponta para o endereço errado.

### 5. E-mails reais (só em produção)

| Onde roda                | O que acontece com os e-mails                                          |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm run dev` (seu PC)   | ficam no Mailpit, em <http://localhost:8025>; nada sai para a internet |
| Preview da Vercel        | **nunca são enviados**; o conteúdo com o link aparece em _Logs_        |
| Production (seu domínio) | enviados de verdade pelo SMTP configurado                              |

Recomendado: **Resend** (grátis, 3.000 e-mails/mês e 100/dia). Assim o remetente fica no seu domínio (`nao-responda@seudominio.com.br`).

1. Crie a conta em <https://resend.com> → **Domains → Add Domain** → `seudominio.com.br`, região **São Paulo (sa-east-1)**.
2. No painel DNS do domínio (Registro.br ou o painel da Vercel, se os _nameservers_ estiverem nela), crie **exatamente** os registros que o Resend mostrar: um `MX` e um `TXT` (SPF) em `send`, e um `TXT` (DKIM) em `resend._domainkey`. Clique em **Verify** e aguarde o status _Verified_.
3. Recomendado contra spam: crie também um `TXT` em `_dmarc` com o valor `v=DMARC1; p=none;`.
4. **API Keys → Create API Key** (permissão _Sending access_).
5. Na Vercel, ambiente **Production** apenas:

   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASSWORD=<a API key, começa com re_>
   EMAIL_FROM=AgendaFácil <nao-responda@seudominio.com.br>
   ```

6. **Redeploy** e teste: crie uma conta com um e-mail seu e confira se o link de confirmação chega e abre `https://seudominio.com.br/verificar-email?...`.

Alternativa: **Brevo** (300/dia). Use `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, e login e chave em _SMTP & API_. Autentique o domínio em _Senders, Domains_.

Se não chegar, veja em **Vercel → Logs** a linha `[email] falha no envio: ...`, que mostra o erro do provedor, e confira a pasta de spam.

### Observações

- **Backups:** o Neon mantém histórico para restauração (_point-in-time restore_), com período que depende do plano. Para uma cópia própria: `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f backup.dump`.
- **Cron no plano Hobby:** roda uma vez por dia, o que basta para a rotina de retenção.
- **Proteção de previews:** mantenha ativada a _Deployment Protection_ (padrão), para que só você acesse as URLs de preview.
- **Primeiro acesso:** o banco de produção começa vazio. **Não** rode `npm run dev:seed` contra ele. Crie as contas pelo próprio site; o e-mail de confirmação chega de verdade.

---

## Alternativa: VPS com Docker

Funciona em qualquer VPS Linux (Hostinger VPS, DigitalOcean, Contabo, AWS Lightsail, Oracle Cloud, Magalu Cloud etc.) com pelo menos **1 vCPU e 2 GB de RAM**. Inclui HTTPS automático, banco privado e backup diário.

### 1. DNS do domínio

No painel onde o domínio foi registrado (ex.: Registro.br), crie:

| Tipo | Nome  | Valor             |
| ---- | ----- | ----------------- |
| A    | `@`   | IP público da VPS |
| A    | `www` | IP público da VPS |

Aguarde a propagação (de minutos a algumas horas). Verifique com `ping seudominio.com.br`.

### 2. Preparar o servidor

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # saia e entre novamente na sessão SSH

# Firewall: só SSH, HTTP e HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
```

### 3. Enviar o projeto

```bash
git clone https://github.com/MatheusBarbosaDeAndrade/clone-agenda-facil.git agendafacil
cd agendafacil
```

(ou envie os arquivos por `scp`/`rsync`, **sem** `node_modules` e `.next`.)

### 4. Configurar as variáveis

```bash
cp .env.production.example .env.production
docker run --rm -v "$PWD":/app -w /app node:24-alpine node infra/scripts/generate-secrets.mjs
nano .env.production
```

Preencha no mínimo: `DOMAIN`, `APP_URL` (com `https://`), `ACME_EMAIL`, `POSTGRES_PASSWORD`, `DATA_ENCRYPTION_KEY` e o SMTP.

> ⚠️ **Guarde uma cópia da `DATA_ENCRYPTION_KEY` em local seguro** (gerenciador de senhas). Sem ela, telefones e mensagens criptografados ficam irrecuperáveis — inclusive nos backups. Nunca a altere depois de entrar em produção.

```bash
chmod 600 .env.production
```

### 5. Subir

```bash
docker compose -f infra/compose.production.yaml --env-file .env.production up -d --build
docker compose -f infra/compose.production.yaml --env-file .env.production ps
```

O contêiner da aplicação aplica as migrações automaticamente a cada inicialização. O Caddy emite o certificado HTTPS no primeiro acesso. Teste: `https://seudominio.com.br/api/v1/status`.

### Atualizar para uma nova versão

```bash
git pull
docker compose -f infra/compose.production.yaml --env-file .env.production up -d --build
```

### Backups

O serviço `backup` gera um `pg_dump` diário em `./backups` e mantém 7 dias. **Copie-os periodicamente para fora do servidor** (ex.: `rsync` para outro computador ou armazenamento em nuvem).

Restaurar:

```bash
docker compose -f infra/compose.production.yaml --env-file .env.production exec -T database \
  pg_restore -U agendafacil -d agendafacil --clean --if-exists < backups/ARQUIVO.dump
```

### Logs

```bash
docker compose -f infra/compose.production.yaml --env-file .env.production logs -f app
```

Os logs são rotacionados automaticamente (5 × 10 MB por serviço).

---

## Alternativa: Render, Railway ou Fly.io

Para quem não quer administrar uma VPS: **Render**, **Railway** ou **Fly.io** (rodam o `Dockerfile` deste repositório) + um Postgres gerenciado (**Neon**, **Supabase**, ou o Postgres da própria plataforma).

1. Crie o banco Postgres e copie a _connection string_.
2. Crie o serviço web apontando para o repositório (build pelo `Dockerfile`).
3. Configure as variáveis de ambiente (as mesmas do `.env.production.example`), usando:
   - `DATABASE_URL=<connection string>` e `POSTGRES_SSL=require`
   - `TRUST_PROXY=true`
4. Aponte o domínio para a plataforma seguindo as instruções dela (normalmente um registro `CNAME`).

O comando de inicialização da imagem já aplica as migrações. A rotina de retenção de dados roda automaticamente dentro da aplicação.

---

## Configurações opcionais

### E-mail (confirmação de cadastro e recuperação de senha)

Qualquer SMTP funciona (Resend, Brevo, Amazon SES, Mailgun, Zoho, SMTP do provedor de domínio). Na Vercel, veja o passo 5. Configure também os registros **SPF/DKIM** do domínio no provedor de e-mail para evitar que as mensagens caiam no spam.

### Login com Google

1. Em <https://console.cloud.google.com/> → _APIs e serviços_ → _Credenciais_ → **ID do cliente OAuth** (tipo “Aplicativo da Web”).
2. URI de redirecionamento autorizada: `https://seudominio.com.br/api/v1/auth/google/callback`.
3. Na _Tela de consentimento OAuth_, informe o link da política: `https://seudominio.com.br/privacidade`.
4. Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e reinicie. O botão “Entrar com o Google” aparece automaticamente.

---

## Checklist antes de divulgar

- [ ] `https://seudominio.com.br/api/v1/status` retorna `"status":"ok"`.
- [ ] `DATA_ENCRYPTION_KEY` guardada em local seguro, fora do servidor.
- [ ] SMTP testado: o e-mail de confirmação de cadastro e o “Esqueci minha senha” chegam na caixa de entrada (não no spam).
- [ ] Dados do controlador preenchidos (`LEGAL_NAME`, `LEGAL_DOCUMENT`, `PRIVACY_CONTACT_EMAIL`, `DPO_NAME`) — revise `/privacidade` e `/termos`.
- [ ] Recomendado: revisão dos textos legais por um profissional de Direito.
- [ ] Cópia dos backups para fora do servidor agendada.
- [ ] Nota A/A+ em <https://securityheaders.com> e <https://www.ssllabs.com/ssltest/>.
- [ ] **Não** rodar `npm run dev:seed` em produção (o script se recusa, mas não tente).
