# AcadêmicoFácil - atualização nome completo e tema do trabalho

Este pacote adiciona ao formulário de orçamento:

- Nome completo
- Telefone/WhatsApp
- Tema do trabalho
- Observações adicionais

Também atualiza `api/send-email.js` para enviar esses dados no e-mail interno e no e-mail de confirmação ao cliente.

## Como aplicar

1. Substitua o arquivo `index.html` da raiz do projeto.
2. Substitua o arquivo `api/send-email.js`.
3. Faça commit no GitHub.
4. Aguarde o deploy da Vercel.
5. Teste em `https://academicofacil.com.br/#orcamento`.

## Campos obrigatórios no formulário

- Nome completo
- E-mail
- Tipo de trabalho
- Tema do trabalho

## Resultado esperado

Você receberá um e-mail com:

- Nome completo do cliente
- E-mail
- Telefone/WhatsApp
- Tipo de trabalho
- Tema do trabalho
- Laudas
- Prazo
- Valor estimado
- Observações

O cliente receberá automaticamente a confirmação de solicitação.
