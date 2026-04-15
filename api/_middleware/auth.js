// api/_middleware/auth.js
// Shared JWT verification helper used by protected API routes

const jwt = require('jsonwebtoken');

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (e) {
    return { valid: false, error: 'Invalid or expired token' };
  }
}

module.exports = { verifyToken };
