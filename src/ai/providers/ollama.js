const ollama = require("ollama").default;
const config = require("../../utils/config");


const chat = async (messages, options = {}) => {
  const { maxTokens = 2048, temperature = 0.7, stream = false } = options;
    try {
        const response = await ollama.chat({
            model: (config.get("ai.model") || "ollama:undefined").replace("ollama:", ""),
            messages,
            stream,
            options: { num_predict: maxTokens, temperature },
        });
        // Normalize: ollama returns { message: { role, content } }
        // but ai/index.js expects { content: "..." } at the top level
        return {
            ...response,
            content: response.message?.content || "",
        };
    } catch (error) {
        console.error("Ollama chat error:", error);
        throw error;
    }
};

const models = async () => {
    try {
        const response = await ollama.list();
        return (response.models || []).map(m => ({id: m.model, name: m.name}));
    } catch (error) {
        console.error("Ollama list models error:", error);
        throw error;
    };
};

module.exports = { chat, models };