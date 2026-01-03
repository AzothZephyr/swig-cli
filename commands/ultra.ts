/**
 * IMPORTANT: jupiter ultra API is NOT compatible with swig wallets.
 *
 * why it doesn't work:
 * 1. ultra API returns a pre-built transaction where the `taker` wallet must sign directly
 * 2. swig wallets are PDAs (program derived addresses) - they have no private key
 * 3. swig wallets "sign" by having an authority wrap instructions via getSignInstructions()
 * 4. ultra's FAQ explicitly states: "you cannot modify ultra swap transactions"
 *
 * this implementation attempts to:
 * - extract instructions from ultra's pre-built transaction
 * - wrap them with swig's signing mechanism
 * - send via our own RPC (bypassing ultra's /execute endpoint)
 *
 * however, this approach fails because:
 * - the extracted instructions still expect the swig wallet PDA to be a direct signer
 * - when swig wraps instructions, the signature validation doesn't match what
 *   the underlying swap programs expect
 *
 * for swig-compatible swaps, use the `swap` command which uses jupiter metis API
 * (provides raw instructions that can be properly wrapped with swig signing).
 */

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import {
  fetchSwig,
  getSignInstructions,
  getSwigWalletAddress,
  Swig,
} from '@swig-wallet/classic';

import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';

function formatNumber(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface UltraOrderResponse {
  requestId: string;
  transaction: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  swapType: string;
  slippageBps: number;
  priceImpactBps?: number;
}

async function getUltraOrder(
  inputMint: string,
  outputMint: string,
  amount: string,
  taker: string,
): Promise<UltraOrderResponse> {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    throw new Error('JUPITER_API_KEY is not set in the .env file. Get one at https://portal.jup.ag/');
  }

  const url = new URL('https://api.jup.ag/ultra/v1/order');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount);
  url.searchParams.set('taker', taker);

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': apiKey,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ultra API error: ${response.status} - ${errorText}`);
  }
  return response.json();
}

async function extractInstructionsFromTransaction(
  transaction: VersionedTransaction,
  connection: Connection,
): Promise<TransactionInstruction[]> {
  const message = transaction.message;
  
  // Resolve all account keys including those from address lookup tables
  const lookupTableAddresses = message.addressTableLookups.map(
    (lookup) => lookup.accountKey,
  );
  
  const lookupTables = await Promise.all(
    lookupTableAddresses.map(async (addr) => {
      const res = await connection.getAddressLookupTable(addr);
      return res.value!;
    }),
  );

  // Build full account keys array
  const accountKeys: PublicKey[] = [...message.staticAccountKeys];
  
  // Add keys from lookup tables
  for (let i = 0; i < message.addressTableLookups.length; i++) {
    const lookup = message.addressTableLookups[i];
    const table = lookupTables[i];
    
    // Add writable keys first
    for (const index of lookup.writableIndexes) {
      accountKeys.push(table.state.addresses[index]);
    }
    // Then readonly keys
    for (const index of lookup.readonlyIndexes) {
      accountKeys.push(table.state.addresses[index]);
    }
  }

  return message.compiledInstructions.map((ix) => {
    const programId = accountKeys[ix.programIdIndex];
    const keys = ix.accountKeyIndexes.map((index) => {
      const pubkey = accountKeys[index];
      return {
        pubkey,
        isSigner: message.isAccountSigner(index),
        isWritable: message.isAccountWritable(index),
      };
    });

    return new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from(ix.data),
    });
  });
}

export async function ultra(
  amount: string,
  swigAccountAddressStr: string,
  from: string,
  to: string,
) {
  const rootUser = getUser();
  const connection = getConnection();

  console.log(chalk.cyan(`🌐 Connected to Solana RPC`));
  console.log(
    chalk.green('👤 Root user public key:'),
    chalk.cyan(rootUser.publicKey.toBase58()),
  );

  const balance = await connection.getBalance(rootUser.publicKey);
  if (balance < 0.005 * LAMPORTS_PER_SOL) {
    console.error(chalk.red('❌ Insufficient SOL. Need at least 0.005 SOL.'));
    process.exit(1);
  }
  console.log(
    chalk.blue(
      `💰 Root user balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    ),
  );

  const swigAccountAddress = new PublicKey(swigAccountAddressStr);
  console.log(
    chalk.yellow('📝 Using Swig account:'),
    chalk.cyan(swigAccountAddress.toBase58()),
  );

  const swig: Swig = await fetchSwig(connection, swigAccountAddress);
  const rootRole = swig.findRolesByEd25519SignerPk(rootUser.publicKey)[0];
  if (!rootRole) {
    console.error(
      chalk.red('❌ Root user does not have authority over this Swig account'),
    );
    process.exit(1);
  }

  const swigWalletAddress = await getSwigWalletAddress(swig);
  console.log(
    chalk.green('✓ Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';

  const inputMint = from === 'sol' ? WSOL_MINT : USDC_MINT;
  const outputMint = to === 'sol' ? WSOL_MINT : USDC_MINT;

  const decimals = from === 'sol' ? 9 : 6;
  const rawAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals)).toString();

  console.log(chalk.blue('📊 Requesting Ultra order...'));
  console.log(`   Input: ${amount} ${from.toUpperCase()}`);
  console.log(`   Output: ${to.toUpperCase()}`);

  const orderResponse = await getUltraOrder(
    inputMint,
    outputMint,
    rawAmount,
    swigWalletAddress.toBase58(),
  );

  console.log(chalk.green('✓ Order received:'));
  console.log(`   Request ID: ${orderResponse.requestId}`);
  console.log(`   In Amount: ${formatNumber(Number(orderResponse.inAmount))}`);
  console.log(`   Out Amount: ${formatNumber(Number(orderResponse.outAmount))}`);
  console.log(`   Swap Type: ${orderResponse.swapType}`);
  console.log(`   Slippage: ${orderResponse.slippageBps} bps`);

  const ultraTransaction = VersionedTransaction.deserialize(
    Buffer.from(orderResponse.transaction, 'base64'),
  );

  console.log(chalk.blue('🔧 Extracting instructions from Ultra transaction...'));
  const ultraInstructions = await extractInstructionsFromTransaction(
    ultraTransaction,
    connection,
  );
  console.log(`   Found ${ultraInstructions.length} instructions`);

  const swapInstructions = ultraInstructions.filter(
    (ix) =>
      !ix.programId.equals(ComputeBudgetProgram.programId),
  );
  console.log(`   ${swapInstructions.length} swap instructions (excluding compute budget)`);

  console.log(chalk.blue('🔐 Wrapping instructions with Swig signing...'));
  const signIxs = await getSignInstructions(swig, rootRole.id, swapInstructions);

  const lookupTableAddresses = ultraTransaction.message.addressTableLookups.map(
    (lookup) => lookup.accountKey,
  );

  const lookupTables = await Promise.all(
    lookupTableAddresses.map(async (addr) => {
      const res = await connection.getAddressLookupTable(addr);
      return res.value!;
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const computeIxs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100 }),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: rootUser.publicKey,
    recentBlockhash: blockhash,
    instructions: [...computeIxs, ...signIxs],
  }).compileToV0Message(lookupTables.length > 0 ? lookupTables : undefined);

  const tx = new VersionedTransaction(messageV0);
  tx.sign([rootUser]);

  console.log(chalk.blue('📤 Sending transaction...'));
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: true,
    preflightCommitment: 'confirmed',
  });

  console.log(chalk.gray(`   Signature: ${signature}`));

  const result = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  if (result.value.err) {
    console.error(chalk.red('❌ Transaction failed:'), result.value.err);
    process.exit(1);
  }

  console.log(chalk.green('🎉 Ultra swap successful!'));
  console.log(chalk.gray(`   https://solscan.io/tx/${signature}`));
}
