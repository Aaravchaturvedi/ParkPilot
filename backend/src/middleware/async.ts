import type { Request, Response, NextFunction } from 'express';

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function ah(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

export function coded(status: number, code: string): Error & { status: number } {
  return Object.assign(new Error(code), { status });
}
