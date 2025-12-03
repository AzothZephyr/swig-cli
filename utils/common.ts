import 'dotenv/config';
import { Connection, Keypair } from '@solana/web3.js';
import { Transaction, TransactionInstruction } from '@solana/web3.js';

export function getUser(): Keypair {
  return Keypair.fromSecretKey(
    new Uint8Array(
      require('../id.json'),
    ),
  );
}

export function getConnection(): Connection {
  if (!process.env.RPC_URL) {
    throw new Error('RPC_URL is not set in the .env file');
  }
  return new Connection(process.env.RPC_URL, 'confirmed');
}

export async function sendTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: Keypair,
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig);
  return sig;
}