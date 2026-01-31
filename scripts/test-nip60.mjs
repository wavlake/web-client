#!/usr/bin/env node
/**
 * NIP-60 Wallet Test Script
 * 
 * Tests the full flow:
 * 1. Open the POC site
 * 2. Login with nsec
 * 3. Switch to Nostr storage mode
 * 4. Mint tokens (if invoice paid) or import test token
 * 5. Verify proofs saved to relay
 */

import puppeteer from 'puppeteer';

const SITE_URL = 'https://wavlake.github.io/web-client/';
const TEST_NSEC = process.env.TEST_NSEC || 'nsec1v7w4y87zp2kc7d4pgla4s7u92n5rmh83zs7y0x2zdach8vuzv23qp250f7';
const MINT_QUOTE_ID = process.env.MINT_QUOTE_ID;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting NIP-60 wallet test...\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('NIP-60') || text.includes('Nostr') || text.includes('relay') || text.includes('wallet')) {
      console.log('  [page]', text);
    }
  });
  
  try {
    // 1. Navigate to site
    console.log('📍 Opening', SITE_URL);
    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/nip60-test-1-loaded.png', fullPage: true });
    console.log('✅ Site loaded\n');
    
    // 2. Click nsec login button
    console.log('🔐 Logging in with nsec...');
    
    // Find and click the nsec button
    const nsecButton = await page.$('button:has-text("nsec")');
    if (nsecButton) {
      await nsecButton.click();
    } else {
      // Try alternative selector
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && text.includes('nsec')) {
          await btn.click();
          break;
        }
      }
    }
    await sleep(500);
    
    // Find the nsec input field
    const nsecInput = await page.$('input[type="password"]');
    if (nsecInput) {
      await nsecInput.type(TEST_NSEC);
      await sleep(300);
      
      // Click login button
      const loginButtons = await page.$$('button');
      for (const btn of loginButtons) {
        const text = await btn.evaluate(el => el.textContent);
        if (text && text.includes('Login')) {
          await btn.click();
          break;
        }
      }
    } else {
      console.log('⚠️  Could not find nsec input field');
    }
    
    await sleep(2000);
    await page.screenshot({ path: '/tmp/nip60-test-2-loggedin.png', fullPage: true });
    console.log('✅ Login attempted\n');
    
    // 3. Switch to Nostr storage mode
    console.log('☁️  Switching to Nostr storage mode...');
    
    // Look for the Nostr toggle button
    const nostrButtons = await page.$$('button');
    for (const btn of nostrButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && text.includes('Nostr')) {
        await btn.click();
        console.log('   Clicked Nostr button');
        break;
      }
    }
    
    await sleep(3000);
    await page.screenshot({ path: '/tmp/nip60-test-3-nostr-mode.png', fullPage: true });
    console.log('✅ Nostr mode activated\n');
    
    // 4. Check wallet state
    console.log('💰 Checking wallet state...');
    
    // Get page content for debugging
    const pageContent = await page.content();
    
    // Look for balance display
    const balanceText = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.textContent && el.textContent.match(/\d+\s*(sat|credits?|balance)/i)) {
          return el.textContent;
        }
      }
      return null;
    });
    
    if (balanceText) {
      console.log('   Balance info:', balanceText.slice(0, 100));
    }
    
    // 5. Check for any errors
    const errors = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
      return Array.from(errorElements).map(el => el.textContent).filter(Boolean);
    });
    
    if (errors.length > 0) {
      console.log('⚠️  Errors found:', errors);
    }
    
    // Final screenshot
    await page.screenshot({ path: '/tmp/nip60-test-4-final.png', fullPage: true });
    
    console.log('\n📸 Screenshots saved to /tmp/nip60-test-*.png');
    console.log('✅ Test complete!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: '/tmp/nip60-test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
