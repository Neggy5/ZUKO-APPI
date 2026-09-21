# ZUKO API — Email Verification Setup

Email verification uses **Resend**. The Railway deployment does not require SMTP host, port, username, password, or TLS configuration.

## Railway

Add this secret to the API service Variables:

```env
RESEND_API_KEY=re_xxxxxxxxx
```

Optional production sender:

```env
RESEND_FROM_EMAIL=ZUKO API <noreply@yourdomain.com>
```

For initial testing the application defaults to:

```text
ZUKO API <onboarding@resend.dev>
```

The verification URL automatically uses Railway's `RAILWAY_PUBLIC_DOMAIN`. Set `PUBLIC_BASE_URL` only if you want to use a custom domain.

## Resend

Create the API key in the Resend dashboard and keep it private. Do not commit it to GitHub. For production sending, verify a domain in Resend and use that domain as the sender.
