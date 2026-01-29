import { create } from 'zustand';
import type { Proof, OutputData, SerializedBlindedMessage } from '@cashu/cashu-ts';
import { CONFIG } from '../lib/config';
import { debugLog } from './debug';
import { useWalletStore } from './wallet';
import { 
  createBlindedOutputs, 
  unblindSignatures,
} from '../lib/blinding';

interface QuoteResponse {
  quoteId: string;
  bolt11: string;
  amount: number;
  expiresAt: string;
}

interface QuoteStatusResponse {
  quoteId: string;
  paid: boolean;
  amount: number;
  expiresAt: string;
}

interface MintResponse {
  signatures: Array<{
    id: string;
    amount: number;
    C_: string;
  }>;
}

interface PurchaseState {
  // Quote state
  quoteId: string | null;
  bolt11: string | null;
  quoteAmount: number;
  quoteExpiry: Date | null;
  quotePaid: boolean;
  
  // Minting state
  blindedOutputs: SerializedBlindedMessage[] | null;
  outputData: OutputData[] | null;
  mintedProofs: Proof[] | null;
  
  // Loading states
  isCreatingQuote: boolean;
  isCheckingStatus: boolean;
  isMinting: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  createQuote: (amount: number) => Promise<void>;
  checkQuoteStatus: () => Promise<boolean>;
  mintTokens: () => Promise<void>;
  reset: () => void;
}

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  // Initial state
  quoteId: null,
  bolt11: null,
  quoteAmount: 0,
  quoteExpiry: null,
  quotePaid: false,
  
  blindedOutputs: null,
  outputData: null,
  mintedProofs: null,
  
  isCreatingQuote: false,
  isCheckingStatus: false,
  isMinting: false,
  error: null,
  
  createQuote: async (amount: number) => {
    set({ isCreatingQuote: true, error: null });
    
    const url = `${CONFIG.CONTENT_API_URL}/credits/quote`;
    debugLog('request', `POST ${url}`, { amount });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `Quote creation failed: ${response.status}`, { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Failed to create quote: ${response.status} ${errorText}`);
      }
      
      const data: QuoteResponse = await response.json();
      debugLog('response', `POST ${url}`, data);
      
      set({
        quoteId: data.quoteId,
        bolt11: data.bolt11,
        quoteAmount: data.amount,
        quoteExpiry: new Date(data.expiresAt),
        quotePaid: false,
        isCreatingQuote: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', 'Quote creation error', { error: message });
      set({ 
        isCreatingQuote: false, 
        error: message 
      });
    }
  },
  
  checkQuoteStatus: async () => {
    const { quoteId } = get();
    if (!quoteId) {
      debugLog('error', 'No quote ID to check');
      return false;
    }
    
    set({ isCheckingStatus: true, error: null });
    
    const url = `${CONFIG.CONTENT_API_URL}/credits/quote/${quoteId}`;
    debugLog('request', `GET ${url}`);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `Quote status check failed: ${response.status}`, { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Failed to check quote: ${response.status}`);
      }
      
      const data: QuoteStatusResponse = await response.json();
      debugLog('response', `GET ${url}`, data);
      
      set({
        quotePaid: data.paid,
        isCheckingStatus: false,
      });
      
      return data.paid;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', 'Quote status check error', { error: message });
      set({ 
        isCheckingStatus: false, 
        error: message 
      });
      return false;
    }
  },
  
  mintTokens: async () => {
    const { quoteId, quoteAmount, quotePaid } = get();
    
    if (!quoteId) {
      debugLog('error', 'No quote ID for minting');
      set({ error: 'No quote ID' });
      return;
    }
    
    if (!quotePaid) {
      debugLog('error', 'Quote not paid yet');
      set({ error: 'Quote not paid' });
      return;
    }
    
    set({ isMinting: true, error: null });
    
    try {
      // Step 1: Create blinded outputs
      debugLog('wallet', 'Starting mint process', { quoteId, amount: quoteAmount });
      const { outputs, outputData } = await createBlindedOutputs(quoteAmount);
      
      set({ blindedOutputs: outputs, outputData });
      
      // Step 2: Send to mint endpoint
      const url = `${CONFIG.CONTENT_API_URL}/credits/mint/bolt11`;
      const body = {
        quote: quoteId,
        outputs: outputs,
      };
      
      debugLog('request', `POST ${url}`, body);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        debugLog('error', `Mint failed: ${response.status}`, { 
          status: response.status, 
          body: errorText 
        });
        throw new Error(`Failed to mint: ${response.status} ${errorText}`);
      }
      
      const data: MintResponse = await response.json();
      debugLog('response', `POST ${url}`, data);
      
      // Step 3: Unblind signatures to get proofs
      const proofs = await unblindSignatures(
        data.signatures.map(s => ({
          id: s.id,
          amount: s.amount,
          C_: s.C_,
        })),
        outputData
      );
      
      set({ mintedProofs: proofs });
      
      // Step 4: Add proofs to wallet
      useWalletStore.getState().addProofs(proofs);
      
      debugLog('wallet', 'Mint complete!', { 
        proofCount: proofs.length,
        totalAmount: proofs.reduce((s, p) => s + p.amount, 0)
      });
      
      set({ isMinting: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      debugLog('error', 'Minting error', { error: message });
      set({ 
        isMinting: false, 
        error: message 
      });
    }
  },
  
  reset: () => {
    debugLog('event', 'Purchase state reset');
    set({
      quoteId: null,
      bolt11: null,
      quoteAmount: 0,
      quoteExpiry: null,
      quotePaid: false,
      blindedOutputs: null,
      outputData: null,
      mintedProofs: null,
      isCreatingQuote: false,
      isCheckingStatus: false,
      isMinting: false,
      error: null,
    });
  },
}));
