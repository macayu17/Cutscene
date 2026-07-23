# Deploying the Cutscene share server

The share server (`packages/server`) is a single `node:http` process with no
database. It stores each recording as a directory on disk, enforces retention,
rate-limits writes, caps total bytes, and serves a share page at `/r/<id>`.
Everything it needs to face the public internet is already in the code; this
document is how to run it.

## Fly.io (recommended)

The repo ships a `Dockerfile` and `fly.toml` at the root. The image bundles the
server into one file, so the runtime carries no `node_modules`.

```sh
fly launch --no-deploy                 # or: fly apps create cutscene-share
fly volumes create cutscene_data --size 20 --region iad
fly secrets set CUTSCENE_ADMIN_TOKEN=$(openssl rand -hex 32)   # operator takedown
fly deploy
```

The volume is what makes the filesystem store production-ready: recordings, the
expiry files that drive retention, review state, and the Yjs timeline all live
on it and survive restarts and deploys. Scale-to-zero (`min_machines_running =
0`) is safe — retention is enforced on every read, and the sweep also runs on
start.

Do not deploy to a serverless platform. Uploads are up to 250 MB and reads
stream; that is the wrong shape for a function.

## Configuration

All optional, read from the environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4180` | Listen port (Fly sets `8080`). |
| `CUTSCENE_DATA` | `data` | Store directory. On Fly this is the volume mount. |
| `CUTSCENE_RETENTION_DAYS` | `30` | Days a recording is kept before the sweep removes it. |
| `CUTSCENE_STORE_LIMIT_BYTES` | 20 GiB | New writes are refused past this total. |
| `CUTSCENE_WRITE_BURST` / `CUTSCENE_WRITE_PER_MINUTE` | `20` / `20` | Per-address write rate limit. |
| `CUTSCENE_TRUST_PROXY` | off | Set to `1` only behind a proxy (Fly); the client key becomes the last `X-Forwarded-For` hop. |
| `CUTSCENE_ADMIN_TOKEN` | unset | An operator token that authorises takedown of any recording. Keep it a secret. |

## Abuse handling

- Anyone viewing a share page can **Report** it; reports append to
  `abuse.jsonl` beside the recording.
- The creator can **Delete** their own recording (owner token). An operator with
  `CUTSCENE_ADMIN_TOKEN` can delete any recording — that is the takedown path.
- Uploads are limited to the three whitelisted bundle files, validated on write
  and on read, so the endpoint cannot be used as open file hosting.

## Two seams left deliberately open

Both are named in the code and are additions, not rewrites — do them when there
is a reason to, not before.

- **Object storage (Cloudflare R2).** The filesystem is fine until video volume
  makes egress cost bite. `packages/server/src/store-driver.ts` defines
  `BundleStore`; add an `s3Store()` implementing the same four methods against
  R2 and pass it to `handle()`. The bundle bytes move; the small mutable
  metadata (expiry, review, timeline) stays on the volume.
- **GitHub OAuth for "my recordings".** Identity today is the owner token minted
  at upload, which already survives as long as the browser keeps it. Binding
  tokens to a GitHub login — so the list survives clearing site data — needs a
  registered OAuth app and a per-login index. No passwords, no email. Add it
  when losing the list on a cleared browser becomes a real complaint.
