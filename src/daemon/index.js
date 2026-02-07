#!/usr/bin/env node

/**
 * peely Daemon Entry Point
 * 
 * Starts the daemon server that manages all interfaces and handles IPC.
 */

const { DaemonServer } = require("./server");
const chalk = require("chalk");

const logo = `
  ${chalk.magenta("╔══════════════════════════════╗")}
  ${chalk.magenta("║")}  ${chalk.bold.white("🍌 peely daemon")}            ${chalk.magenta("║")}
  ${chalk.magenta("╚══════════════════════════════╝")}
`;

console.log(logo);
console.log(chalk.dim("  Starting daemon server...\n"));

const daemon = new DaemonServer();

daemon.start().catch((err) => {
  console.error(chalk.red("Failed to start daemon:"), err.message);
  process.exit(1);
});
