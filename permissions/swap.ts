import { PublicKey } from '@solana/web3.js';

import {
  Actions,
  createEd25519AuthorityInfo,
  fetchSwig,
  getAddAuthorityInstructions,
  getSwigWalletAddress,
} from '@swig-wallet/classic';

import chalk from 'chalk';
import { getConnection, getUser, sendTransaction } from '../utils/common';

export async function givePermissionSwap(swigAccountAddressStr: string) {
  const rootUser = getUser();
  const JUPITER_V6_PROGRAM_ID = new PublicKey(
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tYevGfVAN68WCRx',
  );

  const connection = getConnection();

  const swigAccountAddress = new PublicKey(swigAccountAddressStr);
  const swig = await fetchSwig(connection, swigAccountAddress);

  const rootRole = swig.findRolesByEd25519SignerPk(rootUser.publicKey)[0];
  if (!rootRole) {
    console.error(
      chalk.red('❌ Root user does not have authority over this Swig account'),
    );
    process.exit(1);
  }

  const swigWalletAddress = await getSwigWalletAddress(swig);
  console.log(
    chalk.green('👤 Derived Swig wallet address:'),
    chalk.cyan(swigWalletAddress.toBase58()),
  );

  const actions = Actions.set()
    .programLimit({
      programId: JUPITER_V6_PROGRAM_ID.toBytes(),
    })
    .get();


  const addAuthorityIxs = await getAddAuthorityInstructions(
    swig,
    rootRole.id,
    createEd25519AuthorityInfo(swigWalletAddress),
    actions,
  );

  await sendTransaction(connection, addAuthorityIxs, rootUser);

  console.log(
    chalk.green('✓ Successfully gave swap permission to swig wallet on swig account:'),
    chalk.cyan(swigAccountAddress.toBase58()),
  );
}