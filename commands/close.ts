import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';
import { findSwigAccounts } from '../utils/lookup';
import { fetchSwig, getSignInstructions, getSwigWalletAddress } from '@swig-wallet/classic';

async function closeSwigAccount(connection: Connection, user: Keypair, swigAccountAddress: string) {
  const swig = await fetchSwig(connection, new PublicKey(swigAccountAddress));
  const swigWalletAddress = await getSwigWalletAddress(swig);
  const balance = await connection.getBalance(swigWalletAddress);

  if (balance === 0) {
    console.log(chalk.yellow('Account has no balance. It might already be closed.'));
    return;
  }

  const transferIx = SystemProgram.transfer({
    fromPubkey: swigWalletAddress,
    toPubkey: user.publicKey,
    lamports: balance,
  });

  const instructions = await getSignInstructions(
    swig,
    0, // Assumes role 0 has authority
    [transferIx],
  );

  const transaction = new Transaction().add(...instructions);

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    user,
  ]);
  console.log(
    chalk.green('✓ Swig account closed at:'),
    chalk.cyan(swigAccountAddress),
  );
  console.log(chalk.blue('Transaction signature:'), chalk.cyan(signature));
}

export async function close(swigAccountAddress: string) {
  const user = getUser();
  const connection = getConnection();

  console.log(chalk.yellow(`Closing swig account ${swigAccountAddress}...`));

  await closeSwigAccount(connection, user, swigAccountAddress);
}

export async function closeAll() {
  const user = getUser();
  const connection = getConnection();

  console.log(chalk.yellow('Closing all swig accounts for the current user...'));

  const swigEnvelopes = await findSwigAccounts(connection, user.publicKey);

  if (swigEnvelopes.length === 0) {
    console.log(chalk.red('No swig accounts found for the user.'));
    return;
  }

  for (const swigEnvelope of swigEnvelopes) {
    await closeSwigAccount(connection, user, swigEnvelope[0].toBase58());
  }
}