# AcadêmicoFácil - Integração Opção 1

Este pacote contém a versão do site integrada com Cloudflare Email Routing + Resend.

## Arquivos

- `index.html`: página atualizada com o botão de orçamento enviando dados para `/api/send-email`.
- `api/send-email.js`: função serverless da Vercel que envia:
  1. Um e-mail interno para `paulosilvafilhoba@gmail.com`.
  2. Uma confirmação automática para o e-mail informado pelo cliente.

## Como instalar

1. No GitHub, substitua o arquivo `index.html` pelo arquivo deste pacote.
2. No GitHub, substitua ou crie `api/send-email.js` com o arquivo deste pacote.
3. Faça `Commit changes`.
4. Aguarde o deploy automático da Vercel.
5. Teste a API em:
   `https://academicofacil.com.br/api/send-email`

O resultado esperado no navegador é:

```json
{"status":"API do AcadêmicoFácil funcionando","metodo":"GET"}
```

Depois teste o formulário de orçamento na página inicial.
