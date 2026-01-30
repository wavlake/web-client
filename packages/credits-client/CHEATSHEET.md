# Wavlake Credits - Quick Reference

## Install

```bash
npm install @cashu/cashu-ts
```

## Minimum Viable Code

```typescript
import { Wallet, Mint, getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';

const MINT_URL = 'https://mint.wavlake.com';
const API_URL = 'https://api.wavlake.com';

let wallet: Wallet;
let proofs: Proof[] = JSON.parse(localStorage.getItem('proofs') || '[]');

// INIT (call once on app load)
async function init() {
  const mint = new Mint(MINT_URL);
  wallet = new Wallet(mint, { unit: 'usd' });
  await wallet.loadMint();
}

// PLAY TRACK
async function playTrack(dtag: string): Promise<string> {
  // 1. Get price
  const resp = await fetch(`${API_URL}/api/v1/content/${dtag}`);
  if (resp.ok) return (await resp.json()).data.url; // free track
  
  const { price_credits: price } = await resp.json();
  
  // 2. Swap proofs
  const { send, keep } = await wallet.send(price, proofs);
  proofs = keep;
  localStorage.setItem('proofs', JSON.stringify(proofs));
  
  // 3. Pay
  const token = getEncodedTokenV4({ mint: MINT_URL, proofs: send, unit: 'usd' });
  const paid = await fetch(`${API_URL}/api/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  
  return (await paid.json()).data.url;
}
```

## Fast Path (Pre-built Tokens)

```typescript
const tokenCache: Map<number, string[]> = new Map();

// Pre-build on load
async function prebuild(prices: number[]) {
  for (const price of prices) {
    const { send, keep } = await wallet.send(price, proofs);
    proofs = keep;
    
    const token = getEncodedTokenV4({ mint: MINT_URL, proofs: send, unit: 'usd' });
    tokenCache.set(price, [...(tokenCache.get(price) || []), token]);
  }
}

// Fast play (single request)
async function fastPlay(dtag: string, price: number): Promise<string> {
  const tokens = tokenCache.get(price);
  if (!tokens?.length) throw new Error('No token cached');
  
  const token = tokens.shift()!;
  const resp = await fetch(`${API_URL}/api/v1/content/${dtag}`, {
    headers: { 'X-Ecash-Token': token }
  });
  
  return (await resp.json()).data.url;
}
```

## Mint Credits (from Lightning)

```typescript
async function mint(quoteId: string, amount: number) {
  const newProofs = await wallet.mintProofs(amount, quoteId);
  proofs.push(...newProofs);
  localStorage.setItem('proofs', JSON.stringify(proofs));
}
```

## Get Balance

```typescript
const balance = proofs.reduce((s, p) => s + p.amount, 0);
```

## Key Points

| Topic | Details |
|-------|---------|
| Unit | `'usd'` (not sat) |
| 1 credit | $0.01 |
| Token header | `X-Ecash-Token` |
| 402 response | `{ price_credits, mint_url }` |
| 200 response | `{ data: { url } }` |
| Storage | Proofs are bearer tokens - persist them! |
