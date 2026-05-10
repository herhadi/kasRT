'use client';

import { useEffect } from 'react';
import ToastStack from '@/components/ui/ToastStack';
import useToast from '@/lib/hooks/useToast';

type FeedbackToastProps = {
  error?: string;
  message?: string;
};

export default function FeedbackToast({ error = '', message = '' }: FeedbackToastProps) {
  const { toasts, pushToast } = useToast();

  useEffect(() => {
    if (error) pushToast(error, 'error');
  }, [error, pushToast]);

  useEffect(() => {
    if (message) pushToast(message, 'success');
  }, [message, pushToast]);

  return <ToastStack toasts={toasts} />;
}
