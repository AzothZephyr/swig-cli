import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import chalk from 'chalk';
import { getConnection, getUser } from '../utils/common';
import {
  Actions,
  createEd25519AuthorityInfo,
  fetchSwig,
  getAddAuthorityInstructions,
  getCreateSubAccountInstructions,
  findSwigSubAccountPda,
} from '@swig-wallet/classic';

export async function createSubAccount(swigAccountAddress: string) {
  const user = getUser();
  const connection = getConnection();

  console.log(
    chalk.yellow(
      `Creating a new subaccount for Swig account: ${swigAccountAddress}...`,
    ),
  );

  let swig = await fetchSwig(connection, new PublicKey(swigAccountAddress));

  const managerRole = swig.findRolesByEd25519SignerPk(user.publicKey)[0];
  if (!managerRole) {
    throw new Error(
      `User ${user.publicKey.toBase58()} does not have a role on this Swig account to manage authorities.`,
    );
  }

  console.log(chalk.blue('Adding a new role for the subaccount...'));

  const newRoleActions = Actions.set().all().get();

  const addAuthorityIxs = await getAddAuthorityInstructions(
    swig,
    managerRole.id,
    createEd25519AuthorityInfo(user.publicKey),
    newRoleActions,
  );

  const addAuthorityTx = new Transaction().add(...addAuthorityIxs);
  const addAuthSignature = await sendAndConfirmTransaction(connection, addAuthorityTx, [user]);
  console.log(chalk.blue('New role added, signature:'), chalk.cyan(addAuthSignature));

  console.log(chalk.blue('Refetching Swig account state...'));
  const existingRoles = swig.findRolesByEd25519SignerPk(user.publicKey);
  swig = await swig.refetch();

  const allUserRoles = swig.findRolesByEd25519SignerPk(user.publicKey);
  const newRole = allUserRoles.find(role => !existingRoles.find(r => r.id === role.id));

  if (!newRole) {
    throw new Error('Could not find the newly created role.');
  }
  
  console.log(chalk.blue(`Using newly created role ID: ${newRole.id}`));

  const createSubAccountIxs = await getCreateSubAccountInstructions(
    swig,
    newRole.id,
  );

  const transaction = new Transaction().add(...createSubAccountIxs);
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    user,
  ]);

  const subAccountAddress = findSwigSubAccountPda(
    newRole.swigId,
    newRole.id,
  );

  console.log(
    chalk.green('✓ Subaccount created at:'),
    chalk.cyan(subAccountAddress.toBase58()),
  );
  console.log(chalk.blue('Transaction signature:'), chalk.cyan(signature));
}