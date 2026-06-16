# Integração Resend - AcadêmicoFácil

Arquivos incluídos:

- `index.html`: arquivo completo da landing page com a função `enviar()` integrada ao endpoint `/api/send-email`.
- `api/send-email.js`: função serverless da Vercel para envio via Resend.

## Como publicar com segurança

1. No GitHub, abra o repositório `academicofacil`.
2. Substitua o `index.html` atual pelo arquivo `index.html` deste pacote.
3. Confirme se existe a pasta `api` na raiz do projeto.
4. Dentro da pasta `api`, coloque o arquivo `send-email.js`.
5. Faça commit.
6. Aguarde o deploy automático da Vercel.
7. Teste a página de orçamento no site.

## Variável obrigatória na Vercel

A variável abaixo precisa existir em `Settings > Environment Variables`:

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
```

## Teste esperado

Ao preencher o orçamento e clicar em `Solicitar assessoria agora`, você deve receber um e-mail enviado por:

```text
AcadêmicoFácil <contato@academicofacil.com.br>
```
