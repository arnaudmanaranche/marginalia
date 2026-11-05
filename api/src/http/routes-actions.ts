import { botRoutes } from './routes-bot.ts';
import { chatRoute } from './routes-chat.ts';
import { fixesRoutes } from './routes-fixes.ts';

export function actionRoutes(app: any) {
  botRoutes(app);
  chatRoute(app);
  fixesRoutes(app);
}
