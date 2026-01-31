/**
 * SDK Integration Test
 * 
 * Tests the SDK packages work together correctly.
 * Run: npx tsx scripts/test-sdk.ts
 */

import { PaywallClient, PaywallError } from '../packages/paywall-client/src/index.js';
import { Wallet, MemoryAdapter } from '../packages/wallet/src/index.js';

// Wavlake staging endpoints
const MINT_URL = 'https://nutshell-staging-854568123236.us-central1.run.app';
const API_URL = 'https://api-staging-854568123236.us-central1.run.app';

async function main() {
  console.log('🧪 SDK Integration Test\n');

  // 1. Test PaywallClient instantiation
  console.log('1. Creating PaywallClient...');
  const client = new PaywallClient({ apiUrl: API_URL });
  console.log('   ✅ PaywallClient created\n');

  // 2. Test Wallet instantiation
  console.log('2. Creating Wallet with MemoryAdapter...');
  const wallet = new Wallet({
    mintUrl: MINT_URL,
    storage: new MemoryAdapter(),
  });
  console.log('   ✅ Wallet created');
  console.log(`   Mint URL: ${wallet.mintUrl}\n`);

  // 3. Test wallet load
  console.log('3. Loading wallet...');
  await wallet.load();
  console.log(`   ✅ Wallet loaded`);
  console.log(`   Balance: ${wallet.balance} credits`);
  console.log(`   Proofs: ${wallet.proofs.length}\n`);

  // 4. Test receiving a token (if provided)
  const testToken = process.argv[2];
  if (testToken) {
    console.log('4. Receiving token...');
    try {
      const amount = await wallet.receiveToken(testToken);
      console.log(`   ✅ Received ${amount} credits`);
      console.log(`   New balance: ${wallet.balance}\n`);
    } catch (err) {
      console.log(`   ❌ Failed: ${err instanceof Error ? err.message : err}\n`);
    }
  } else {
    console.log('4. Skipping token receive (no token provided)\n');
    console.log('   To test: npx tsx scripts/test-sdk.ts cashuB...\n');
  }

  // 5. Test content request (will fail without valid token, but tests the flow)
  console.log('5. Testing content request (expecting 402)...');
  const testDtag = 'test-track-id';
  try {
    const result = await client.requestContent(testDtag, 'invalid-token');
    console.log(`   Got URL: ${result.url}\n`);
  } catch (err) {
    if (err instanceof PaywallError) {
      console.log(`   ✅ Got expected PaywallError: ${err.code}`);
      console.log(`   Message: ${err.message}\n`);
    } else {
      console.log(`   ❌ Unexpected error: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  // 6. If we have balance, try creating a token
  if (wallet.balance > 0) {
    console.log('6. Creating token from wallet...');
    try {
      const token = await wallet.createToken(1);
      console.log(`   ✅ Created token: ${token.substring(0, 50)}...`);
      console.log(`   New balance: ${wallet.balance}\n`);

      // 7. Try a real content request
      console.log('7. Requesting content with real token...');
      try {
        // Use a real track dtag if we have one
        const result = await client.requestContent(testDtag, token);
        console.log(`   ✅ Got content URL: ${result.url.substring(0, 50)}...`);
        if (result.change) {
          console.log(`   Change token received`);
        }
      } catch (err) {
        if (err instanceof PaywallError) {
          console.log(`   PaywallError: ${err.code} - ${err.message}`);
        } else {
          console.log(`   Error: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Failed: ${err instanceof Error ? err.message : err}\n`);
    }
  } else {
    console.log('6. Skipping token creation (no balance)\n');
  }

  console.log('✅ SDK test complete!');
}

main().catch(console.error);
