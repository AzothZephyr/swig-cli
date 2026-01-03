# Swig CLI

This is a command-line interface for interacting with a Swig wallet. It's intention is to be rudimentary and demonstrate how to do things over to be a usable client for anything.

## Setup

First, navigate to this directory and install the dependencies:

```bash
bun install
```

## Usage

### Create

To create a new Swig account:

```bash
bun create
```

This will create a new Swig account and log its address.

### List

To list all Swig accounts for the current user:

```bash
bun list
```

### Transfer

To transfer SOL from your Swig wallet to another address, use the `transfer` command:

```bash
bun transfer <RECIPIENT_ADDRESS> <AMOUNT> <SWIG_ACCOUNT_ADDRESS>
```

- `<RECIPIENT_ADDRESS>`: The Solana address of the recipient.
- `<AMOUNT>`: The amount of SOL to transfer.
- `<SWIG_ACCOUNT_ADDRESS>`: The specific Swig account to use.

### Transfer SPL Tokens

To transfer SPL tokens from your Swig wallet to another address, use the `transfer-spl` command:

```bash
bun transfer-spl <RECIPIENT_ADDRESS> <MINT_ADDRESS> <AMOUNT> <SWIG_ACCOUNT_ADDRESS>
```

- `<RECIPIENT_ADDRESS>`: The Solana address of the recipient.
- `<MINT_ADDRESS>`: The mint address of the SPL token.
- `<AMOUNT>`: The amount of tokens to transfer (in the smallest unit of the token).
- `<SWIG_ACCOUNT_ADDRESS>`: The specific Swig account to use.

### Swap (Jupiter Metis)

To swap tokens using Jupiter Metis, use the `swap` command:

```bash
bun swap <AMOUNT> <SWIG_ACCOUNT_ADDRESS> [FROM_TOKEN] [TO_TOKEN]
```

- `<AMOUNT>`: The amount of tokens to swap.
- `<SWIG_ACCOUNT_ADDRESS>`: The specific Swig account to use.
- `[FROM_TOKEN]`: The token to swap from (defaults to `sol`).
- `[TO_TOKEN]`: The token to swap to (defaults to `usdc`).

### Swap (Titan)

To swap tokens using Titan Exchange, use the `titan` command:

```bash
npx tsx program.ts titan <AMOUNT> <SWIG_ACCOUNT_ADDRESS> [FROM_TOKEN] [TO_TOKEN]
```

**Note:** The titan command must be run with `npx tsx` instead of `bun` due to websocket compatibility issues between the Titan SDK and Bun's runtime.

- `<AMOUNT>`: The amount of tokens to swap.
- `<SWIG_ACCOUNT_ADDRESS>`: The specific Swig account to use.
- `[FROM_TOKEN]`: The token to swap from (defaults to `sol`).
- `[TO_TOKEN]`: The token to swap to (defaults to `usdc`).

### Breeze (Lending)

To interact with Breeze lending aggregator:

```bash
# View balances
bun run program.ts breeze balances <SWIG_ACCOUNT_ADDRESS>

# View yield positions
bun run program.ts breeze yield <SWIG_ACCOUNT_ADDRESS>

# Deposit into a fund
bun run program.ts breeze deposit <AMOUNT> <SWIG_ACCOUNT_ADDRESS> [FUND_ID]

# Withdraw from a fund
bun run program.ts breeze withdraw <AMOUNT> <SWIG_ACCOUNT_ADDRESS> [FUND_ID]
```

### Close

To close a Swig account and reclaim the rent, use the `close` command:

```bash
bun close <SWIG_ACCOUNT_ADDRESS>
```

- `<SWIG_ACCOUNT_ADDRESS>`: The Swig account to close.

### Close All

To close all Swig accounts for the current user:

```bash
bun close-all
```

### Give Permission

To grant swap permissions to a Swig account:

```bash
bun give-permission swap <SWIG_ACCOUNT_ADDRESS>
```

- `<SWIG_ACCOUNT_ADDRESS>`: The Swig account to grant permission to.
