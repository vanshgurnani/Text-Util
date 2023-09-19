const jwt = require('jsonwebtoken');

const authenticateUser = (req, res, next) => {
  // Get the JWT token from the request headers
  const token = req.header('Authorization');

  // Check if the token is missing
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    // Verify the token with your secret key
    const decodedToken = jwt.verify(token, 'your-secret-key');

    // Attach the decoded token to the request object
    req.user = decodedToken;

    // Continue with the next middleware or route handler
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = authenticateUser;
