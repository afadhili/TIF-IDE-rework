import { Request, Response, NextFunction } from "express";

export function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden",
    });
  }

  (req as any).user = user;
  next();
}
