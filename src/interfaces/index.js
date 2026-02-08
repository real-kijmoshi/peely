// Built-in interfaces (lazy-loaded to avoid side effects on require)
module.exports = {
  get terminal() {
    return require("./terminal");
  },
  get discord() {
    return require("./discord");
  },
};