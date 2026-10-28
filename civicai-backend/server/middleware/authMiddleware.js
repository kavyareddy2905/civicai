const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify JWT and attach user to request.
 * Expects: Authorization: Bearer <token>
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authorized – no token' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'civicai_dev_secret');

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized – invalid or expired token',
      error: error.message,
    });
  }
};

/**
 * Restrict route to one or more roles.
 * Usage: authorize('Officer', 'Inspector')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user?.role || 'unknown'}' is not allowed to access this resource`,
    });
  }
  next();
};

module.exports = { protect, authorize };
