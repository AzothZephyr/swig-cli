import { Connection, PublicKey } from '@solana/web3.js';
import { SWIG_PROGRAM_ADDRESS, Swig, fetchSwig } from '@swig-wallet/classic';

export async function findSwigAccounts(
  connection: Connection,
  user: PublicKey,
): Promise<[PublicKey, Swig][]> {
  const accounts = await connection.getProgramAccounts(SWIG_PROGRAM_ADDRESS);
  const swigAccounts: [PublicKey, Swig][] = [];

  for (const account of accounts) {
    try {
      const swig = await fetchSwig(connection, account.pubkey);
      if (swig.findRolesByEd25519SignerPk(user).length > 0) {
        swigAccounts.push([account.pubkey, swig]);
      }
    } catch (e) {
      // ignore accounts that can't be decoded
    }
  }

  return swigAccounts;
}