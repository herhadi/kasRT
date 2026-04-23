'use client';

import { useContext } from 'react';
import { AuthContext } from '@/components/providers/AuthProvider';

export function useAuth() {
  return useContext(AuthContext);
}
