import {
  Actions,
  createEd25519AuthorityInfo,
  findSwigPda,
  getCreateSwigInstruction,
  getSwigWalletAddress,
  fetchSwig,
} from '@swig-wallet/classic';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';
import { findSwigAccounts } from '../utils/lookup';

async function createSwigAccount(connection: Connection, user: Keypair) {
  const id = new Uint8Array(32);
  crypto.getRandomValues(id); // random 32-byte id
  const swigAccountAddress = findSwigPda(id);

  const rootAuthorityInfo = createEd25519AuthorityInfo(user.publicKey);
  
  // set to full open permissions on all actions
  const rootActions = Actions.set().all().get();

  const createSwigIx = await getCreateSwigInstruction({
    payer: user.publicKey,
    id,
    actions: rootActions,
    authorityInfo: rootAuthorityInfo,
  });

  const transaction = new Transaction().add(createSwigIx);
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    user,
  ]);

  console.log(
    chalk.green('✓ Swig account created at:'),
    chalk.cyan(swigAccountAddress.toBase58()),
  );
  console.log(chalk.blue('Transaction signature:'), chalk.cyan(signature));

  const swig = await fetchSwig(connection, swigAccountAddress);
  const swigWalletAddress = await getSwigWalletAddress(swig);

  console.log(
    chalk.green('📦 Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  return { swigAccountAddress, id };
}

export async function create() {
  const user = getUser();
  const connection = getConnection();

  console.log(chalk.yellow('Creating a new Swig account...'));
  await createSwigAccount(connection, user);
}