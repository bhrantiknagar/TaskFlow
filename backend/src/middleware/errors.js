function notFound(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map(item => item.message);
    return res.status(400).json({ error: 'Please check the submitted information.', details });
  }
  if (error.name === 'MongoServerError' && error.code === 11000) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { notFound, errorHandler };
