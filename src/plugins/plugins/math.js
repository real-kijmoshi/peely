const add = (a, b) => a + b;
const subtract = (a, b) => a - b;
const multiply = (a, b) => a * b;
const divide = (a, b) => {
  if (b === 0) return "Error: division by zero";
  return a / b;
};

module.exports = {
  name: "math",
  description: "Provides basic math operations",
  usage: "add(a,b), subtract(a,b), multiply(a,b), divide(a,b)",
  tools: {
    add: {
      description: "Adds two numbers",
      arguments: [
        { name: "a", type: "number", description: "The first number" },
        { name: "b", type: "number", description: "The second number" },
      ],
      fn: add,
    },
    subtract: {
      description: "Subtracts the second number from the first",
      arguments: [
        { name: "a", type: "number", description: "The first number" },
        { name: "b", type: "number", description: "The second number" },
      ],
      fn: subtract,
    },
    multiply: {
      description: "Multiplies two numbers",
      arguments: [
        { name: "a", type: "number", description: "The first number" },
        { name: "b", type: "number", description: "The second number" },
      ],
      fn: multiply,
    },
    divide: {
      description: "Divides the first number by the second",
      arguments: [
        { name: "a", type: "number", description: "The first number" },
        { name: "b", type: "number", description: "The second number" },
      ],
      fn: divide,
    },
  }
};