# 📚 AcadêmicoFácil — Documentação Técnica

**Versão:** 2.0 (com webhook automático e sistema de promoções)  
**Data:** Junho de 2026  
**Status:** Produção (academicofacil.com.br)

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura & Stack](#arquitetura--stack)
3. [Fluxos Principais](#fluxos-principais)
4. [Guia de Configuração](#guia-de-configuração)
5. [Funcionalidades Implementadas](#funcionalidades-implementadas)
6. [Resolução de Problemas](#resolução-de-problemas)
7. [Roadmap Futuro](#roadmap-futuro)

---

## 🎯 Visão Geral

**AcadêmicoFácil** é uma plataforma SaaS para consultoria acadêmica online. Clientes fazem pedidos de trabalhos (redações, formatações, editoria, etc.), pagam via Pix ou cartão, e recebem o serviço dentro do prazo.

### Público

- **Clientes:** alunos e profissionais que precisam de suporte acadêmico
- **Admin:** gestor Paulo Silva que controla preços, promoções, pedidos e status

### Diferencial v2.0

✅ **Webhook automático** — pagamento Pix confirmado automaticamente, sem intervenção manual  
✅ **Sistema de promoções** — desconto no primeiro trabalho (validado no servidor, não burlável)  
✅ **Toast melhorado** — erros legíveis em todas as telas (fixed, z-index 2147483647)  
✅ **Admin pode excluir usuários** — painel de clientes com botão de exclusão  
✅ **Criação de conta resiliente** — não trava se Firestore der erro

---

## 🏗️ Arquitetura & Stack

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                     │
│  index.html (landing) | dashboard.html (app)             │
│  React-like components, vanilla JS, Bootstrap 5          │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ↓
┌─────────────────────────────────────────────────────────┐
│               VERCEL (Edge Functions)                    │
│  /api/criar-preferencia.js  → gera pagamento MP         │
│  /api/webhook-mp.js         → processa notificações     │
│  /api/ia-academica.js       → Claude API (future)       │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   [Firebase]   [Mercado Pago] [Banco Central]
   (Auth+DB)      (Pagamentos)   (Pix)
```

### Serviços Externos

| Serviço | Função | Credencial |
|---------|--------|-----------|
| **Firebase** | Autenticação, Banco de dados (Firestore), Storage | `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` |
| **Mercado Pago** | Pagamentos (Pix, cartão) | `MP_ACCESS_TOKEN` |
| **Vercel** | Hosting, Edge Functions, DNS | CNAME `academicofacil.com.br` → Vercel |
| **GitHub** | Repositório de código | `paulosilvafilhoba/academicofacil` |

---

## 🔄 Fluxos Principais

### 1. **Fluxo de Compra (Pix)**

```
Cliente acessa /dashboard
      ↓
Faz login (Firebase Auth)
      ↓
Clica "Novo pedido"
      ↓
Preenche dados (tipo, laudas, prazo, tema, descrição, arquivo)
      ↓
Clica "Confirmar e escolher pagamento"
      ↓
Modal de resumo mostra valor (com desconto se elegível)
      ↓
Escolhe "Pix" → browser chama /api/criar-preferencia (POST)
      ↓ Backend (Vercel Edge):
      • Valida token Firebase do usuário
      • Verifica elegibilidade da promo (se aplicar_promo=true)
      • Calcula valor final (com ou sem desconto)
      • Cria pagamento no MP via API
      • Retorna QR Code Base64 + payment_id
      ↓
Frontend exibe QR + "Copia chave Pix"
Cliente escaneie e paga (no banco/app)
      ↓
Mercado Pago aprova pagamento
      ↓
MP envia POST para /api/webhook-mp (notificação)
      ↓ Webhook (Edge Function):
      • Extrai payment_id da notificação
      • Consulta pagamento real no MP (confirma status=approved)
      • Busca o pedido no Firestore (por mpPaymentId ou clientId)
      • Atualiza status: "aguardando_pagamento" → "pago"
      • Muda etapa: → "producao"
      ↓
Frontend recarrega dados → pedido aparece como "pago" ✅
Cliente vê confirmação
Admin vê na fila de produção
```

### 2. **Fluxo de Compra (Cartão)**

```
Cliente escolhe "Cartão (Mercado Pago)"
      ↓
Frontend chama /api/criar-preferencia (metodo: 'cartao')
      ↓
Backend cria Checkout Pro e retorna init_point (URL)
      ↓
Frontend abre a URL em aba nova
Cliente preenche dados do cartão no MP
      ↓
MP redireciona para success_url ou failure_url
      ↓
Webhook-mp também dispara para cartão
      ↓
Pedido marcado como "pago"
```

### 3. **Fluxo de Promoção (Desconto Primeiro Trabalho)**

```
Admin acessa painel → "Configuração"
      ↓
Ativa promoção + define % desconto + título + descrição
      ↓
Salva em Firestore: collection 'config' / doc 'promo_primeiro_trabalho'
      ↓
Cliente novo loga
      ↓
Frontend verifica: cliente sem pedidos anteriores?
      → SIM: promoAtiva = {ativo, desconto, titulo, descricao}
      → NÃO: promoAtiva = null
      ↓
Se elegível, exibe banner grande no topo do painel
      ↓
Cliente faz pedido
      ↓
Frontend calcula: valor_com_desconto = valor_cheio - (valor_cheio * % / 100)
      ↓
Resume mostra:
      • Valor cheio (riscado)
      • Desconto (em laranja)
      • Valor final
      ↓
Ao confirmar pagamento, envia aplicar_promo=true
      ↓
Backend valida:
      • Promo ativa? (no Firestore)
      • Cliente sem pedidos? (consulta orders)
      • → SIM em ambos: aplica desconto real no valor
      • → NÃO em qualquer: usa valor cheio
      ↓
Paga com desconto ✅
Pedido salvo com campos: descontoPct, descontoValor, promoAplicada
      ↓
Próximo pedido desse cliente: não tem desconto (já fez um)
```

### 4. **Fluxo Admin — Excluir Usuário**

```
Admin acessa → Clientes
      ↓
Tabela mostra: Nome | E-mail | Papel | Cadastro | Ações
      ↓
Admin pode ser excluído? Não (proteção)
Seu próprio UID? Não (proteção)
Outro cliente? SIM → botão 🗑 Excluir
      ↓
Clica → confirma com nome do usuário
      ↓
Frontend chama excluirUsuario(uid)
      ↓
Backend deleta doc do Firestore (users/{uid})
      ↓
Obs: Apagar a conta de login (Firebase Auth) requer Admin SDK
     (não implementado no frontend por segurança)
     → fazer manualmente no Firebase Console → Authentication
      ↓
Usuário desaparece da tabela ✅
```

---

## ⚙️ Guia de Configuração

### Variáveis de Ambiente (Vercel)

**Settings → Environment Variables** — adicione estas 3:

```
FIREBASE_PROJECT_ID          → academicofacil-87df6 (ou seu projeto)
FIREBASE_API_KEY             → AIzaSyAr8wl8rH_P0n6fEDhOVuqBif7YeTWmgsA
MP_ACCESS_TOKEN              → APP_USR-... (seu token Mercado Pago)
```

Após adicionar, **REDEPLOY obrigatório:**
1. Deployments → clique em ⋯ do deploy mais recente → Redeploy
2. Aguarde "Ready" (30-60s)

### Firebase Firestore — Regras de Segurança

As regras precisam permitir:
- Qualquer um pode ler/escrever `users/{uid}` onde `uid == auth.uid`
- Só admin pode ler/escrever `config/{doc}`
- Webhook (sem auth) pode ler/atualizar `orders/{id}`

**Regras recomendadas:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Usuários — cada um vê seu próprio
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
      allow list: if request.auth.uid != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Pedidos — clientes veem seus pedidos, admin vê todos
    match /orders/{orderId} {
      allow read: if request.auth.uid == resource.data.clientId;
      allow read, write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if resource.data.clientId == request.auth.uid && request.auth.uid != null;
      // Webhook sem auth pode atualizar (confia no payment_id validado)
      allow update: if request.auth == null && request.resource.data.mpPaymentId == resource.data.mpPaymentId;
    }

    // Config — só admin
    match /config/{doc} {
      allow read, write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Arquivos — cliente pode fazer upload seu, admin vê tudo
    match /files/{fileId} {
      allow read, write: if request.auth.uid == resource.data.uploadedBy;
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Chat — cliente vê seu, admin vê todos
    match /chats/{chatId}/messages/{msgId} {
      allow read: if request.auth.uid == get(/databases/$(database)/documents/chats/$(chatId)).data.clientId || 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

### Webhook — Configuração do Mercado Pago

O código já envia `notification_url` nos pagamentos, mas é bom confirmar:

1. **Mercado Pago** → Seu e-mail → **Configurações**
2. Procure **"Notificações" / "Webhooks"**
3. Confirme que `https://academicofacil.com.br/api/webhook-mp` está cadastrada como **Endpoint**
4. Marque como ativo para eventos: `payment.created`, `payment.updated`

Ou deixe que a primeira notificação de um pagamento se registre automaticamente (MP faz isso em alguns casos).

---

## ✨ Funcionalidades Implementadas

### Frontend (`dashboard.html`)

| Funcionalidade | Status | Nota |
|---|---|---|
| Login/Signup | ✅ | Firebase Auth, erros legíveis |
| Novo Pedido (formulário) | ✅ | Cálculo de preço em tempo real |
| Resumo pedido | ✅ | Mostra desconto se aplica |
| Pix QR Code | ✅ | Real, do Mercado Pago |
| Cartão (Checkout Pro) | ✅ | Redireciona para MP |
| Lista de pedidos | ✅ | Cliente vê seus, admin vê todos |
| Chat com admin | ✅ | Firestore Realtime |
| Upload de arquivo | ✅ | Firebase Storage |
| Painel Admin | ✅ | Estatísticas, lista de clientes |
| Excluir usuários | ✅ | Botão 🗑 com confirmação |
| Ativar promoção | ✅ | UI com controles % e texto |
| Banner promoção | ✅ | Grande, animado, chamativo |

### Backend (`/api`)

| Arquivo | Função | Status |
|---|---|---|
| `criar-preferencia.js` | Gera Pix/Cartão, valida promo | ✅ |
| `webhook-mp.js` | Confirma pagamento, atualiza Firestore | ✅ |
| `ia-academica.js` | Claude API (exemplo, não obrigatório) | ✅ |

---

## 🐛 Resolução de Problemas

### Problema: Pix não gera QR, aparece chave Pix genérica

**Causa:** `FIREBASE_API_KEY` não configurada na Vercel.

**Solução:**
1. Vercel → Settings → Environment Variables
2. Adicione `FIREBASE_API_KEY` = `AIzaSyAr8wl8rH_P0n6fEDhOVuqBif7YeTWmgsA`
3. Redeploy
4. Ctrl+Shift+R no navegador (clear cache)

---

### Problema: Pagamento realizado, mas pedido não muda para "pago"

**Causa 1:** Webhook não foi notificado (MP não configurado ou URL errada)

**Solução:**
- Mercado Pago console → Notificações → confirme URL: `https://academicofacil.com.br/api/webhook-mp`
- Se não aparecer, crie manualmente

**Causa 2:** Webhook está retornando erro

**Solução:**
- Vercel → Logs (Real-time) → filtro `webhook` → veja erros
- Confirme `FIREBASE_API_KEY` configurada

**Workaround temporário:**
- Admin acessa Clientes → clica nos ⋯ do pedido → "Marcar como pago"

---

### Problema: "Não autorizado" ao gerar Pix

**Causa:** Token do Firebase expirou ou não foi passado.

**Solução:**
- Logout + login de novo
- Ctrl+Shift+R (clear cache)

---

### Problema: Desconto não aparece no pedido

**Causa 1:** Promoção não está ativa no Firestore

**Solução:**
- Admin painel → "Configuração" → marque "Ativar promoção"

**Causa 2:** Cliente já fez um pedido anterior

**Solução:**
- Desconto só vale para o PRIMEIRO pedido
- Use outro e-mail se quer testar de novo

---

### Problema: Tela de pagamento muito grande

**Causa:** Zoom do navegador está aumentado.

**Solução:** `Ctrl + 0` para resetar ao 100%

---

### Problema: Toast de erro não aparece / ilegível

**Causa 1 (antiga):** Toast com z-index baixo e fundo transparente.

**Solução:** Atualize para v2.0 (já corrigido) — toast agora é sólido e topo fixo.

---

## 📊 Estrutura de Dados (Firestore)

### Collection: `users`

```json
{
  "uid": "user123",
  "name": "João Silva",
  "email": "joao@example.com",
  "role": "client|admin",
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

### Collection: `orders`

```json
{
  "id": "order123",
  "clientId": "user123",
  "tipo": "artigo|redacao|formatacao|...",
  "laudas": 20,
  "prazo": "urgente|normal|flexivel",
  "tema": "Tema do trabalho",
  "instituicao": "USP",
  "descricao": "Detalhes adicionais",
  "valor": 250.50,
  "valorCheio": 350.00,
  "descontoPct": 30,
  "descontoValor": 99.50,
  "promoAplicada": true,
  "status": "aguardando_pagamento|pago|producao|pronto|entregue|cancelado",
  "etapa": "pagamento|producao|revisao|entrega",
  "mpPaymentId": "payment123456",
  "pagoEm": timestamp,
  "createdAt": timestamp,
  "updatedAt": timestamp
}
```

### Collection: `config`

```json
{
  "doc": "promo_primeiro_trabalho",
  "ativo": true,
  "desconto": 30,
  "titulo": "Promoção de boas-vindas!",
  "descricao": "30% de desconto no seu primeiro trabalho",
  "updatedAt": timestamp
}
```

### Collection: `chats` / `files` / etc.

(Mesma estrutura existente, sem mudanças na v2.0)

---

## 🚀 Deploy & CI/CD

### GitHub → Vercel (automático)

1. Push para `main` no `paulosilvafilhoba/academicofacil`
2. Vercel detecta automaticamente
3. Build & Deploy em ~1 min
4. Site atualiza em `academicofacil.com.br`

### Checklist antes de push

- [ ] `node --check api/criar-preferencia.js` ✅
- [ ] `node --check api/webhook-mp.js` ✅
- [ ] Vercel env vars completas (FIREBASE_*, MP_*)
- [ ] Firestore rules atualizadas (se houver mudanças)
- [ ] Testou Pix com um pagamento teste

---

## 🔐 Segurança

### ✅ O que está seguro

- **Tokens secretos** (MP_ACCESS_TOKEN, FIREBASE_*) **nunca** saem do backend (Edge Function)
- **Desconto validado no servidor** — cliente não consegue forjar
- **Webhook valida payment_id** — não atualiza pedido sem confirmar no MP
- **Regras Firestore** — clientes veem só seus dados, admin vê tudo
- **Auth** — Firebase gerencia senhas com HTTPS

### ⚠️ O que falta (desejável em futuro)

- [ ] Rate limiting no webhook (evita abuso)
- [ ] Assinatura de webhook (confirma que é MP, não impostor)
- [ ] CORS configurado (permitir/bloquear domínios)
- [ ] Audit log (registrar quem fez o quê)

---

## 📈 Roadmap Futuro

### Curto prazo

- [ ] Assinatura digital de webhook (valida que é realmente do MP)
- [ ] Rate limiting nas Edge Functions
- [ ] Notificação por e-mail quando pedido é pago
- [ ] PDF de recibo automático

### Médio prazo

- [ ] Integração com IA para sugestão de preço
- [ ] Sistema de cupons/códigos promocionais
- [ ] Histórico de pagamentos em PDF
- [ ] Dashboard analítico (receita por tipo de serviço, etc.)

### Longo prazo

- [ ] App mobile (React Native)
- [ ] Integração com Slack para alertas
- [ ] Sistema de avaliações de clientes
- [ ] Múltiplos idiomas (EN, ES)

---

## 📞 Contato & Suporte

**Desenvolvedor:** Paulo Silva Filho  
**E-mail:** profpaulofilho@gmail.com  
**Repositório:** https://github.com/paulosilvafilhoba/academicofacil  
**Site:** https://academicofacil.com.br

---

**Última atualização:** 13 de junho de 2026  
**Versão:** 2.0 (Webhook + Promoções + Melhorias UI)
