import "dotenv/config";
import db from ".";
import { usersTable } from "./schema";
import { hash } from "bcrypt";

(async function main() {
  try {
    const adminNim = process.env.ADMIN as string;
    const adminPassword = process.env.ADMIN_PASSWORD as string;
    const adminName = process.env.ADMIN_NAME as string;
    const encodedPassword = await hash(adminPassword, 10);

    await db.insert(usersTable).values({
      name: adminName,
      nim: adminNim,
      password: encodedPassword,
      role: "admin",
    });

    console.log("Admin created successfully");
  } catch (error) {
    console.error(
      "Failed to create admin:",
      "Ensure that the ADMIN and ADMIN_PASSWORD environment variables are set. Or Admin already exists.",
    );
    console.log("run `bun db:reset` if you want to reset the database");
  }
})();
