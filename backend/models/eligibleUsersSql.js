export const ELIGIBLE_USERS_CLAUSE = `
  LOWER(TRIM(COALESCE(u.nama, ''))) <> 'system'
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles urx
    JOIN roles rx ON rx.id = urx.role_id
    WHERE urx.user_id = u.id
      AND LOWER(TRIM(rx.name)) = 'root'
  )
`;

