// @ts-check
import { botRoutes } from './routes-bot.mjs';
import { chatRoute } from './routes-chat.mjs';
import { fixesRoutes } from './routes-fixes.mjs';

export function actionRoutes(app) {
  botRoutes(app);
  chatRoute(app);
  fixesRoutes(app);
}
