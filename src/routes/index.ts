import { Router, Request, Response } from "express";
import roomsRouter from "./rooms.route";
import usersRouter from "./users.route";
import adminRouter from "./admin.route";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";

const router = Router();

router.use("/rooms", authMiddleware, roomsRouter);
router.use("/users", usersRouter);
router.use("/admin", authMiddleware);
router.use("/admin", adminMiddleware, adminRouter);

export default router;
