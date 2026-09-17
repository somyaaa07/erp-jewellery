// middlewares/errorHandler.js
// Centralised error handler - keep controllers thin by calling next(err)
// instead of writing try/catch res.status(500) blocks everywhere.

const errorHandler = (err, req, res, next) => {
  console.error(err);

  if (err.name === 'MulterError' || err.message?.includes('images are allowed')) {
    return res.status(400).json({ error: err.message });
  }

  if (
    err.name === "SequelizeValidationError" ||
    err.name === "SequelizeUniqueConstraintError"
  ) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.errors?.map((e) => e.message) || [err.message],
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  return res.status(500).json({
    error: "Internal server error",
  });
};

// Helper class
// throw new AppError("Discount exceeds making charges", 400);

export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export default errorHandler;