// ---------------------------------------------------------------------------
// Firebase-backed auth context. Replaces Clerk's <ClerkProvider> + useUser() +
// useClerk(). Also registers the Firebase ID token getter with the generated
// API client (@workspace/api-client-react) so every request made through
// useConnectUser / useListPosts / useGetUserStats / useEnrichProduct etc.
// automatically carries an `Authorization: Bearer <idToken>` header — Clerk
// used cookies for this automatically, Firebase does not, so this step is
// required.
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { auth, onAuthStateChanged, signOutUser, type User } from "./firebase";

interface AuthContextValue {
  user: User | null;
  isLoaded: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      const current = auth.currentUser;
      return current ? current.getIdToken() : null;
    });

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoaded(true);
    });

    return () => {
      unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoaded, signOut: signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
