import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, loadToken, Me, saveToken } from "../api";

export interface AuthContextValue {
  token: string | null;
  me: Me | null;
  loading: boolean;
  can: (permissionCode: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refreshMe = useCallback(async () => {
    try {
      const user = await api.me();
      setMe(user);
    } catch {
      saveToken(null);
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      const currentToken = loadToken();
      if (!currentToken) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const user = await api.me();
        if (mounted) {
          setMe(user);
        }
      } catch {
        if (mounted) {
          saveToken(null);
          setToken(null);
          setMe(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initAuth();
    return () => {
      mounted = false;
    };
  }, [token]);

  const can = useCallback(
    (permissionCode: string): boolean => {
      if (!me || !me.permissions) return false;
      return me.permissions.includes(permissionCode);
    },
    [me],
  );

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    saveToken(res.access_token);
    setToken(res.access_token);
    const user = await api.me();
    setMe(user);
  };

  const logout = useCallback(() => {
    saveToken(null);
    setToken(null);
    setMe(null);
    navigate("/login");
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ token, me, loading, can, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ProtectedRoute() {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "50%", margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Authenticating session…</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
