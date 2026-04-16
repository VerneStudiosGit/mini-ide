# mini-ide

A lightweight, web-based IDE designed for easy deployment on a VPS or Railway. Provides a full development environment accessible from any browser — file management, code editing with syntax highlighting, multiple terminal sessions, and integrated AI coding agents.

## Features

- **File Explorer** — Grid and tree views with breadcrumb navigation, upload, rename, delete, and context menus
- **Code Editor** — CodeMirror 6 with syntax highlighting for JavaScript, TypeScript, Python, HTML, CSS, JSON, Markdown, and more. Ctrl+S to save
- **Multi-Terminal** — Multiple persistent terminal sessions with tabs. Sessions survive tab switching
- **AI Agents** — One-click launch for Claude Code and OpenAI Codex directly in the terminal
- **Browser Preview** — Built-in iframe browser for previewing web apps
- **Theming** — Customizable color scheme with live preview
- **Branding** — Custom instance name and icon (shows in browser tab and PWA)
- **Startup Provisioning** — Optional boot-time `apt` + custom commands from Preferences
- **PWA** — Installable as a Progressive Web App
- **Authentication** — Token-based auth with configurable credentials

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Editor | CodeMirror 6 (modular, lazy-loaded language support) |
| Terminal | xterm.js + node-pty via WebSocket |
| Backend | Express.js, TypeScript |
| Deployment | Docker, Node 20 |

## Quick Start

### Local Development

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Run dev server (backend + frontend with hot reload)
npm run dev
```

The app will be available at `http://localhost:5173` (Vite proxy forwards API calls to the backend on port 3000).

Default credentials: `admin` / `admin`

### Docker

```bash
docker build -t mini-ide .
docker run -p 3000:3000 -v mini-ide-data:/data mini-ide
```

### Persistence Model (Important)

When running with a mounted `/data` volume, this project now persists the full user home directory (`/home/mini-ide`) inside the volume (`/data/home`).

This means user-level installs/configs survive redeploys/merges, for example:

- `~/.codex`, `~/.claude`, `~/.aws`, dotfiles
- npm user-global installs (`~/.npm-global`)
- pip user installs (`~/.local`)

You can also configure boot-time provisioning in **Preferences → Startup**:

- optional `apt-get update`
- optional `apt-get upgrade -y`
- apt package list (one per line, e.g. `bubblewrap`)
- custom bash commands

Boot provisioning runs on every restart/deploy and writes logs to:

- `/data/.mini-ide/startup.log`

System-level changes do **not** persist across redeploys because they live in the container image layer, for example:

- `apt install ...`
- files written under `/usr`, `/etc`, `/opt` (outside `/data`)

### Railway

1. Connect your repo to Railway
2. Add a volume mounted at `/data` for persistent storage
3. Set environment variables as needed (see below)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_USERNAME` | `admin` | Login username |
| `AUTH_PASSWORD` | `admin` | Login password |
| `DATA_DIR` | `/data` | Directory for user files (mount a volume here) |
| `PORT` | `3000` | Server port |
| `SHELL` | `/bin/bash` | Shell used for terminal sessions |
| `GITHUB_TOKEN` | — | Auto-login to GitHub CLI on container start |
| `ANTHROPIC_API_KEY` | — | Required for Claude Code |
| `OPENAI_API_KEY` | — | Required for OpenAI Codex |

## Project Structure

```
mini-ide/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       │   ├── FileExplorer.tsx      # File browser (grid + tree)
│       │   ├── FileTreeView.tsx      # Tree view with collapsible dirs
│       │   ├── CodeEditor.tsx        # CodeMirror 6 editor
│       │   ├── EditorTabs.tsx        # Editor tab bar
│       │   ├── Terminal.tsx          # Multi-session terminal
│       │   ├── FilePreviewModal.tsx  # Image/file preview modal
│       │   ├── PreviewWindow.tsx     # Browser iframe
│       │   ├── ThemeCustomizer.tsx   # Theme editor
│       │   ├── LoginScreen.tsx       # Auth screen
│       │   └── ContextMenu.tsx       # Right-click menu
│       ├── hooks/          # Custom React hooks
│       ├── utils/          # Shared utilities
│       ├── App.tsx         # Main layout
│       └── theme.ts        # Theme system
├── server/                 # Express backend
│   ├── index.ts            # Server entry, routing, WebSocket
│   ├── filesystem.ts       # File I/O API (/api/fs/*)
│   ├── terminal.ts         # PTY spawning + WebSocket handler
│   ├── auth.ts             # Authentication
│   └── branding.ts         # Instance customization
├── Dockerfile
├── docker-entrypoint.sh
└── package.json
```

## Pre-installed Tools (Docker)

The Docker image includes:

- **Node.js 20** — JavaScript runtime
- **Git** — Version control
- **GitHub CLI** (`gh`) — GitHub operations from the terminal
- **Claude Code** — Anthropic's AI coding agent
- **OpenAI Codex** — OpenAI's AI coding agent
- **vim, nano** — Terminal text editors
- **curl, wget** — HTTP clients
- **build-essential, python3** — Build tools

## License

Private — Verne Studios
