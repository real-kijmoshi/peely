<div align="center">

# 🍌 Peely

**Your Personal AI Assistant in the Terminal**

[![Version](https://img.shields.io/badge/version-0.9.1-blue.svg)](https://github.com/real-kijmoshi/peely)
[![npm](https://img.shields.io/npm/v/peely.svg)](https://www.npmjs.com/package/peely)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

*A lightweight, extensible command-line AI assistant powered by GitHub Copilot*

[Features](#-features) • [Quick Start](#-quick-start) • [Usage](#-usage) • [Daemon Mode](#-daemon-mode) • [Documentation](#-documentation)

</div>

---

## 🌟 Features

- **🚀 Fast & Lightweight** — Quick AI queries right from your terminal
- **🔌 Extensible Plugin System** — Custom tools, timers, and integrations
- **💬 Multiple Interfaces** — Terminal TUI, Discord bot, or CLI commands
- **⚡ Daemon Mode** — Persistent background operation with shared state
- **🎯 GitHub Copilot Support** — Leverage GitHub Copilot's AI capabilities

## 🎯 Why Peely?

Peely brings AI assistance directly to your command line with a focus on speed, flexibility, and ease of use. Whether you need quick answers, want to run a Discord bot, or need a persistent AI assistant running in the background, Peely has you covered.

## 📋 Prerequisites

- **Node.js** (LTS version 14 or higher)
- **npm** (bundled with Node.js)
- **GitHub Copilot** subscription (for AI features)

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/real-kijmoshi/peely.git
cd peely

# Install dependencies
npm install

# Start interactive mode
npm start
```

Alternatively, install the published package from npm:

```bash
# Install globally to use the `peely` CLI
npm install -g peely

# Or install locally in a project
npm install peely

# Run installed CLI
peely
```

### First-Time Setup

```bash
# Run the setup wizard
npx peely setup

# Configure your AI model
npx peely model

# Start using Peely!
npx peely chat "Hello, Peely!"
```

## 💡 Usage

### Interactive Terminal UI

Launch the interactive TUI for a conversation-style experience:

```bash
npm start
# or
npx peely
```

**Available Commands:**
- `/help` — Show available commands
- `/clear` — Clear conversation history
- `/status` — Show configuration status
- `/pair discord <code>` — Pair your Discord account
- `/exit` or `/quit` — Exit the application

### One-Shot Commands

Quick AI queries without entering interactive mode:

```bash
# Ask a question
npx peely chat "What's the weather like?"

# Get help
npx peely help

# Check status
npx peely status
```

### Discord Bot

Run Peely as a Discord bot:

```bash
# Set up Discord bot token
npx peely pair discord setup

# Start Discord bot
npx peely discord
```

## ⚡ Daemon Mode

**Recommended for the best experience!**

The daemon runs Peely in the background, providing persistent operation, faster responses, and shared state across all interfaces.

### 🎬 Starting the Daemon

```bash
npx peely daemon start
# or
npm run daemon:start
```

The daemon will:
- ✅ Start the Discord bot (if configured)
- ✅ Handle plugin events and timers
- ✅ Accept connections from CLI clients
- ✅ Maintain conversation history
- ✅ Run in the background until stopped

### 📡 Using the Daemon

Once running, all CLI commands automatically connect to the daemon:

```bash
# Chat (connects to daemon automatically)
npx peely chat "Explain quantum computing"

# Check daemon status
npx peely daemon status

# Restart daemon (useful after updates)
npx peely daemon restart

# Stop daemon
npx peely daemon stop
```

### 🔄 Updating Peely

When you update Peely, simply restart the daemon to reload all code:

```bash
git pull
npx peely daemon restart
```

**No configuration loss!** Your conversation history and settings are preserved.

### 🏗️ Architecture

The daemon architecture provides several benefits:

| **Legacy Mode** | **Daemon Mode** ✨ |
|----------------|-------------------|
| Separate processes for each interface | Single persistent process |
| No shared state | Shared conversation history |
| Manual restarts required | Hot reload with `daemon restart` |
| Slower startup | Instant CLI responses |

For detailed architecture information, see [DAEMON.md](DAEMON.md).

## 📚 Documentation

- **[DAEMON.md](DAEMON.md)** — Detailed daemon architecture and IPC protocol
- **[GitHub Copilot Setup](src/ai/providers/copilot.md)** — Guide to using GitHub Copilot API

## 🛠️ Development

### Project Structure

```
peely/
├── cli.js              # Main CLI entry point
├── src/
│   ├── ai/             # AI provider integrations
│   ├── daemon/         # Daemon server and client
│   ├── interfaces/     # Terminal and Discord interfaces
│   ├── plugins/        # Plugin system
│   └── utils/          # Utilities and configuration
├── data/               # Persistent data storage
```

### Running Tests

```bash
npm test
```

### Configuration

Configuration is stored in `config.json`. You can modify settings using CLI commands or by editing the file directly.

## 📦 Release Process

### Creating Checksums

```bash
shasum -a 256 build/peely-macos > build/peely-macos.sha256
shasum -a 256 build/peely-windows.exe > build/peely-windows.exe.sha256
```

### Publishing a Release

```bash
# Create and push a tag
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Create GitHub release with artifacts
gh release create v1.0.0 \
  build/peely-macos \
  build/peely-windows.exe \
  --title "v1.0.0" \
  --notes-file RELEASE.md
```

## 🐛 Troubleshooting


### Getting Help

- 📖 Check the [documentation](#-documentation)
- 🐛 [Open an issue](https://github.com/real-kijmoshi/peely/issues)
- 💬 Join the discussions

## 🤝 Contributing

Contributions are welcome! Here are some ways you can help:

- 🐛 Report bugs and issues
- 💡 Suggest new features or improvements
- 📝 Improve documentation
- 🔧 Submit pull requests



## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 👤 Author

**real-kijmoshi**

- GitHub: [@real-kijmoshi](https://github.com/real-kijmoshi)
---

<div align="center">

**[⬆ Back to Top](#-peely)**

Made with ❤️ by the Peely team

</div>