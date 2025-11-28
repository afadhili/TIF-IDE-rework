import { Router, Request, Response } from "express";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { generateToken } from "../lib/jwt";
import { authMiddleware } from "../middleware/auth.middleware";
import { compare, hash } from "bcrypt";
import { createActivity } from "../services/users.service";

const router = Router();

router.post("/signin", async (req: Request, res: Response) => {
  try {
    const { nim, password } = req.body;

    if (typeof nim !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.nim, nim),
      with: {
        contributors: true,
      },
    });

    if (user) {
      const isSamePassword = await compare(password, user.password);

      if (isSamePassword === true) {
        const token = generateToken({
          id: user.id,
          nim: user.nim,
          name: user.name,
        });

        await createActivity({
          userId: user.id,
          type: "login",
          description: "User logged in",
          details: JSON.stringify({
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          }),
        });

        return res.json({
          success: true,
          message: "User Exists",
          token,
          user: {
            id: user.id,
            nim: user.nim,
            name: user.name,
            role: user.role,
            contributors: user.contributors,
          },
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: "Invalid NIM or Password",
    });
  } catch (error) {
    console.error("signin error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { nim, name, password } = req.body;

    if (
      typeof nim !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const isUserExists = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.nim, nim))
      .limit(1);

    if (isUserExists.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const encryptedPassword = await hash(password, 10);

    const [user] = await db
      .insert(usersTable)
      .values({ nim, name, password: encryptedPassword })
      .returning();

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Failed to create user",
      });
    }

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        nim: user.nim,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.post("/logout", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  await createActivity({
    userId: user.id,
    type: "logout",
    description: "User logged out",
    details: JSON.stringify({
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    }),
  });

  return res.json({
    success: true,
    message: "User logged out successfully",
  });
});

router.post(
  "/activity",
  authMiddleware,
  async (req: Request, res: Response) => {
    const activity = (req as any).user;
    await createActivity(activity);

    return res.json({
      success: true,
      message: "Activity logged successfully",
    });
  },
);

router.all("/verify", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({
    success: true,
    user,
  });
});

router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({
    success: true,
    user,
  });
});

export default router;
