#!/bin/bash
# Persistent volume path — configurable via DATA_DIR env var so users can
# mount their volume wherever they want.
: "${DATA_DIR:=/data}"
export DATA_DIR

IS_ROOT=0
if [ "$(id -u)" -eq 0 ]; then
  IS_ROOT=1
fi

as_mini_ide() {
  if [ "${IS_ROOT}" -eq 1 ]; then
    gosu mini-ide "$@"
  else
    "$@"
  fi
}

# Fix ownership of ${DATA_DIR} (may have been created by root on volume mount)
if [ "${IS_ROOT}" -eq 1 ]; then
  chown -R mini-ide:mini-ide "${DATA_DIR}" 2>/dev/null || true
fi

# Persist the full HOME directory across redeploys. This makes user-level
# installs/config survive image updates (npm/pip user installs, dotfiles,
# local CLIs, auth files, etc.).
HOME_DIR="${HOME:-/home/mini-ide}"
PERSIST_HOME="${DATA_DIR}/home"

if [ "${IS_ROOT}" -ne 1 ]; then
  # App Platform / restricted runtimes may start as non-root and block
  # setuid/sudo. In that case, keep HOME inside DATA_DIR where we can write.
  HOME_DIR="${DATA_DIR}/home"
  PERSIST_HOME="${HOME_DIR}"
fi
export HOME="$HOME_DIR"

as_mini_ide mkdir -p "${PERSIST_HOME}"

# First deploy: seed persistent HOME with whatever the image has in /home/mini-ide.
# On later deploys the marker exists and we keep the existing persisted data.
if [ ! -e "${PERSIST_HOME}/.mini-ide-home-initialized" ] && [ -d "${HOME_DIR}" ] && [ ! -L "${HOME_DIR}" ]; then
  as_mini_ide cp -a "${HOME_DIR}/." "${PERSIST_HOME}/" 2>/dev/null || true
  as_mini_ide touch "${PERSIST_HOME}/.mini-ide-home-initialized"
fi

# Replace /home/mini-ide with a symlink to the persisted HOME on the volume.
if [ "${IS_ROOT}" -eq 1 ]; then
  if [ ! -L "${HOME_DIR}" ] || [ "$(readlink "${HOME_DIR}")" != "${PERSIST_HOME}" ]; then
    rm -rf "${HOME_DIR}"
    ln -s "${PERSIST_HOME}" "${HOME_DIR}"
  fi
fi

# Repair ownership/permissions for persisted HOME. Older deployments or
# one-off root commands may leave files unreadable for mini-ide, which
# breaks tools like codex/claude when writing config.
if [ "${IS_ROOT}" -eq 1 ]; then
  chown -R mini-ide:mini-ide "${PERSIST_HOME}" 2>/dev/null || true
fi
as_mini_ide mkdir -p \
  "${HOME}/.config" \
  "${HOME}/.cache" \
  "${HOME}/.local/bin" \
  "${HOME}/.codex" \
  "${HOME}/.claude"
as_mini_ide touch "${HOME}/.bashrc" "${HOME}/.profile"
if [ "${IS_ROOT}" -eq 1 ]; then
  chmod -R u+rwX "${PERSIST_HOME}" 2>/dev/null || true
fi

# Prefer user-level install locations so tools survive redeploys.
export NPM_CONFIG_PREFIX="${HOME}/.npm-global"
export PIP_USER=1
export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"
as_mini_ide mkdir -p "${HOME}/.npm-global" "${HOME}/.local/bin" "${HOME}/.cache"

# Optional startup provisioning (persisted in preferences.json under "startup")
# Runs before the app boots so packages/tools are ready in every redeploy.
STARTUP_PREFS_PATH="${DATA_DIR}/.mini-ide/preferences.json"
STARTUP_LOG_PATH="${DATA_DIR}/.mini-ide/startup.log"
as_mini_ide mkdir -p "$(dirname "${STARTUP_LOG_PATH}")"
if [ "${IS_ROOT}" -eq 1 ]; then
  chown -R mini-ide:mini-ide "${DATA_DIR}/.mini-ide" 2>/dev/null || true
fi

if [ -f "${STARTUP_PREFS_PATH}" ]; then
  eval "$(
    node -e '
      const fs = require("fs");
      const path = process.argv[1];
      let parsed = {};
      try {
        parsed = JSON.parse(fs.readFileSync(path, "utf8"));
      } catch {}
      const startup = parsed && typeof parsed === "object" ? parsed.startup || {} : {};
      const bool = (v, d = false) => (typeof v === "boolean" ? v : d);
      const pkgs = Array.isArray(startup.aptPackages)
        ? startup.aptPackages.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean)
        : [];
      const commands = typeof startup.commands === "string" ? startup.commands : "";
      const out = {
        enabled: bool(startup.enabled, false) ? "1" : "0",
        aptUpdate: bool(startup.aptUpdate, true) ? "1" : "0",
        aptUpgrade: bool(startup.aptUpgrade, false) ? "1" : "0",
        pkgsB64: Buffer.from(pkgs.join("\n"), "utf8").toString("base64"),
        commandsB64: Buffer.from(commands, "utf8").toString("base64"),
      };
      for (const [k, v] of Object.entries(out)) {
        process.stdout.write(`STARTUP_${k}=${JSON.stringify(v)}\n`);
      }
    ' "${STARTUP_PREFS_PATH}"
  )"

  if [ "${STARTUP_enabled}" = "1" ] && [ "${IS_ROOT}" -eq 1 ]; then
    {
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Startup provisioning: begin"

      if [ "${STARTUP_aptUpdate}" = "1" ]; then
        echo "[startup] apt-get update"
        apt-get update
      fi

      if [ "${STARTUP_aptUpgrade}" = "1" ]; then
        echo "[startup] apt-get upgrade -y"
        DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
      fi

      STARTUP_PACKAGES_TEXT="$(printf "%s" "${STARTUP_pkgsB64}" | base64 -d 2>/dev/null || true)"
      if [ -n "${STARTUP_PACKAGES_TEXT}" ]; then
        mapfile -t STARTUP_PKG_ARRAY < <(printf "%s\n" "${STARTUP_PACKAGES_TEXT}" | sed "/^$/d")
        if [ "${#STARTUP_PKG_ARRAY[@]}" -gt 0 ]; then
          echo "[startup] apt-get install -y ${STARTUP_PKG_ARRAY[*]}"
          DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${STARTUP_PKG_ARRAY[@]}"
        fi
      fi

      STARTUP_COMMANDS="$(printf "%s" "${STARTUP_commandsB64}" | base64 -d 2>/dev/null || true)"
      if [ -n "${STARTUP_COMMANDS}" ]; then
        echo "[startup] custom commands"
        STARTUP_SCRIPT="/tmp/mini-ide-startup-commands.sh"
        printf "%s\n" "${STARTUP_COMMANDS}" > "${STARTUP_SCRIPT}"
        chmod +x "${STARTUP_SCRIPT}"
        bash "${STARTUP_SCRIPT}"
      fi

      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Startup provisioning: done"
    } >> "${STARTUP_LOG_PATH}" 2>&1 || {
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Startup provisioning: failed (continuing boot)" >> "${STARTUP_LOG_PATH}"
    }
  elif [ "${STARTUP_enabled}" = "1" ]; then
    {
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Startup provisioning skipped: root privileges unavailable"
    } >> "${STARTUP_LOG_PATH}" 2>&1 || true
  fi
fi

# Startup provisioning can create root-owned files under persisted HOME.
# Normalize ownership again so terminal user can run codex/claude reliably.
if [ "${IS_ROOT}" -eq 1 ]; then
  chown -R mini-ide:mini-ide "${PERSIST_HOME}" 2>/dev/null || true
  chmod -R u+rwX "${PERSIST_HOME}" 2>/dev/null || true
  chown -R mini-ide:mini-ide "${DATA_DIR}/.mini-ide" 2>/dev/null || true
fi

# Auto-login to GitHub CLI if GITHUB_TOKEN is set
if [ -n "$GITHUB_TOKEN" ]; then
  as_mini_ide bash -c "echo '$GITHUB_TOKEN' | gh auth login --with-token 2>/dev/null || true"
fi

if [ "${IS_ROOT}" -eq 1 ]; then
  exec gosu mini-ide "$@"
fi
exec "$@"
