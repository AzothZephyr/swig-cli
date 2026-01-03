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

const BREEZE_API_URL = 'https://api.breeze.baby';

function formatNumber(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function getBreezeApiKey(): string {
  const apiKey = process.env.BREEZE_API_KEY;
  if (!apiKey) {
    throw new Error('BREEZE_API_KEY is not set in the .env file');
  }
  return apiKey;
}

function toTransactionInstructionFromApi(instruction: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(new Uint8Array(instruction.program_id)),
    keys: instruction.accounts.map((k: any) => ({
      pubkey: new PublicKey(new Uint8Array(k.pubkey)),
      isSigner: k.is_signer,
      isWritable: k.is_writable,
    })),
    data: Buffer.from(new Uint8Array(instruction.data)),
  });
}

interface BreezeDepositParams {
  user_key: string;
  payer_key?: string;
  amount?: number;
  fund_id?: string;
  all?: boolean;
}

interface BreezeWithdrawParams {
  user_key: string;
  payer_key?: string;
  amount?: number;
  fund_id?: string;
  all?: boolean;
}

async function getDepositInstructions(params: BreezeDepositParams): Promise<{
  lookup_table?: string;
  deposit_instructions: any[];
}> {
  const apiKey = getBreezeApiKey();
  const response = await fetch(`${BREEZE_API_URL}/deposit/ix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Breeze API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function getWithdrawInstructions(params: BreezeWithdrawParams): Promise<{
  lookup_table?: string;
  withdraw_instructions: any[];
}> {
  const apiKey = getBreezeApiKey();
  const response = await fetch(`${BREEZE_API_URL}/withdraw/ix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Breeze API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function getUserBalances(userId: string): Promise<any> {
  const apiKey = getBreezeApiKey();
  const response = await fetch(`${BREEZE_API_URL}/user-balances/${userId}`, {
    headers: {
      'x-api-key': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Breeze API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function getUserYield(userId: string): Promise<any> {
  const apiKey = getBreezeApiKey();
  const response = await fetch(`${BREEZE_API_URL}/user-yield/${userId}`, {
    headers: {
      'x-api-key': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Breeze API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export async function breezeDeposit(
  amount: string,
  swigAccountAddressStr: string,
  fundId?: string,
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

  const amountNumber = parseFloat(amount);

  console.log(chalk.blue('📊 Requesting deposit instructions...'));
  if (fundId) {
    console.log(`   Fund ID: ${fundId}`);
  }
  console.log(`   Amount: ${amount}`);

  const depositIxResponse = await getDepositInstructions({
    user_key: swigWalletAddress.toBase58(),
    payer_key: rootUser.publicKey.toBase58(),
    amount: amountNumber,
    fund_id: fundId,
  });

  const depositInstructions = depositIxResponse.deposit_instructions;
  if (!depositInstructions || depositInstructions.length === 0) {
    console.error(chalk.red('❌ No deposit instructions returned'));
    process.exit(1);
  }

  console.log(chalk.green(`✓ Received ${depositInstructions.length} instruction(s)`));

  const instructions: TransactionInstruction[] = depositInstructions.map(
    toTransactionInstructionFromApi,
  );

  console.log(chalk.blue('🔐 Wrapping instructions with Swig signing...'));
  const signIxs = await getSignInstructions(swig, rootRole.id, instructions);

  // Handle lookup table if provided
  let lookupTables: any[] = [];
  if (depositIxResponse.lookup_table) {
    const lutAddress = new PublicKey(depositIxResponse.lookup_table);
    const res = await connection.getAddressLookupTable(lutAddress);
    if (res.value) {
      lookupTables = [res.value];
    }
  }

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

  console.log(chalk.green('🎉 Deposit successful!'));
  console.log(chalk.gray(`   https://solscan.io/tx/${signature}`));
}

export async function breezeWithdraw(
  amount: string,
  swigAccountAddressStr: string,
  fundId?: string,
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

  const amountNumber = parseFloat(amount);

  console.log(chalk.blue('📊 Requesting withdraw instructions...'));
  if (fundId) {
    console.log(`   Fund ID: ${fundId}`);
  }
  console.log(`   Amount: ${amount}`);

  const withdrawIxResponse = await getWithdrawInstructions({
    user_key: swigWalletAddress.toBase58(),
    payer_key: rootUser.publicKey.toBase58(),
    amount: amountNumber,
    fund_id: fundId,
  });

  const withdrawInstructions = withdrawIxResponse.withdraw_instructions;
  if (!withdrawInstructions || withdrawInstructions.length === 0) {
    console.error(chalk.red('❌ No withdraw instructions returned'));
    process.exit(1);
  }

  console.log(chalk.green(`✓ Received ${withdrawInstructions.length} instruction(s)`));

  const instructions: TransactionInstruction[] = withdrawInstructions.map(
    toTransactionInstructionFromApi,
  );

  console.log(chalk.blue('🔐 Wrapping instructions with Swig signing...'));
  const signIxs = await getSignInstructions(swig, rootRole.id, instructions);

  // Handle lookup table if provided
  let lookupTables: any[] = [];
  if (withdrawIxResponse.lookup_table) {
    const lutAddress = new PublicKey(withdrawIxResponse.lookup_table);
    const res = await connection.getAddressLookupTable(lutAddress);
    if (res.value) {
      lookupTables = [res.value];
    }
  }

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

  console.log(chalk.green('🎉 Withdraw successful!'));
  console.log(chalk.gray(`   https://solscan.io/tx/${signature}`));
}

export async function breezeBalances(swigAccountAddressStr: string) {
  const connection = getConnection();

  console.log(chalk.cyan(`🌐 Connected to Solana RPC`));

  const swigAccountAddress = new PublicKey(swigAccountAddressStr);
  const swig: Swig = await fetchSwig(connection, swigAccountAddress);
  const swigWalletAddress = await getSwigWalletAddress(swig);

  console.log(
    chalk.green('✓ Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  console.log(chalk.blue('📊 Fetching balances...'));
  const balances = await getUserBalances(swigWalletAddress.toBase58());

  console.log(chalk.green('✓ Balances:'));
  if (balances.data && balances.data.length > 0) {
    for (const balance of balances.data) {
      const amount = balance.total_balance / Math.pow(10, balance.decimals);
      console.log(`   ${balance.token_symbol}: ${formatNumber(amount)}`);
      if (balance.yield_balance) {
        console.log(chalk.gray(`     Yield: ${balance.yield_balance.amount_of_yield} (APY: ${balance.yield_balance.fund_apy?.toFixed(2)}%)`));
      }
    }
  } else {
    console.log(chalk.gray('   No balances found'));
  }
}

export async function breezeYield(swigAccountAddressStr: string) {
  const connection = getConnection();

  console.log(chalk.cyan(`🌐 Connected to Solana RPC`));

  const swigAccountAddress = new PublicKey(swigAccountAddressStr);
  const swig: Swig = await fetchSwig(connection, swigAccountAddress);
  const swigWalletAddress = await getSwigWalletAddress(swig);

  console.log(
    chalk.green('✓ Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  console.log(chalk.blue('📊 Fetching yield data...'));
  const yieldData = await getUserYield(swigWalletAddress.toBase58());

  console.log(chalk.green('✓ Yield positions:'));
  if (yieldData.data && yieldData.data.length > 0) {
    for (const position of yieldData.data) {
      console.log(`   Fund: ${position.fund_name || position.fund_id}`);
      console.log(`     Asset: ${position.base_asset}`);
      console.log(`     Position Value: ${formatNumber(position.position_value)}`);
      console.log(`     Yield Earned: ${formatNumber(position.yield_earned)}`);
      console.log(`     APY: ${position.apy?.toFixed(2)}%`);
      console.log('');
    }
  } else {
    console.log(chalk.gray('   No yield positions found'));
  }
}
