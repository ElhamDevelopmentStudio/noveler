import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, UpdateProfileDto } from "@novelova/shared-types";
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  updateCurrentUser,
  type LoginParams,
} from "@/services/auth";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (params: LoginParams) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
  updateUser: (data: UpdateProfileDto) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return null;
    }

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      logoutUser();
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (params: LoginParams): Promise<User> => {
      const response = await loginUser(params);
      setUser(response.user);
      return response.user;
    },
    [],
  );

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
  }, []);

  const updateUser = useCallback(
    async (data: UpdateProfileDto): Promise<User> => {
      const updated = await updateCurrentUser(data);
      setUser(updated);
      return updated;
    },
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
