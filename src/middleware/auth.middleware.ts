import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No token.",
      });
    }

    const payload = verifyToken(token);

    if (!payload?.nim) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Invalid token payload",
      });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.nim, payload.nim))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Invalid token.",
      });
    }

    (req as any).user = user;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
}
