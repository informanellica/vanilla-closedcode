export default {
  process(src) {
    return {
      code: `module.exports = ${JSON.stringify(src)}; module.exports.default = module.exports;`,
    };
  },
};
