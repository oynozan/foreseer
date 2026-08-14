# Deploying Foreseer on a VPS with nginx

Four public names, one box:

| Name | Serves | Local port |
| --- | --- | --- |
| `foreseer.net` | landing, `/verify`, `/dashboard` | 3000 |
| `api.foreseer.net` | the Foreseer server: epochs, plays, receipts, billing | 8787 |
| `docs.foreseer.net` | the Nextra documentation | 3001 |
| `tee.foreseer.net` | the FCC extension proxy, where Flare providers post | 6674 |

Only nginx listens publicly. Every service binds to 127.0.0.1 and nginx
terminates TLS in front of it.

The API is a separate origin from the dashboard, which is fine: the server
already sends permissive CORS headers, and the dashboard authenticates with
an `x-owner-token` header rather than cookies, so there is no credentialed
cross-origin problem.

## 1. DNS

Four A records at the VPS address:

```
foreseer.net.        A    <vps-ip>
api.foreseer.net.    A    <vps-ip>
docs.foreseer.net.   A    <vps-ip>
tee.foreseer.net.    A    <vps-ip>
```

Let them propagate before certbot, or the challenge fails.

## 2. Prepare the box

```sh
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo corepack enable && sudo corepack prepare pnpm@10.18.0 --activate
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo npm install -g pm2

sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 3. Get the code

```sh
sudo mkdir -p /srv && sudo chown $USER /srv
git clone --recurse-submodules https://github.com/oynozan/foreseer /srv/foreseer
cd /srv/foreseer
```

`--recurse-submodules` matters: `packages/ts` is its own repository and the
server links against it.

## 4. Server secrets

The signing key is the product's identity. Its address must equal the
`teeId` the deployed `ForeseerInstructionSender` was constructed with
(`0xc5d8af573bcbf19b46b51d5ccf65864dcd46f489`), or every anchor reverts and
there is no setter to fix it. Copy the key you deployed with, never mint a
new one here.

Easiest safe transfer, straight from your machine:

```sh
scp server/.env user@vps:/srv/foreseer/server/.env
ssh user@vps 'chmod 600 /srv/foreseer/server/.env'
```

Then set the production values on the box:

```sh
FORESEER_ADMIN_KEY=          # keep yours, or openssl rand -hex 24
FORESEER_TEE_KEY=            # unchanged, address must equal the contract teeId
FORESEER_TREASURY=0x2476de4a8586d889af91bcff9dd439286cf1b89b
FORESEER_PRICE_PER_PLAY_WEI=10000000000000000
FORESEER_EPOCH_SECONDS=300   # 60 was for demo iteration, 300 means fewer anchors
FORESEER_CHAIN_RPC=https://coston2-api.flare.network/ext/C/rpc
FORESEER_READ_LIMIT=300
```

The server refuses to start on the published dev defaults, so a missing
value fails loudly instead of quietly signing with a public key.

## 5. Run the API

Bind it to loopback first. In `server/docker-compose.yaml`:

```yaml
ports:
  - "127.0.0.1:8787:8787"
```

```sh
cd /srv/foreseer
set -a && . server/.env && set +a
docker compose -f server/docker-compose.yaml up -d --build
curl -s localhost:8787/health
```

Expect `{"ok":true,"teeId":"0xc5d8af57...","chainId":114,"treasury":"0x..."}`.
If the teeId is anything else, stop and fix the key before going further.

The compose stack also runs an hourly database backup into a named volume.

## 6. Build and run the two sites

`NEXT_PUBLIC_FORESEER_API` is inlined at build time, so it must be set
before `pnpm build`, not at runtime.

```sh
cd /srv/foreseer/packages/ts && pnpm install --ignore-workspace --frozen-lockfile && pnpm build

cd /srv/foreseer/web
pnpm install --ignore-workspace --frozen-lockfile
NEXT_PUBLIC_FORESEER_API=https://api.foreseer.net pnpm build

cd /srv/foreseer/docs
pnpm install --ignore-workspace --frozen-lockfile
pnpm build
```

Keep them alive with whatever you already use. With pm2:

```sh
cd /srv/foreseer/web  && PORT=3000 HOSTNAME=127.0.0.1 pm2 start "pnpm start" --name foreseer-web
cd /srv/foreseer/docs && PORT=3001 HOSTNAME=127.0.0.1 pm2 start "pnpm start" --name foreseer-docs
pm2 save && pm2 startup
```

## 7. nginx

Both sites are Next.js apps, so nginx serves their build output and static
files straight from disk and only forwards real requests to node. Writing
them as a plain `proxy_pass` works but pushes every icon and script through
the node process for no reason, and drops websocket support.

Three things every Next block below needs: an `alias` for `/_next/static`
with a long cache (those filenames are content hashed, so they can never go
stale), `proxy_http_version 1.1` with the `Upgrade` headers, and a `root`
pointing at `public/` so brand assets never reach node.

```nginx
# /etc/nginx/sites-available/foreseer.net
server {
    listen 80;
    server_name foreseer.net www.foreseer.net;

    # web/public: favicon, logos, the verifier bundle
    root /srv/foreseer/web/public;

    # Hashed build output, immutable by construction
    location /_next/static/ {
        alias /srv/foreseer/web/.next/static/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # A file in public/ wins, everything else is the app
    location / {
        try_files $uri @next;
        add_header Cache-Control "public, max-age=3600";
    }

    location @next {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```nginx
# /etc/nginx/sites-available/docs.foreseer.net
server {
    listen 80;
    server_name docs.foreseer.net;

    root /srv/foreseer/docs/public;

    location /_next/static/ {
        alias /srv/foreseer/docs/.next/static/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri @next;
    }

    location @next {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The API serves no static files, so it stays a straight proxy. It does need
`X-Forwarded-For`: the server rate limits uncredentialed reads per client
address and would otherwise see every visitor as nginx and throttle them as
one.

```nginx
# /etc/nginx/sites-available/api.foreseer.net
server {
    listen 80;
    server_name api.foreseer.net;

    # The server caps bodies at 64 KiB itself
    client_max_body_size 128k;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```nginx
# /etc/nginx/sites-available/tee.foreseer.net
server {
    listen 80;
    server_name tee.foreseer.net;

    # Flare providers post cosigned instructions here
    location / {
        proxy_pass http://127.0.0.1:6674;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

nginx runs as `www-data` and must be able to read the build output, so keep
`/srv` traversable:

```sh
sudo chmod o+x /srv /srv/foreseer /srv/foreseer/web /srv/foreseer/docs
```

Rebuilding a site replaces `.next/static`, so reload nginx after a deploy if
you ever enable file caching.

```sh
cd /etc/nginx/sites-available
for s in foreseer.net api.foreseer.net docs.foreseer.net tee.foreseer.net; do
    sudo ln -sf /etc/nginx/sites-available/$s /etc/nginx/sites-enabled/$s
done
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d foreseer.net -d www.foreseer.net \
    -d api.foreseer.net -d docs.foreseer.net -d tee.foreseer.net
```

Write the blocks as plain `listen 80` above. Certbot edits each one in
place, swapping in `listen 443 ssl` with its own `ssl_certificate`,
`ssl_certificate_key`, `options-ssl-nginx.conf` and `ssl_dhparam` lines, and
adds a port 80 block that redirects to HTTPS. It also installs a renewal
timer, so the finished files carry the usual `# managed by Certbot`
comments and you never hand-write the TLS section.

## 8. The TEE machine

This is what turns checks 2 and 4 from interface into fact. Hackathon rules
accept `SIMULATED_TEE=true` on Coston2, but the endpoint must be a stable
public HTTPS name, which `tee.foreseer.net` now is.

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
PROXY_PRIVATE_KEY=<fresh key, see the warning below>
FORESEER_TEE_KEY=<same key as server/.env>
INITIAL_OWNER=0x84ef59f489879c00dd2d60c5b7f5a94ee20a85a5
GOVERNANCE_SIGNERS=0xF648f6eA8685914c581EF45E9AD2e94F9bEfb69F
GOVERNANCE_THRESHOLD=1
```

Generate `PROXY_PRIVATE_KEY` fresh with `openssl rand -hex 32`. The value
shipped in `tee/.env.example` is the upstream scaffold's sample key and is
public on GitHub, so anything using it is not private.

```sh
bash ./scripts/use-chain.sh coston2
bash ./scripts/start-services.sh --chain coston2      # extension, proxy, redis
curl -s https://tee.foreseer.net/info | jq '.machineData'
bash ./scripts/post-build.sh                          # allow version, governance, register
bash ./scripts/test.sh
```

`/info` must report your `extensionId` (`0x...0102c2`) and the
`initialOwner` you set. Then confirm the machine reached production:

```sh
cd tools && go run ./cmd/query-tee \
    -ext 0x00000000000000000000000000000000000000000000000000000000000102c2 \
    -rpc https://coston2-api.flare.network/ext/C/rpc
```

Two platform traps, both silent:

- A restart mints a **new** teeId. Recovery is restart, re-register, reach
  production, then pause the stale identity. There is no restore.
- The registered URL is stored onchain. If it ever changes, providers keep
  posting to the old one.

## 9. Anchor epochs on a timer

Closed epochs are only provable once anchored. A cron line every ten
minutes is enough:

```sh
crontab -e
```

```
*/10 * * * * cd /srv/foreseer/server && set -a && . ./.env && set +a && FORESEER_SENDER=0x3f93049764efE9b33497Ffc3d0D92b5d262d1fE9 FORESEER_POSTER_KEY=<poster key with gas> /usr/bin/node scripts/anchor.mjs >> /var/log/foreseer-anchor.log 2>&1
```

The script refuses to run if the server key and the contract `teeId` ever
diverge, so a key mistake stops before it costs gas.

## 10. Prove it works

```sh
curl -s https://api.foreseer.net/health
curl -s -o /dev/null -w '%{http_code}\n' https://foreseer.net/
curl -s -o /dev/null -w '%{http_code}\n' https://docs.foreseer.net/
curl -s -o /dev/null -w '%{http_code}\n' https://tee.foreseer.net/info

# create the first operator
ADMIN=$(grep ^FORESEER_ADMIN_KEY /srv/foreseer/server/.env | cut -d= -f2)
curl -s -X POST https://api.foreseer.net/admin/operators \
    -H "x-admin-key: $ADMIN" -H 'content-type: application/json' \
    -d '{"name":"first-operator","ownerWallet":"0x<owner wallet>"}'
```

Then in a browser:

1. `https://foreseer.net` loads and the demos spin.
2. `https://foreseer.net/verify?server=https://api.foreseer.net&epoch=1&bet=0`
   loads and verifies itself with no clicks.
3. `https://foreseer.net/dashboard` connects a wallet and shows that
   operator after a topup.
4. `epochs(<id>)` on the sender reads `anchored: true` once cron has run.

## 11. Backups are not optional

The database holds every epoch's server seed. Lose it and every receipt in
flight becomes unverifiable, which is the one failure the product cannot
explain away. Compose backs up hourly into the `foreseer-backups` volume;
copy it off the box:

```sh
docker run --rm -v foreseer-backups:/b -v /srv/backups:/out alpine \
    sh -c 'cp /b/$(ls -t /b | head -1) /out/'
```

Ship `/srv/backups` somewhere else on a schedule. A backup on the same disk
as the database is not a backup.

## What is still true after all this

The enclave is simulated. The seed is generated and held by the server
process, so the pre-bet commitment is your word plus an onchain anchor, not
hardware attestation. That is stated on the docs home page and in the FAQ,
and it is the honest position until a Confidential Space machine runs the
image. Everything else, the signatures, the reveals, the Merkle proofs and
the anchors, is real and independently checkable.
