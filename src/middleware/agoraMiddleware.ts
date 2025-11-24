import { Request, Response, NextFunction, RequestHandler } from "express";

export const agoraMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.header("Expires", "-1");
  res.header("Pragma", "no-cache");
  next();
};
