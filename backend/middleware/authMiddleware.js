const jwt = require('jsonwebtoken');

// Middleware to verify JWT tokens
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization');

  // Check if the token exists
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // Verify the token and decode the payload
    const decoded = jwt.verify(token, 'JPHSab@1234'); // Replace with your secret key

    // Attach the decoded payload to the request object
    req.user = decoded;

    // Move to the next middleware or route handler
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

module.exports = verifyToken;
