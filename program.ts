import { Command } from 'commander';
import { create } from './commands/create';
import { createSubAccount } from './commands/create-subaccount';
import { close } from './commands/close';
import { list } from './commands/list';
import { listSubAccounts } from './commands/list-subaccounts';
import { transfer } from './commands/transfer';
import { transferSpl } from './commands/transfer-spl';
import { swap } from './commands/swap';
import { ultra } from './commands/ultra';
import { breezeDeposit, breezeWithdraw, breezeBalances, breezeYield } from './commands/breeze';
import { titanSwap } from './commands/titan';
import { givePermissionSwap } from './permissions/swap';

const program = new Command();

program
  .command('create')
  .description('Create a new swig account')
  .action(create);
program
  .command('create-subaccount')
  .description('Create a new subaccount for a swig account')
  .argument('<swig_account_address>', 'The swig account to create a subaccount for')
  .action(createSubAccount);
program
  .command('list')
  .description('List all swig accounts for the current user')
  .action(list);
program
  .command('list-subaccounts')
  .description('List all subaccounts for a given swig account')
  .argument('<swig_account_address>', 'The swig account to list subaccounts for')
  .action(listSubAccounts);
program
  .command('close')
  .description('Close a swig account and reclaim rent')
  .argument('<swig_account_address>', 'The swig account to close')
  .action(close);

program
  .command('close-all')
  .description('Close all swig accounts for the current user')
  .action(async () => {
    const { closeAll } = await import('./commands/close');
    await closeAll();
  });

program
  .command('transfer')
  .description(
    'Transfer funds from the swig account to another solana account',
  )
  .argument('<recipient_address>', 'The address of the recipient')
  .argument('<amount>', 'The amount of SOL to transfer')
  .argument('<swig_account_address>', 'The swig account to use')
  .action(transfer);
program
  .command('transfer-spl')
  .description('Transfer SPL tokens from the swig account')
  .argument('<recipient_address>', 'The address of the recipient')
  .argument('<mint_address>', 'The mint address of the SPL token')
  .argument('<amount>', 'The amount of tokens to transfer')
  .argument('<swig_account_address>', 'The swig account to use')
  .action(transferSpl);

program
  .command('swap')
  .description('Swap tokens using jupiter metis')
  .argument('<amount>', 'The amount of tokens to swap')
  .argument('<swig_account_address>', 'The swig account to use')
  .argument('[from]', 'The token to swap from', 'sol')
  .argument('[to]', 'The token to swap to', 'usdc')
  .action(swap);

program
  .command('ultra')
  .description('Swap tokens using jupiter ultra')
  .argument('<amount>', 'The amount of tokens to swap')
  .argument('<swig_account_address>', 'The swig account to use')
  .argument('[from]', 'The token to swap from', 'sol')
  .argument('[to]', 'The token to swap to', 'usdc')
  .action(ultra);

program
  .command('titan')
  .description('Swap tokens using titan exchange')
  .argument('<amount>', 'The amount of tokens to swap')
  .argument('<swig_account_address>', 'The swig account to use')
  .argument('[from]', 'The token to swap from', 'sol')
  .argument('[to]', 'The token to swap to', 'usdc')
  .action(titanSwap);

const breeze = program
  .command('breeze')
  .description('Breeze lending aggregator commands');

breeze
  .command('deposit')
  .description('Deposit into a Breeze fund')
  .argument('<amount>', 'The amount to deposit')
  .argument('<swig_account_address>', 'The swig account to use')
  .argument('[fund_id]', 'The fund ID to deposit into (optional)')
  .action(breezeDeposit);

breeze
  .command('withdraw')
  .description('Withdraw from a Breeze fund')
  .argument('<amount>', 'The amount to withdraw')
  .argument('<swig_account_address>', 'The swig account to use')
  .argument('[fund_id]', 'The fund ID to withdraw from (optional)')
  .action(breezeWithdraw);

breeze
  .command('balances')
  .description('View Breeze balances for a Swig account')
  .argument('<swig_account_address>', 'The swig account to check')
  .action(breezeBalances);

breeze
  .command('yield')
  .description('View yield positions for a Swig account')
  .argument('<swig_account_address>', 'The swig account to check')
  .action(breezeYield);

const givePermission = program
  .command('give-permission')
  .description('Give permission to a swig account');

givePermission
  .command('swap')
  .description('Give permission to swap')
  .argument('<swig_account_address>', 'The swig account to use')
  .action(givePermissionSwap);

program.parse(process.argv);