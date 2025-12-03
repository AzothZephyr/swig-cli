import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';
import { findSwigAccounts } from '../utils/lookup';
import { fetchSwig, getSwigWalletAddress } from '@swig-wallet/classic';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export async function list() {
  const user = getUser();
  const connection = getConnection();

  const existingAccounts = await findSwigAccounts(connection, user.publicKey);

  if (existingAccounts.length > 0) {
    console.log(
      chalk.green(`${existingAccounts.length} Swig account(s) found.`),
    );

    const accountData = await Promise.all(
      existingAccounts.map(async ([pubkey]) => {
        const swig = await fetchSwig(connection, pubkey);
        const walletAddress = await getSwigWalletAddress(swig);
        const balance = await connection.getBalance(walletAddress);
        return {
          'Swig Account': pubkey.toBase58(),
          'Derived Wallet': walletAddress.toBase58(),
          'Balance (SOL)': balance / LAMPORTS_PER_SOL,
        };
      }),
    );

    console.table(accountData);
    return;
  }

  console.log(chalk.yellow('No Swig accounts found for this user.'));
}