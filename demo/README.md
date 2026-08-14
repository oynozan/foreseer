# Foreseer demo casino

A small casino built the way a customer would build one: it talks to a
running Foreseer server over HTTP with an operator API key, verifies every
receipt with `foreseer-sdk` before trusting it, and pays for plays by
topping up its wallet balance with real chain transfers to the Foreseer
treasury. Nothing is mocked: every epoch, bet, and payment is real.

## What is in here

- `server.mjs`: the casino backend. Registers roulette rules, forwards spins
  to Foreseer `/play`, rejects any receipt whose TEE signature does not
  verify, proxies `/verify`, serves the frontend.
- `static/`: the p5.js roulette. European wheel, red/black and straight
  bets, a regeneratable client seed, per-spin receipts with a Verify button.
- `setup.mjs`: provisions the operator (admin API) with a fresh owner
  wallet and writes `.env`.
- `topup.mjs`: sends real C2FLR from the owner wallet to the treasury and
  submits the tx hash to `POST /billing/topup`.
- `smoke.mjs`: end to end proof. Boots a fresh Foreseer server, provisions,
  pays the treasury onchain, spins three bets, closes the epoch, checks
  allGreen verification, then logs in with the wallet signature and reads
  the owner dashboard data.

## Run it

Start Foreseer with a treasury (payments land here):

```sh
cd ../server
FORESEER_TREASURY=0x... FORESEER_PRICE_PER_PLAY_WEI=10000000000000000 pnpm start
```

Then in `demo/`:

```sh
pnpm install --ignore-workspace
node setup.mjs        # creates operator + owner wallet, writes .env
node topup.mjs 1      # real chain payment, credits balance
node server.mjs       # casino on http://localhost:8788
```

Fund the generated wallet first (Coston2 faucet, or set `FUNDER_KEY` in
`.env` before `setup.mjs` to auto-fund it).

## Smoke test

`node smoke.mjs` needs `FUNDER_KEY` in `.env` and spends about 0.2 C2FLR
plus gas per run (it makes real transactions on purpose).

## The trust story

The casino never learns the server seed during an epoch. The player picks
the client seed in the browser and can regenerate it at will, so neither
side controls the outcome alone. After the epoch closes, the Verify button
recomputes all four offline checks against the revealed seed.
