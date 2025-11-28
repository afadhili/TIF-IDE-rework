import { Router, Request, Response } from "express";
import {
  createUser,
  deleteUserById,
  getActivities,
  getUserById,
  getUsers,
  updateUserById,
} from "../services/users.service";

const router = Router();

// GET /api/admin/users
router.get("/users", async (_req: Request, res: Response) => {
  const users = await getUsers();
  if (!users) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
  return res.json(users);
});

// GET /api/admin/users/:id
router.get("/users/:id", async (req: Request, res: Response) => {
  const user = await getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(user);
});

// POST /api/admin/users
router.post("/users", async (req: Request, res: Response) => {
  const user = await createUser(req.body);
  if (!user) {
    return res.status(500).json({ error: "Failed to create user" });
  }
  return res.json(user);
});

// PUT /api/admin/users/:id
router.put("/users/:id", async (req: Request, res: Response) => {
  const user = await updateUserById(req.params.id, req.body);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(user);
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await deleteUserById(id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(user);
});

// GET /api/admin/activities
router.get("/activities", async (_req: Request, res: Response) => {
  const activities = await getActivities();
  if (!activities) {
    return res.status(500).json({ error: "Failed to fetch activities" });
  }
  return res.json(activities);
});

export default router;
