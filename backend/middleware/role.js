export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];

    const allowed = userRoles.some(r => allowedRoles.includes(r));

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }

    next();
  };
}