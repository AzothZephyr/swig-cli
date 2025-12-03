import { PublicKey } from '@solana/web3.js';
import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';
import {
  fetchSwig,
  findSwigSubAccountPda,
} from '@swig-wallet/classic';

export async function listSubAccounts(swigAccountAddress: string) {
  const user = getUser();
  const connection = getConnection();

  console.log(
    chalk.yellow(
      `Listing subaccounts for Swig account: ${swigAccountAddress}...`,
    ),
  );

  const swig = await fetchSwig(connection, new PublicKey(swigAccountAddress));

  const roles = swig.findRolesByEd25519SignerPk(user.publicKey);
  if (roles.length === 0) {
    console.log(
      chalk.red(
        `User ${user.publicKey.toBase58()} does not have any roles on this Swig account.`,
      ),
    );
    return;
  }

  const existingSubAccounts = [];

  for (const role of roles) {
    const subAccountAddress = findSwigSubAccountPda(role.swigId, role.id);
    const accountInfo = await connection.getAccountInfo(subAccountAddress);
    if (accountInfo) {
      existingSubAccounts.push({
        'Role ID': role.id,
        'Subaccount Address': subAccountAddress.toBase58(),
      });
    }
  }

  if (existingSubAccounts.length === 0) {
    console.log(chalk.yellow('No subaccounts found for this user on this Swig account.'));
    return;
  }

  console.log(
    chalk.green(
      `Found ${existingSubAccounts.length} subaccount(s) for this user:`,
    ),
  );
  console.table(existingSubAccounts);
}