import React, { createContext, useContext, useMemo, useState } from "react";
import type { AuthStatus, AuthUser } from "../types";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  signIn(): Promise<void>;
  signOut(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("anonymous");
  const [user, setUser] = useState<AuthUser | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async signIn() {
        setStatus("anonymous");
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        setUser({
          name: "Admin User",
          email: "admin@nwmiws.local",
          role: "admin",
          tenantName: "NWMIWS",
        });
        setStatus("authenticated");
      },
      signOut() {
        setUser(null);
        setStatus("anonymous");
      },
    }),
    [status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
