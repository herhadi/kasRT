export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    const rawRoles = req.user?.roles;
    const roleList = Array.isArray(rawRoles)
      ? rawRoles
      : rawRoles
        ? [rawRoles]
        : req.user?.role
          ? [req.user.role]
          : req.user?.role_name
            ? [req.user.role_name]
            : [];
    const userRoles = roleList.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean);
    const normalizedAllowed = allowedRoles
      .map((r) => String(r || '').trim().toLowerCase())
      .filter(Boolean);

    const allowed = userRoles.some((r) => normalizedAllowed.includes(r));

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }

    next();
  };
}
