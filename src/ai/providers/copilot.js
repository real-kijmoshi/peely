const config = require("../../utils/config");
const axios = require("axios");
const { intro, note, spinner } = require("@clack/prompts");
const chalk = require("chalk");

const CLIENT_ID = "Iv1.b507a08c87ecfe98"; // Copilot client ID
const SCOPE = "read:user user:email";

const authorize = async () => {
  // Step 1: Request device code
  const res = await axios.post(
    "https://github.com/login/device/code",
    { client_id: CLIENT_ID, scope: SCOPE },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );

  const { device_code, user_code, verification_uri, interval } = res.data;

  intro("GitHub Copilot Authorization");
  note(
    `Visit: ${chalk.underline(verification_uri)}\nCode: ${chalk.green.bold(user_code)}`,
  );

  const s = spinner();
  s.start("Waiting for authorization...");

  let pollInterval = interval * 1000;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    try {
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: CLIENT_ID,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      const { access_token, error } = tokenRes.data;

      if (access_token) {
        config.set("github.token", access_token);
        s.stop("✅ Authorized successfully!");
        break;
      }

      if (error === "authorization_pending") {
        continue; // keep polling
      } else if (error === "slow_down") {
        pollInterval += 5000; // increase interval
      } else {
        s.stop(`❌ Authorization failed: ${error}`);
        return;
      }
    } catch (err) {
      s.stop(`❌ Error during authorization: ${err.message}`);
      return;
    }
  }

  // Step 2: Get Copilot token
  const s2 = spinner();
  s2.start("Accessing copilot token...");

  try {
    const res2 = await axios.get(
      "https://api.github.com/copilot_internal/v2/token",
      {
        headers: {
          Authorization: `token ${config.get("github.token")}`,
          "User-Agent": "GithubCopilot/1.155.0",
          Accept: "application/json",
        },
      },
    );

    const { token, expires_at } = res2.data;
    config.set("copilot.token", token);
    config.set("copilot.expiresAt", expires_at);
    s2.stop("You now have access to GitHub Copilot! 🎉");
  } catch (err) {
    s2.stop(`❌ Error getting Copilot token: ${err.message}`);
    throw err;
  }
};

const getToken = () => config.get("github.token");
const getCopilotToken = () => config.get("copilot.token");
const getTokenExpiry = () => config.get("copilot.expiresAt");

const ensureValidCopilotToken = async () => {
  const copilotToken = getCopilotToken();
  const expiresAt = getTokenExpiry();

  // Check if token exists and is not expired (with 60 second safety margin)
  if (!copilotToken || !expiresAt || Date.now() > expiresAt * 1000 - 60000) {
    console.log(chalk.dim("  Refreshing Copilot token..."));

    try {
      const res = await axios.get(
        "https://api.github.com/copilot_internal/v2/token",
        {
          headers: {
            Authorization: `token ${getToken()}`,
            "User-Agent": "GithubCopilot/1.155.0",
            Accept: "application/json",
          },
        },
      );

      const { token, expires_at } = res.data;
      config.set("copilot.token", token);
      config.set("copilot.expiresAt", expires_at);
      console.log(chalk.dim("  ✅ Copilot token refreshed"));
      return token;
    } catch (err) {
      console.error(chalk.red(`  ❌ Error refreshing token: ${err.message}`));
      throw err;
    }
  }

  return copilotToken;
};

/**
 * Send a chat message to GitHub Copilot
 * @param {Array|string} messages - Either an array of message objects [{role, content}] or a string
 * @param {Object} options - Optional parameters (maxTokens, temperature, stream)
 * @returns {Object} Parsed response with message content and metadata
 */
const chat = async (messages, options = {}) => {
  const githubToken = getToken();
  if (!githubToken)
    throw new Error("Copilot not authorized. Please run initialize() first.");

  // Ensure we have a valid Copilot token
  const copilotToken = await ensureValidCopilotToken();

  // Normalize messages to array format
  const messageArray = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: messages }];

  const requestData = {
    messages: messageArray,
    max_tokens: options.maxTokens || 1000,
    temperature: options.temperature || 0.3,
    stream: options.stream || false,
  };

  try {
    const res = await axios.post(
      "https://api.githubcopilot.com/chat/completions",
      requestData,
      {
        headers: {
          Authorization: `Bearer ${copilotToken}`,
          "Copilot-Integration-Id": "vscode-chat",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      },
    );

    // Parse and return the response in a clean format
    const data = res.data;
    return {
      content: data.choices[0].message.content,
      role: data.choices[0].message.role,
      finishReason: data.choices[0].finish_reason,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      id: data.id,
      // Include raw response for advanced use cases
      raw: data,
    };
  } catch (err) {
    // If token expired, try refreshing once
    if (err.response?.status === 401) {
      config.set("copilot.token", null); // Clear invalid token
      const newToken = await ensureValidCopilotToken();

      // Retry request with new token
      const retryRes = await axios.post(
        "https://api.githubcopilot.com/chat/completions",
        requestData,
        {
          headers: {
            Authorization: `Bearer ${newToken}`,
            "Copilot-Integration-Id": "vscode-chat",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      const data = retryRes.data;
      return {
        content: data.choices[0].message.content,
        role: data.choices[0].message.role,
        finishReason: data.choices[0].finish_reason,
        model: data.model,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        id: data.id,
        raw: data,
      };
    }

    throw err;
  }
};

/**
 * Get list of available Copilot models
 * @returns {Array} List of available models
 */
const models = async () => {
  const githubToken = getToken();
  if (!githubToken) {
    return [
      {
        id: "gpt-4o",
        name: "GPT-4o",
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 mini",
      },
    ];
  }

  const copilotToken = await ensureValidCopilotToken();

  try {
    const res = await axios.get("https://api.githubcopilot.com/models", {
      headers: {
        Authorization: `Bearer ${copilotToken}`,
        "Copilot-Integration-Id": "vscode-chat",
      },
    });

    const data = res.data;
    // API may return an array directly, or { data: [...] }, or { models: [...] }
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    return list.map((m) => ({
      id: m.id || m.name,
      name: m.name || m.id || "unknown",
    }));
  } catch (err) {
    throw new Error(`Error getting models: ${err.message}`);
  }
};

/**
 * Initialize the Copilot client
 * Authorizes with GitHub if not already authorized
 * @returns {Promise<void>}
 */
const initialize = async () => {
  if (!getToken()) {
    await authorize();
  } else {
    // Ensure Copilot token is valid even if GitHub token exists
    await ensureValidCopilotToken();
  }
};

// Export only the public API
module.exports = {
  initialize,
  chat,
  models,
};
