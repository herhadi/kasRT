export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    const roleAliases = {
      'ketua': ['plt ketua']
    };

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
    const expandedAllowed = new Set(normalizedAllowed);
    normalizedAllowed.forEach((role) => {
      const aliases = roleAliases[role] || [];
      aliases.forEach((alias) => expandedAllowed.add(alias));
    });

    const allowed = userRoles.includes('root') || userRoles.some((r) => expandedAllowed.has(r));

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak'
      });
    }

    next();
  };
}
