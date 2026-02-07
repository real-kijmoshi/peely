# Peely 🍌 Daemon Architecture

## Overview

The daemon architecture allows Peely to run as a persistent background process, handling interfaces (Discord), plugin events, and timers. This provides several benefits:

1. **Single Persistent Process**: All interfaces and plugins run in one daemon process
2. **Easy Updates**: Restart the daemon to reload code without losing configuration
3. **Shared State**: CLI commands connect to the same daemon for consistent conversation history
4. **Background Operation**: Discord bot and timers run independently of CLI sessions

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Peely 🍌 Daemon                                        │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │   Discord    │  │   Plugins    │  │    Events    │                       │
│  │  Interface   │  │   System     │  │   & Timers   │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │              IPC Server (Unix Socket)                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
                              ↑
                    (JSON over Unix Socket)
                              ↑
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLI Clients                                         │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │ peely chat   │  │ peely daemon │  │   Terminal   │                       │
│  │   <msg>      │  │    status    │  │      TUI     │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## IPC Protocol

Communication between CLI and daemon uses JSON over Unix sockets (or named pipes on Windows).

### Message Format

```javascript
// Request
{
  "type": "ping|chat|status|clear|timers|shutdown",
  "payload": { /* command-specific data */ }
}

// Response
{
  "type": "response",
  "success": true|false,
  "data": { /* response data */ },
  "error": "error message" // if success=false
}
```

### Supported Commands

- **ping**: Health check
- **chat**: Send a message and get AI response
- **status**: Get daemon status (uptime, connected clients, active timers, etc.)
- **clear**: Clear conversation history
- **timers**: List active timers
- **shutdown**: Gracefully shut down the daemon

## Usage

### Start Daemon

```bash
node cli.js daemon start
# or
npm run daemon:start
```

### Stop Daemon

```bash
node cli.js daemon stop
# or
npm run daemon:stop
```

### Restart Daemon (for updates)

```bash
git pull
node cli.js daemon restart
# or
npm run daemon:restart
```

### Check Status

```bash
node cli.js daemon status
# or
npm run daemon:status
```

### Use Daemon for Chat

When the daemon is running, the `chat` command automatically connects to it:

```bash
node cli.js chat "What's the weather?"
```

## File Structure

```
src/daemon/
├── index.js    # Entry point for daemon process
├── server.js   # Daemon server implementation
└── client.js   # IPC client for CLI
```

## Configuration

The daemon uses the same `config.json` as the regular CLI. No additional configuration needed.

## Process Management

- **PID File**: `.peely-daemon.pid` tracks the daemon process
- **Log File**: `data/daemon.log` contains daemon output
- **Socket**: `/tmp/peely-daemon.sock` (Unix) or `\\?\pipe\peely-daemon` (Windows)

## Graceful Shutdown

The daemon handles SIGTERM and SIGINT signals:
1. Closes all client connections
2. Stops Discord bot (if running)
3. Cleans up IPC socket
4. Exits cleanly

## Conversation History

Each conversation has a unique ID:
- CLI chat: `daemon-cli`
- Discord users: `discord-{userId}`

History is persisted to disk and shared across CLI invocations when using the daemon.

## Error Handling

- Connection timeout: 5 seconds
- Automatic socket cleanup on restart
- Graceful fallback if daemon not running (for `chat` command)

## Benefits Over Legacy Approach

**Legacy** (separate processes):
- Each `peely start` creates a new Discord bot process
- No shared state between CLI and background process
- Manual config copying required for updates

**Daemon** (single process):
- One daemon handles all interfaces
- CLI connects to running daemon
- `daemon restart` reloads code without config loss
- Shared conversation history

## Security Considerations

- Unix socket limited to current user by filesystem permissions
- No network exposure (local IPC only)
- Graceful shutdown prevents resource leaks
