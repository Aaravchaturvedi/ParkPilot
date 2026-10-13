// Shared authed-user shape on every Express request.
// requireAuth guarantees it on protected routes; public routes simply
// never read req.user.
declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      role: string;
    }
    interface Request {
      user: AuthUser;
    }
  }
}

export {};
