/**
 * titan swap command - swap tokens using titan exchange aggregator
 *
 * IMPORTANT: this command must be run with `npx tsx` instead of `bun`:
 *   npx tsx program.ts titan <amount> <swig_account> [from] [to]
 *
 * why: the titan SDK uses the `websocket` npm package which has compatibility
 * issues with bun's runtime. the websocket connection fails silently when run
 * with bun, but works correctly with node/tsx.
 */

import {
  ComputeBudgetProgram,
  Connection,
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

import { V1Client, types } from '@titanexchange/sdk-ts';
import bs58 from 'bs58';
import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';

const TITAN_WS_URL = process.env.TITAN_WS_URL || 'wss://us1.api.demo.titan.exchange/api/v1/ws';

function formatNumber(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function getTitanToken(): string {
  const token = process.env.TITAN_API_TOKEN;
  if (!token) {
    throw new Error('TITAN_API_TOKEN is not set in the .env file');
  }
  return token;
}

function toTransactionInstruction(ix: types.common.Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.p),
    keys: ix.a.map((acc) => ({
      pubkey: new PublicKey(acc.p),
      isSigner: acc.s,
      isWritable: acc.w,
    })),
    data: Buffer.from(ix.d),
  });
}

export async function titanSwap(
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
  const rawAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

  console.log(chalk.blue('📊 Connecting to Titan API...'));
  console.log(`   Input: ${amount} ${from.toUpperCase()}`);
  console.log(`   Output: ${to.toUpperCase()}`);

  const token = getTitanToken();
  const wsUrl = `${TITAN_WS_URL}?auth=${token}`;

  let client: V1Client;
  try {
    client = await V1Client.connect(wsUrl);
  } catch (err: any) {
    console.error(chalk.red('❌ Failed to connect to Titan API'));
    console.error(chalk.red(`   URL: ${TITAN_WS_URL}`));
    if (err.message) {
      console.error(chalk.red(`   Error: ${err.message}`));
    } else {
      console.error(chalk.red('   Error details:'), JSON.stringify(err, null, 2));
    }
    process.exit(1);
  }
  console.log(chalk.green('✓ Connected to Titan API'));

  try {
    const info = await client.getInfo();
    console.log(chalk.gray(`   Protocol version: ${info.protocolVersion.major}.${info.protocolVersion.minor}.${info.protocolVersion.patch}`));

    const swapParams: types.v1.SwapQuoteRequest = {
      swap: {
        inputMint: bs58.decode(inputMint),
        outputMint: bs58.decode(outputMint),
        amount: rawAmount,
        swapMode: types.common.SwapMode.ExactIn,
        slippageBps: 50,
      },
      transaction: {
        userPublicKey: swigWalletAddress.toBytes(),
        createOutputTokenAccount: true,
      },
      update: {
        num_quotes: 3,
      },
    };

    console.log(chalk.blue('📊 Requesting swap quotes...'));
    const { stream } = await client.newSwapQuoteStream(swapParams);

    let bestQuote: types.v1.SwapRoute | null = null;
    let bestProvider: string | null = null;
    let quoteCount = 0;

    for await (const quotes of stream) {
      quoteCount++;
      
      for (const [provider, route] of Object.entries(quotes.quotes)) {
        if (!bestQuote || route.outAmount > bestQuote.outAmount) {
          bestQuote = route;
          bestProvider = provider;
        }
      }

      console.log(chalk.gray(`   Received quote batch ${quoteCount}, providers: ${Object.keys(quotes.quotes).join(', ')}`));

      // Take best quote after first batch
      if (quoteCount >= 1 && bestQuote) {
        break;
      }
    }

    if (!bestQuote || !bestProvider) {
      console.error(chalk.red('❌ No quotes received'));
      await client.close();
      process.exit(1);
    }

    console.log(chalk.green('✓ Best quote from:'), chalk.cyan(bestProvider));
    console.log(`   In Amount: ${formatNumber(bestQuote.inAmount)}`);
    console.log(`   Out Amount: ${formatNumber(bestQuote.outAmount)}`);
    console.log(`   Slippage: ${bestQuote.slippageBps} bps`);

    if (!bestQuote.instructions || bestQuote.instructions.length === 0) {
      if (bestQuote.transaction) {
        console.error(chalk.red('❌ Quote returned a transaction instead of instructions - not compatible with Swig'));
        process.exit(1);
      }
      console.error(chalk.red('❌ No instructions in quote'));
      process.exit(1);
    }

    console.log(chalk.blue(`🔧 Processing ${bestQuote.instructions.length} instruction(s)...`));

    const swapInstructions: TransactionInstruction[] = bestQuote.instructions.map(
      toTransactionInstruction,
    );

    console.log(chalk.blue('🔐 Wrapping instructions with Swig signing...'));
    const signIxs = await getSignInstructions(swig, rootRole.id, swapInstructions);

    // Handle lookup tables
    let lookupTables: any[] = [];
    if (bestQuote.addressLookupTables && bestQuote.addressLookupTables.length > 0) {
      lookupTables = await Promise.all(
        bestQuote.addressLookupTables.map(async (lutBytes) => {
          const lutAddress = new PublicKey(lutBytes);
          const res = await connection.getAddressLookupTable(lutAddress);
          return res.value!;
        }),
      );
    }

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const computeUnits = bestQuote.computeUnitsSafe || bestQuote.computeUnits || 300_000;
    const computeIxs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
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

    console.log(chalk.green('🎉 Titan swap successful!'));
    console.log(chalk.gray(`   https://solscan.io/tx/${signature}`));
  } finally {
    await client.close();
  }
}
