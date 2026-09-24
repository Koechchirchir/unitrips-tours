# UniTrips M-Pesa sandbox server

## Setup

1. Open a terminal in this folder.
2. Run `npm.cmd install`.
3. Copy `.env.example` to `.env`.
4. Add your Daraja sandbox Consumer Key, Consumer Secret, and Passkey to `.env`.
5. Set `MPESA_CALLBACK_URL` to a public HTTPS URL ending in `/api/mpesa/callback`.
6. Run `npm.cmd start`.

Check the server with `http://localhost:3000/health`.

## Test request

Use a Kenyan phone number in either `0712345678` or `254712345678` format:

```powershell
Invoke-RestMethod http://localhost:3000/api/stkpush -Method Post -ContentType 'application/json' -Body '{"phone":"0712345678","amount":1,"accountReference":"Test"}'
```

The callback URL must be public. For local testing, expose port 3000 with a tunnel such as ngrok, then place its HTTPS URL in `.env`.

Never commit `.env` to GitHub.