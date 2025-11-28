import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export async function adminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No token provided",
      });
    }

    const token = authHeader.substring(7);
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
        message: "Unauthorized - Invalid token",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden - Insufficient privileges",
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
