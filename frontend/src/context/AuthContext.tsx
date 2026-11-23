import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadToken, Me, saveToken } from "../api";

type AuthContextType = {
  me: Me | null;
  token: string | null;
  loading: boolean;
  error: string;
  can: (permissionCode: string) => boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  async function loadUser() {
    if (!token) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const user = await api.me();
      setMe(user);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
      saveToken(null);
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, [token]);

  const can = (permissionCode: string): boolean => {
    if (!me) return false;
    return me.permissions.includes(permissionCode);
  };

  const login = async (newToken: string) => {
    saveToken(newToken);
    setToken(newToken);
  };

  const logout = () => {
    saveToken(null);
    setToken(null);
    setMe(null);
  };

  return (
    <AuthContext.Provider
      value={{
        me,
        token,
        loading,
        error,
        can,
        login,
        logout,
        refreshMe: loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
