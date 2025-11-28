import "dotenv/config";
import { hash } from "bcrypt";
import db from ".";
import { User } from "../sockets/rooms.sockets";
import { usersTable } from "./schema";

const users = [
  {
    name: "John Doe",
    nim: "240602010",
    password: "password123",
    role: "user",
  },
  {
    name: "Jane Doe",
    nim: "2406020027",
    password: "password456",
    role: "user",
  },
  {
    name: "oLLa 2",
    nim: "240602020",
    password: "admin123",
    role: "user",
  },
] satisfies readonly Partial<User>[];

(async () => {
  for (const user of users) {
    console.log(user);
    await db
      .insert(usersTable)
      .values({
        name: user.name,
        nim: user.nim,
        password: await hash(user.password, 10),
        role: user.role,
      })
      .execute();
  }

  console.log("Users seeded successfully");
})();
