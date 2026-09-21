# ZUKO XMD Billing

Billing is centralized in `lib/payment.js` and `lib/premium.js`. Commands do not contain provider-specific payment verification logic.

## Providers

### Manual mode (default)
Set:

```env
PAYMENT_PROVIDER=manual
PREMIUM_PAY_NUMBER=8169946429
PREMIUM_PAY_NAME=Bassey Tabia precious
PREMIUM_PAY_METHOD=Opay
```

`.upgrade pro` displays the configured payment details. Premium is activated by the bot owner after confirming the payment.

### Flutterwave mode
Set:

```env
PAYMENT_PROVIDER=flutterwave
PAYMENT_BASE_URL=https://YOUR_PUBLIC_RAILWAY_DOMAIN
PAYMENT_CURRENCY=NGN
PAYMENT_BUSINESS_NAME=ZUKO XMD
FLW_SECRET_KEY=FLWSECK_...
FLW_SECRET_HASH=your-webhook-secret-hash
```

Create the Flutterwave webhook endpoint:

```text
https://YOUR_PUBLIC_RAILWAY_DOMAIN/api/payment/webhook
```

The callback endpoint is:

```text
https://YOUR_PUBLIC_RAILWAY_DOMAIN/api/payment/callback
```

The server verifies the transaction status, transaction reference, currency and amount before activating a subscription. Repeated references are protected by the existing `payments.json` idempotency store.

## Commands

```text
.premium
.upgrade your@email.com pro
.usage
```

In manual mode, `.upgrade pro` is sufficient. In Flutterwave mode, an email is required for hosted checkout.

## Railway

Do not put `FLW_SECRET_KEY` or `FLW_SECRET_HASH` into source control. Add them as Railway Variables.
