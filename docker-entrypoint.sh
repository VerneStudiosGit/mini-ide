#!/bin/bash
# Persistent volume path — configurable via DATA_DIR env var so users can
# mount their volume wherever they want.
: "${DATA_DIR:=/data}"
export DATA_DIR

# Fix ownership of ${DATA_DIR} (may have been created by root on volume mount)
sudo chown -R mini-ide:mini-ide "${DATA_DIR}" 2>/dev/null || true

# Persist Claude Code and Codex auth/config across redeploys by storing
# them on the mounted volume and symlinking from the user's home. Without
# this, every new container image ships with a fresh /home/mini-ide and
# the user has to re-login on every deploy.
#
# Claude Code → ~/.claude/ (dir) + ~/.claude.json (file)
# Codex       → ~/.codex/  (dir)
persist_home_path() {
  # $1 = path under $HOME (e.g. ".claude"), $2 = "dir" or "file"
  local rel="$1" kind="$2"
  local home="/home/mini-ide"
  local src="${DATA_DIR}/home/$rel"
  local dst="$home/$rel"

  sudo -u mini-ide mkdir -p "${DATA_DIR}/home"

  # First deploy: seed ${DATA_DIR} from whatever the image/user already has.
  if [ ! -e "$src" ] && [ -e "$dst" ] && [ ! -L "$dst" ]; then
    sudo -u mini-ide mv "$dst" "$src"
  fi

  # Make sure the target exists on the volume.
  if [ ! -e "$src" ]; then
    if [ "$kind" = "dir" ]; then
      sudo -u mini-ide mkdir -p "$src"
    else
      sudo -u mini-ide touch "$src"
    fi
  fi

  # Replace anything at $dst with a symlink to the volume copy.
  if [ ! -L "$dst" ] || [ "$(readlink "$dst")" != "$src" ]; then
    sudo rm -rf "$dst"
    sudo -u mini-ide ln -s "$src" "$dst"
  fi
}

persist_home_path ".claude"      dir
persist_home_path ".claude.json" file
persist_home_path ".codex"       dir

# Auto-login to GitHub CLI if GITHUB_TOKEN is set
if [ -n "$GITHUB_TOKEN" ]; then
  sudo -u mini-ide bash -c "echo '$GITHUB_TOKEN' | gh auth login --with-token 2>/dev/null || true"
fi

exec gosu mini-ide "$@"
