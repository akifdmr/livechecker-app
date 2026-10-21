# Moneris integration

This package uses the current Moneris API payment flow for merchant transactions. The integration is deliberately tokenized: the backend accepts a Moneris `paymentMethodId` and does not accept raw PAN/CVV.

## Configuration

Copy `.env.example` to your deployment environment and provide:

- `MONERIS_ENABLED=true`
- `MONERIS_ENVIRONMENT=production` (use `sandbox` only for development/testing)
- `MONERIS_CLIENT_ID` / `MONERIS_CLIENT_SECRET` (OAuth), or `MONERIS_API_KEY` (sent as `X-API-Key`)
- `MONERIS_MERCHANT_ID`

## Supported merchant actions

- `POST /payments/merchant/sale`
- `POST /payments/merchant/preauth`
- `POST /payments/merchant/capture`
- `POST /payments/merchant/refund`
- `POST /payments/merchant/void`
- `GET /payments/merchant/capabilities?providerKey=moneris`

## Flow

1. Collect payment data with Moneris Hosted Tokenization / approved client-side flow.
2. Receive a `paymentMethodId`.
3. Send that ID with the amount and order information to the backend.
4. Store the returned `paymentId` as the canonical provider transaction ID.
5. Use the same `paymentId` for completion, cancellation or refund.

The adapter normalizes Moneris payment states into the existing provider result shape.

## Important

The existing live-check/raw-card routes were intentionally not modified to accept Moneris raw card data. This keeps the existing application structure intact while adding a merchant-safe Moneris transaction path.


## Production audit notes

- Production base URL: `https://api.moneris.io`.
- Sandbox and Production applications/credentials are separate in the Moneris Developer Portal; do not reuse sandbox credentials in production.
- Stored Payment Method requests use `paymentMethod.paymentMethodSource = PAYMENT_METHOD_ID` and `paymentMethod.paymentMethodId`.
- OAuth uses `Authorization: Bearer <access_token>`; API-key authentication uses `X-API-Key: <key>` plus `X-Merchant-Id`.
- Capture uses `POST /payments/{payment-id}/complete`; void uses `POST /payments/{payment-id}/cancel`; matching refunds use `POST /refunds` with `paymentId` and `refundAmount`.
