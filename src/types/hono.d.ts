import 'hono';
import type { Session, User } from '../auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null;
    session: Session | null;
  }
}
