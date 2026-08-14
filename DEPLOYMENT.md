# Deploying Foreseer on a VPS with nginx

Three public names, one box:

| Name | Serves | Local port |
| --- | --- | --- |
| `foreseer.net` | landing, `/verify`, `/dashboard`, and the API under `/api` | 3000, 8787 |
| `docs.foreseer.net` | the Nextra documentation | 3001 |
| `tee.foreseer.net` | the FCC extension proxy, the endpoint Flare providers post to | 6674 |

The API lives at `https://foreseer.net/api` so it shares an origin with the
dashboard and needs no CORS. If you prefer a separate name, add an A record
for `api.foreseer.net` and drop the `/api/` location block below.

Nothing but nginx listens on a public interface. Every service binds to
127.0.0.1.

## 1. DNS

Three A records pointing at the VPS address:

```
foreseer.net.        A    <vps-ip>
docs.foreseer.net.   A    <vps-ip>
tee.foreseer.net.    A    <vps-ip>
```

Wait for propagation before requesting certificates, or certbot fails.

## 2. Prepare the box

```sh
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo corepack enable && sudo corepack prepare pnpm@10.18.0 --activate
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 3. Get the code

```sh
sudo mkdir -p /srv && sudo chown $USER /srv
git clone --recurse-submodules https://github.com/oynozan/foreseer /srv/foreseer
cd /srv/foreseer
```

## 4. Server secrets

The signing key is the product's identity. Its address must equal the
`teeId` the deployed `ForeseerInstructionSender` was constructed with, or
every anchor reverts. Copy the key you already deployed with, do not mint a
new one.

```sh
cp server/.env.example server/.env
```

Fill in:

```sh
FORESEER_ADMIN_KEY=          # openssl rand -hex 24
FORESEER_TEE_KEY=            # the key whose address is the contract teeId
FORESEER_TREASURY=           # wallet that receives operator topups
FORESEER_PRICE_PER_PLAY_WEI=10000000000000000
FORESEER_EPOCH_SECONDS=300
FORESEER_CHAIN_RPC=https://coston2-api.flare.network/ext/C/rpc
FORESEER_READ_LIMIT=300
```

The server refuses to start on the published dev defaults, so a missing
value fails loudly instead of quietly signing with a public key.

## 5. Run the API

```sh
cd /srv/foreseer
set -a && . server/.env && set +a
docker compose -f server/docker-compose.yaml up -d --build
curl -s localhost:8787/health
```

Expect `{"ok":true,"teeId":"0x...","chainId":114,"treasury":"0x..."}` with
the teeId matching the contract. The compose file also runs an hourly
backup into a named volume.

Bind it to localhost only by adding `127.0.0.1:` to the published port in
`server/docker-compose.yaml`:

```yaml
ports:
  - "127.0.0.1:8787:8787"
```

## 6. Build and run the two sites

`NEXT_PUBLIC_FORESEER_API` is inlined at build time, so it must be set
before `pnpm build`, not at runtime.

```sh
cd /srv/foreseer/packages/ts && pnpm install --ignore-workspace --frozen-lockfile && pnpm build

cd /srv/foreseer/web
pnpm install --ignore-workspace --frozen-lockfile
NEXT_PUBLIC_FORESEER_API=https://foreseer.net/api pnpm build

cd /srv/foreseer/docs
pnpm install --ignore-workspace --frozen-lockfile
pnpm build
```

Two systemd units, both bound to loopback:

```ini
# /etc/systemd/system/foreseer-web.service
[Unit]
Description=Foreseer landing, verifier and dashboard
After=network.target

[Service]
WorkingDirectory=/srv/foreseer/web
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/pnpm start
Restart=always
User=%i

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/foreseer-docs.service
[Unit]
Description=Foreseer documentation
After=network.target

[Service]
WorkingDirectory=/srv/foreseer/docs
Environment=NODE_ENV=production PORT=3001 HOSTNAME=127.0.0.1
ExecStart=/usr/bin/pnpm start
Restart=always
User=%i

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now foreseer-web foreseer-docs
```

## 7. nginx

```nginx
# /etc/nginx/sites-available/foreseer.net
server {
    listen 80;
    server_name foreseer.net www.foreseer.net;

    location /api/ {
        proxy_pass http://127.0.0.1:8787/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`X-Forwarded-For` matters: the server rate limits uncredentialed reads per
client address and would otherwise see only nginx.

```nginx
# /etc/nginx/sites-available/docs.foreseer.net
server {
    listen 80;
    server_name docs.foreseer.net;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```nginx
# /etc/nginx/sites-available/tee.foreseer.net
server {
    listen 80;
    server_name tee.foreseer.net;

    # Flare providers post instructions here
    location / {
        proxy_pass http://127.0.0.1:6674;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/foreseer.net /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/docs.foreseer.net /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/tee.foreseer.net /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d foreseer.net -d www.foreseer.net -d docs.foreseer.net -d tee.foreseer.net
```

Certbot rewrites the blocks for TLS and installs a renewal timer.

## 8. The TEE machine

This is what turns checks 2 and 4 from interface into fact. Under hackathon
rules `SIMULATED_TEE=true` is accepted on Coston2, but the endpoint must be
a stable public HTTPS name, which is exactly what `tee.foreseer.net` now is.

You need Flare's indexer database credentials from the organizers.

```sh
cd /srv/foreseer/tee
cp config/proxy/extension_proxy.coston2.docker.toml.example config/proxy/extension_proxy.coston2.docker.toml
# fill the [db] block with the indexer host, name, user and password
```

Create `.env.coston2`:

```sh
CHAIN=coston2
CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc
ADDRESSES_FILE=./config/coston2/deployed-addresses.json
NORMAL_PROXY_URL=https://tee-proxy-coston2-1.flare.rocks
EXT_PROXY_URL=https://tee.foreseer.net
EXT_PROXY_EXTERNAL_BIND=127.0.0.1:6674
LOCAL_MODE=false
SIMULATED_TEE=true
LANGUAGE=go
DEPLOYMENT_PRIVATE_KEY=<funded coston2 key, no 0x>
PROXY_PRIVATE_KEY=<proxy signing key>
FORESEER_TEE_KEY=<same key as server/.env>
INITIAL_OWNER=0x<deployer address>
GOVERNANCE_SIGNERS=0x<governance address>
GOVERNANCE_THRESHOLD=1
```

```sh
bash ./scripts/use-chain.sh coston2
bash ./scripts/start-services.sh --chain coston2      # extension, proxy, redis
curl -s https://tee.foreseer.net/info | jq '.machineData'
bash ./scripts/post-build.sh                          # allow version, governance, register
bash ./scripts/test.sh
```

`/info` must report your `extensionId` and the `initialOwner` you set. Then
confirm the machine reached production:

```sh
cd tools && go run ./cmd/query-tee -ext 0x00000000000000000000000000000000000000000000000000000000000102c2 \
  -rpc https://coston2-api.flare.network/ext/C/rpc
```

Two traps from the platform, both silent:

- A restart mints a **new** teeId. Recovery is restart, re-register, reach
  production, then pause the stale identity. There is no restore.
- The URL is stored onchain. If it ever changes, providers keep posting to
  the old one.

## 9. Anchor epochs on a timer

Closed epochs are only provable once anchored. Run it every ten minutes:

```sh
# /etc/systemd/system/foreseer-anchor.service
[Unit]
Description=Anchor closed Foreseer epochs

[Service]
Type=oneshot
WorkingDirectory=/srv/foreseer/server
EnvironmentFile=/srv/foreseer/server/.env
Environment=FORESEER_SENDER=0x3f93049764efE9b33497Ffc3d0D92b5d262d1fE9
Environment=FORESEER_POSTER_KEY=<poster key with gas>
ExecStart=/usr/bin/node scripts/anchor.mjs
```

```ini
# /etc/systemd/system/foreseer-anchor.timer
[Unit]
Description=Anchor Foreseer epochs every ten minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
```

```sh
sudo systemctl enable --now foreseer-anchor.timer
```

The script refuses to run if the server key and the contract `teeId` ever
diverge, so a key mistake stops before it costs gas.

## 10. Prove it works

```sh
curl -s https://foreseer.net/api/health
curl -s https://docs.foreseer.net/ -o /dev/null -w '%{http_code}\n'
curl -s https://tee.foreseer.net/info -o /dev/null -w '%{http_code}\n'

# create an operator and play one real bet
ADMIN=$(grep ^FORESEER_ADMIN_KEY /srv/foreseer/server/.env | cut -d= -f2)
curl -s -X POST https://foreseer.net/api/admin/operators \
  -H "x-admin-key: $ADMIN" -H 'content-type: application/json' \
  -d '{"name":"first-operator","ownerWallet":"0x<their wallet>"}'
```

Then in a browser:

1. `https://foreseer.net` loads, demos spin.
2. `https://foreseer.net/verify?server=https://foreseer.net/api&epoch=1&bet=0`
   loads and checks itself with no clicks.
3. `https://foreseer.net/dashboard` connects a wallet and shows that
   operator's balance after a topup.
4. `epochs(<id>)` on the sender reads `anchored: true` after the timer runs.

## 11. Backups are not optional

The database holds every epoch's server seed. Lose it and every receipt in
flight becomes unverifiable, which is the one failure the product cannot
explain away. The compose stack already backs up hourly into the
`foreseer-backups` volume; copy that volume off the box:

```sh
docker run --rm -v foreseer-backups:/b -v /srv/backups:/out alpine \
  sh -c 'cp /b/$(ls -t /b | head -1) /out/'
```

Ship `/srv/backups` somewhere else on a schedule. A backup that lives on the
same disk as the database is not a backup.

## What is still true after all this

The enclave is simulated. The seed is generated and held by the server
process, so the pre-bet commitment is your word plus an onchain anchor, not
hardware attestation. That is stated on the docs home page and in the FAQ,
and it is the honest position until a Confidential Space machine runs the
image. Everything else, the signatures, the reveals, the Merkle proofs and
the anchors, is real and independently checkable.
