class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.name = 'HttpError';
    this.status = status;
    this.detail = detail;
  }
}

const badRequest = (message) => new HttpError(400, message);
const notFound = (message) => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

module.exports = { HttpError, badRequest, notFound, conflict };
