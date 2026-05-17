import { hc } from 'hono/client';

import type { AppType } from './index';

export const client = (baseUrl: string) => hc<AppType>(baseUrl);
export type { AppType };
