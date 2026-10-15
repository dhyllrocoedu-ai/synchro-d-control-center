'use client';

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import { useResetPassword } from '@/hooks/useApi';
import { logoUrl } from '@/lib/assets';
import { extractRecoveryParams, type RecoveryParams } from '@/lib/recovery';
import { toast } from 'react-hot-toast';

export function ResetPassword() {
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState<RecoveryParams>(() =>
    extractRecoveryParams(window.location.href)
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const resetPassword = useResetPassword();

  useEffect(() => {
    const unsubscribe = window.electronAPI?.auth?.onDeepLink?.((url) => {
      const parsed = extractRecoveryParams(url);
      if (parsed.accessToken || parsed.token) {
        setRecovery(parsed);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const hasToken = !!(recovery.accessToken || recovery.token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      await resetPassword.mutateAsync({
        accessToken: recovery.accessToken,
        token: recovery.token,
        newPassword: password,
      });
      toast.success('Password updated successfully');
      setDone(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
            <img src={logoUrl} alt="Synchro-D" className="h-9 w-auto object-contain" />
          </div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25"
          >
            {hasToken ? (
              <Lock className="w-8 h-8 text-white" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-white" />
            )}
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Set a new password
          </h1>
          <p className="text-muted-foreground mt-2">Choose a strong password for your account</p>
        </div>

        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg border bg-card p-6 text-center space-y-3"
          >
            <CheckCircle className="w-10 h-10 mx-auto text-primary" />
            <p className="font-medium">Password updated</p>
            <p className="text-sm text-muted-foreground">
              Your password has been reset. You can now sign in with your new password.
            </p>
            <Button className="w-full mt-2" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </motion.div>
        ) : !hasToken ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg border bg-card p-6 text-center space-y-3"
          >
            <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
            <p className="font-medium">Invalid or missing reset link</p>
            <p className="text-sm text-muted-foreground">
              This link may have expired or already been used. Please request a new one.
            </p>
            <Button asChild className="w-full mt-2">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                New Password
              </Label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M7 9v10" />
                  <path d="M17 9v10" />
                </svg>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="•••••••• (min 8 chars)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={resetPassword.isPending}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm Password
              </Label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M7 9v10" />
                  <path d="M17 9v10" />
                </svg>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  disabled={resetPassword.isPending}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full py-3" disabled={resetPassword.isPending} size="lg">
              {resetPassword.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
