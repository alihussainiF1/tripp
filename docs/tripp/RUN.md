# Running tripp

tripp is a fork of T3 Code. The server runs on your own machine, keeps every Bot's
folder under `~/.tripp/bots`, and serves the web app itself. Your phone and laptop
reach it over Tailscale.

## Build

```sh
cd /home/ali/code_dev/tripp
vp i
vp run build          # web and server bundles; the desktop build may fail without libsecret, that is fine
```

## Run once by hand

```sh
cd /home/ali/code_dev/tripp/apps/server
T3CODE_TELEMETRY_ENABLED=false node dist/bin.mjs serve \
  --base-dir ~/.tripp/home --port 3901 --host <tailscale-ip> --no-browser
```

Bind to the Tailscale address, not `0.0.0.0`: this machine also has a public
address, and a pairing code is the only thing between the port and the internet.
Find the address with `tailscale ip -4`.

The command prints a pairing URL. Open it once in each browser you use. On a
phone, open the same URL in Safari or Chrome and choose "Add to Home Screen"
to install tripp as an app.

## Run as a background service

`scripts/tripp-service.sh install` writes a systemd user unit, enables it at
login, and starts it. `status`, `restart`, `logs`, and `uninstall` do what they
say. A new pairing link for another device:

```sh
cd /home/ali/code_dev/tripp/apps/server
node dist/bin.mjs pair --base-dir ~/.tripp/home --ttl 1h
```

## First run

The web app opens T3 Code's setup flow the first time: it checks that Claude
Code and Codex are signed in on this machine and offers to import coding
projects. Imported projects stay out of the Bot roster; switch to Developer view
from the sidebar footer to see them.

## Where things live

| What                               | Where                                  |
| ---------------------------------- | -------------------------------------- |
| Server state, settings, threads    | `~/.tripp/home/userdata`               |
| Bot folders (instructions, memory) | `~/.tripp/bots/<slug>/`                |
| Service unit                       | `~/.config/systemd/user/tripp.service` |
| Logs                               | `journalctl --user -u tripp -f`        |

## Update

```sh
cd /home/ali/code_dev/tripp
git pull
vp i && vp run build
scripts/tripp-service.sh restart
```

## Later

T3 Connect tunnels, push notifications, and public webhook URLs depend on T3's
hosted relay and are not available in tripp yet. Tailscale covers access from
anywhere; Cloudflare Tunnel or a self-hosted relay (`infra/relay`) can come later.
