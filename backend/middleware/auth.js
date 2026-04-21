import jwt from 'jsonwebtoken';

export function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function validateRequiredFields(fields) {
  return (req, res, next) => {
    const missingFields = fields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    next();
  };
}

export function auth(req, res, next) {
  const header = req.headers.authorization;
  const debug = process.env.DEBUG_JIMPITAN === 'true';

  if (debug) {
    console.log('[AUTH] request', {
      method: req.method,
      path: req.path,
      hasAuthHeader: Boolean(header)
    });
  }

  if (!header) {
    if (debug) console.log('[AUTH] reject: no token');
    return res.status(401).json({ success: false, message: 'No token' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (debug) {
      console.log('[AUTH] ok', {
        user_id: decoded.user_id,
        roles: decoded.roles
      });
    }

    next();
  } catch (err) {
    if (debug) console.log('[AUTH] reject: invalid token', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}
