import { createUser, deleteUser, getAllUsers, getCurrentUser, loginUser } from "@/controllers/users";
import { authenticateToken } from "@/utils/auth";
import express from "express";
const userRouter = express.Router();

userRouter.post("/register", createUser);
userRouter.post("/login", loginUser);
userRouter.get("/users", getAllUsers);
userRouter.get("/users/:id", deleteUser);
userRouter.get("/me", authenticateToken, getCurrentUser);

// schoolRouter.get("/customers/:id", getCustomerById);
// schoolRouter.get("/api/v2/customers", getV2Customers);

export default userRouter;

