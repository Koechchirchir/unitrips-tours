import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();
const port = Number(process.env.PORT || 3000);
const darajaBaseUrl = 'https://sandbox.safaricom.co.ke';
const payments = new Map();

app.use(cors());
app.use(express.json());

function requiredEnv(name) {
    const value = process.env[name];
    if (!value || value.startsWith('replace_with_') || value.toUpperCase() === 'NA') {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

function formatTimestamp() {
    const now = new Date();
    const parts = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ];
    return parts.join('');
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('07') && digits.length === 10) return `254${digits.slice(1)}`;
    if (digits.startsWith('2547') && digits.length === 12) return digits;
    return null;
}

async function getAccessToken() {
    const key = requiredEnv('MPESA_CONSUMER_KEY');
    const secret = requiredEnv('MPESA_CONSUMER_SECRET');
    const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
    const response = await fetch(`${darajaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` }
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) throw new Error(data.errorMessage || 'Could not get a Daraja access token');
    return data.access_token;
}

app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'unitrips-mpesa-sandbox' });
});

app.post('/api/stkpush', async (request, response) => {
    try {
        const phone = normalizePhone(request.body.phone);
        const amount = Number(request.body.amount);
        const accountReference = String(request.body.accountReference || 'UniTrips booking').slice(0, 12);

        if (!phone) return response.status(400).json({ error: 'Use a valid Kenyan number such as 0712345678.' });
        if (!Number.isInteger(amount) || amount < 1) return response.status(400).json({ error: 'Amount must be a positive whole number.' });

        const shortcode = requiredEnv('MPESA_SHORTCODE');
        const passkey = requiredEnv('MPESA_PASSKEY');
        const callbackUrl = requiredEnv('MPESA_CALLBACK_URL');
        const timestamp = formatTimestamp();
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
        const token = await getAccessToken();
        const payload = {
            BusinessShortCode: shortcode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
            Amount: amount,
            PartyA: phone,
            PartyB: shortcode,
            PhoneNumber: phone,
            CallBackURL: callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: 'UniTrips booking'
        };

        const stkResponse = await fetch(`${darajaBaseUrl}/mpesa/stkpush/v1/processrequest`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await stkResponse.json();
        if (!stkResponse.ok) return response.status(stkResponse.status).json(data);
        payments.set(data.CheckoutRequestID, { status: 'pending', createdAt: Date.now() });
        response.status(202).json({ message: 'STK Push requested.', checkoutRequestId: data.CheckoutRequestID, responseCode: data.ResponseCode });
    } catch (error) {
        console.error(error.message);
        response.status(500).json({ error: error.message });
    }
});

app.get('/api/payment-status/:checkoutRequestId', (request, response) => {
    const payment = payments.get(request.params.checkoutRequestId);
    if (!payment) return response.status(404).json({ error: 'Payment request not found.' });
    response.json(payment);
});

app.post('/api/mpesa/callback', (request, response) => {
    const callback = request.body?.Body?.stkCallback;
    if (callback?.CheckoutRequestID) {
        const resultCode = Number(callback.ResultCode);
        payments.set(callback.CheckoutRequestID, {
            status: resultCode === 0 ? 'paid' : 'failed',
            resultCode,
            resultDescription: callback.ResultDesc || 'Payment completed',
            receivedAt: Date.now()
        });
    }
    console.log('M-Pesa callback received:', JSON.stringify(request.body));
    response.json({ ResultCode: 0, ResultDesc: 'Callback received successfully' });
});

app.listen(port, () => {
    console.log(`UniTrips M-Pesa sandbox server running at http://localhost:${port}`);
});