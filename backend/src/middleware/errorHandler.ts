import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'SERVER_ERROR';

  // Log detailed server-side; never expose to client
  console.error({ message: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined, code, status });

  res.status(status >= 500 ? 500 : status).json({
    success: false,
    error: {
      code,
      message: err.message || 'Internal server error',
      details: err.details || undefined,
    },
  });
}
