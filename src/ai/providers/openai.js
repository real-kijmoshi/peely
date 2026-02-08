const openai = require("openai").default;
const { intro, text, note, isCancel } = require("@clack/prompts");
const config = require("../../utils/config");
const chalk = require("chalk");

const authorize = async () => {
    intro("OpenAI initialization");

    note("To use OpenAI, you need to provide an API key.\nGet one from https://platform.openai.com/account/api-keys");
    const apiKey = await text({ message: "Enter your OpenAI API key:", placeholder: "sk-..." });
    if (isCancel(apiKey) || !apiKey) {
        throw new Error("API key is required for OpenAI");
    }

    config.set("ai.openaiKey", apiKey.trim());
    console.log(chalk.green("  ✓ OpenAI API key saved!"));
};

const getApiKey = () => config.get("ai.openaiKey");
    
const initialize = async () => {
    if (!getApiKey()) {
        await authorize();
    }
}
    

const chat = async (messages, options = {}) => {
  const { maxTokens = 2048, temperature = 0.7, stream = false } = options;

  const apiKey = getApiKey();

  const client = new openai.OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: config.get("ai.model").replace("openai:", ""),
    messages,
    max_completion_tokens: maxTokens,
    temperature,
    stream,
  });


    if (stream) {
        const streamData = [];
        for await (const part of completion) {
            streamData.push(part.choices[0].delta);
        }
        return {
            content: streamData.map(p => p.content || "").join(""),
            role: streamData.find(p => p.role)?.role || "assistant",
        };
    } else {
        return {
            content: completion.choices[0].message.content,
            role: completion.choices[0].message.role,
        };
    }
}

const models = async () => {
  const apiKey = getApiKey();
    try {
        const openaiClient = new openai.OpenAI({ apiKey });
        const response = await openaiClient.models.list();
        return (response.data || []).map(m => ({id: m.id, name: m.id}));
    }
    catch (err) {
        //mock response if no API key or error occurs
        return [
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "gpt-4.1", name: "GPT-4.1" },
            { id: "gpt-5-mini", name: "GPT-5 mini" },
        ];
    }
};


module.exports = {
  chat,
  initialize,
  models,
};