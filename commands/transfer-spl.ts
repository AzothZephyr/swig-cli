import { getConnection, getUser } from '../utils/common';
import {
  fetchSwig,
  getSignInstructions,
  getSwigWalletAddress,
} from '@swig-wallet/classic';
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import chalk from 'chalk';

export async function transferSpl(
  recipientAddress: string,
  mintAddress: string,
  amount: string,
  swigAccountAddress: string,
) {
  const user = getUser();
  const connection = getConnection();
  const mint = new PublicKey(mintAddress);
  const recipient = new PublicKey(recipientAddress);
  const instructions: TransactionInstruction[] = [];

  console.log(
    chalk.blue('Using specified Swig account:'),
    chalk.cyan(swigAccountAddress),
  );
  const swig = await fetchSwig(connection, new PublicKey(swigAccountAddress));
  const swigWalletAddress = await getSwigWalletAddress(swig);

  console.log(
    chalk.blue('Derived Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  const sourceTokenAccount = await getAssociatedTokenAddress(
    mint,
    swigWalletAddress,
    true, // allowOwnerOffCurve
  );

  try {
    const sourceTokenAccountInfo = await getAccount(
      connection,
      sourceTokenAccount,
    );
    const balance = sourceTokenAccountInfo.amount;
    console.log(
      chalk.blue('Source token balance:'),
      chalk.cyan(balance.toString()),
    );
    if (balance < BigInt(amount)) {
      console.log(
        chalk.red(
          `Insufficient token balance. Wallet has ${balance}, but ${amount} are required.`,
        ),
      );
      return;
    }
  } catch (e) {
    console.log(
      chalk.red(
        'Source token account not found or is empty. The Swig wallet does not have an account for this SPL token or it has a zero balance.',
      ),
    );
    return;
  }

  const destinationTokenAccount = await getAssociatedTokenAddress(
    mint,
    recipient,
  );

  const destinationAccountInfo = await connection.getAccountInfo(
    destinationTokenAccount,
  );

  if (!destinationAccountInfo) {
    console.log(
      chalk.yellow(
        'Destination token account not found. Creating it...',
      ),
    );
    const createAtaIx = createAssociatedTokenAccountInstruction(
      user.publicKey,
      destinationTokenAccount,
      recipient,
      mint,
    );
    instructions.push(createAtaIx);
  }

  const transferIx = createTransferInstruction(
    sourceTokenAccount,
    destinationTokenAccount,
    swigWalletAddress,
    BigInt(amount),
  );
  instructions.push(transferIx);

  const role = swig.findRolesByEd25519SignerPk(user.publicKey)[0];
  if (!role) {
    throw new Error(
      `User ${user.publicKey.toBase58()} does not have a role on this Swig account.`,
    );
  }

  const signIxs = await getSignInstructions(swig, role.id, instructions, false, {
    payer: user.publicKey,
  });

  const tx = new Transaction().add(...signIxs);

  const signature = await sendAndConfirmTransaction(connection, tx, [user]);

  console.log(
    chalk.green('✓ SPL Transfer successful!'),
    chalk.blue('Signature:'),
    chalk.cyan(signature),
  );
}