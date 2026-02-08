const axios = require("axios");
const chalk = require("chalk");

const NPM_URL = "https://registry.npmjs.org/peely/latest";

const box = (lines, { pad = 2, color = chalk.yellow } = {}) => {
    const width =
        Math.max(...lines.map(l => l.replace(/\x1B\[[0-9;]*m/g, "").length)) +
        pad * 2;

    const top = "┌" + "─".repeat(width) + "┐";
    const bottom = "└" + "─".repeat(width) + "┘";

    console.log(color(top));
    for (const line of lines) {
        const visibleLength = line.replace(/\x1B\[[0-9;]*m/g, "").length;
        const space = width - visibleLength - pad;
        console.log(color("│" + " ".repeat(pad) + line + " ".repeat(space) + "│"));
    }
    console.log(color(bottom));
};

const center = (text, width) => {
    const len = text.replace(/\x1B\[[0-9;]*m/g, "").length;
    const left = Math.floor((width - len) / 2);
    const right = width - len - left;
    return " ".repeat(left) + text + " ".repeat(right);
};

const checkUpdate = async () => {
    const newest = await axios
        .get(NPM_URL)
        .then(res => res.data.version)
        .catch(() => null);

    if (!newest) return;

    const pkgVersion = require("../../package.json").version;
    if (newest <= pkgVersion) return;
    
    console.log("");
    const title = chalk.bold("🚀 Peely Update Available");
    const linesRaw = [
        title,
        "",
        `Latest version: ${chalk.green(newest)}`,
        `Your version:   ${chalk.red(pkgVersion)}`,
        "",
        chalk.cyan("Run: ") + chalk.bold.blueBright("npm install -g peely@latest"),
    ];

    const contentWidth = Math.max(
        ...linesRaw.map(l => l.replace(/\x1B\[[0-9;]*m/g, "").length)
    );

    const lines = [
        center(title, contentWidth),
        "",
        `Latest version: ${chalk.green(newest)}`,
        `Your version:   ${chalk.red(pkgVersion)}`,
        "",
        chalk.cyan("Run: ") + chalk.bold.blueBright("npm install -g peely@latest"),
    ];

    box(lines, { color: chalk.yellow });
};

module.exports = { checkUpdate };