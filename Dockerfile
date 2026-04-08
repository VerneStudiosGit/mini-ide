FROM node:20-bookworm

# Build tools for node-pty + basic utilities
RUN apt-get update && apt-get install -y \
    build-essential python3 git curl wget vim nano sudo gosu unzip \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2 (arch-aware)
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) awsurl="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" ;; \
      arm64) awsurl="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" ;; \
      *) echo "unsupported arch $arch" && exit 1 ;; \
    esac; \
    curl -fsSL "$awsurl" -o /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install; \
    rm -rf /tmp/aws /tmp/awscliv2.zip

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI and OpenAI Codex CLI
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# Create user "mini-ide" with full sudo permissions
RUN useradd -m -s /bin/bash -G sudo mini-ide \
    && echo "mini-ide ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/mini-ide \
    && chmod 0440 /etc/sudoers.d/mini-ide

# Persistent data directory — mount a Railway volume at /data from the dashboard
RUN mkdir -p /data && chown mini-ide:mini-ide /data

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Install client dependencies and build
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install

COPY . .
RUN npm run build

# Give mini-ide ownership of the app
RUN chown -R mini-ide:mini-ide /app /data

ENV DATA_DIR=/data
ENV SHELL=/bin/bash

# Fix permissions on data dir at startup and run as mini-ide
EXPOSE 3000
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]
