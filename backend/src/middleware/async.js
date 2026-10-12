// Shared async wrapper + coded errors (err.status respected by index.js handler).
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function coded(status, code) {
  return Object.assign(new Error(code), { status });
}

module.exports = { ah, coded };
