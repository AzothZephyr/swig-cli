import { getConnection, getUser } from '../utils/common';
import {
  fetchSwig,
  getSignInstructions,
  getSwigWalletAddress,
} from '@swig-wallet/classic';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import chalk from 'chalk';

export async function transfer(
  recipientAddress: string,
  amount: string,
  swigAccountAddress: string,
) {
  const user = getUser();
  const connection = getConnection();
  const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;

  console.log(
    chalk.blue('Using specified Swig account:'),
    chalk.cyan(swigAccountAddress),
  );
  const swig = await fetchSwig(connection, new PublicKey(swigAccountAddress));
  const swigWalletAddress = await getSwigWalletAddress(swig);
  const balance = await connection.getBalance(swigWalletAddress);

  console.log(
    chalk.blue('Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );
  console.log(chalk.blue('Swig wallet balance:'), chalk.cyan(balance));

  if (balance < lamports) {
    console.log(
      chalk.red(
        `Insufficient balance. Wallet has ${balance} lamports, but ${lamports} are required.`,
      ),
    );
    return;
  }

  const recipient = new PublicKey(recipientAddress);

  const transferIx = SystemProgram.transfer({
    fromPubkey: swigWalletAddress,
    toPubkey: recipient,
    lamports,
  });

  const role = swig.findRolesByEd25519SignerPk(user.publicKey)[0];
  if (!role) {
    throw new Error(
      `User ${user.publicKey.toBase58()} does not have a role on this Swig account.`,
    );
  }

  const signIxs = await getSignInstructions(swig, role.id, [transferIx], false, {
    payer: user.publicKey,
  });

  const tx = new Transaction().add(...signIxs);

  const signature = await sendAndConfirmTransaction(connection, tx, [user]);

  console.log(
    chalk.green('✓ Transfer successful!'),
    chalk.blue('Signature:'),
    chalk.cyan(signature),
  );
}