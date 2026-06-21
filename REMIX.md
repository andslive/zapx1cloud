# 🚀 Remix — Primeiros Passos

Este projeto é multi-tenant white label. Após o remix, configure:

| Item | Valor |
|------|-------|
| **Secret** | `SUPER_ADMIN_EMAIL` (informe o e-mail do super admin) |
| **Secret opcional** | `DEFAULT_SUPER_ADMIN_PASSWORD` (senha inicial do seed) |

Ao primeiro login do e-mail definido em `SUPER_ADMIN_EMAIL`, a conta é automaticamente promovida a `super_admin` pela edge function `auto-promote-super-admin`.

Em seguida, conclua o wizard de primeiro acesso em `/super-admin` para preencher branding, configurações da plataforma e criar a primeira organização.
