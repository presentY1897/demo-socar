import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** 모든 프론트 테스트가 공유하는 목 서버. 테스트별 오버라이드는 `server.use(...)` */
export const server = setupServer(...handlers);
