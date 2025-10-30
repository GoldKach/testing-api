// src/routes/user-portfolio.ts

import { createUserPortfolio, deleteUserPortfolio, getUserPortfolioById, listUserPortfolios, recomputeUserPortfolio, updateUserPortfolio } from "@/controllers/userportfolios";
import { Router } from "express";


const userPortfolioRouter = Router();

userPortfolioRouter.get("/user-portfolios", listUserPortfolios);
userPortfolioRouter.get("/user-portfolios/:id", getUserPortfolioById);
userPortfolioRouter.post("/user-portfolios", createUserPortfolio);
userPortfolioRouter.patch("/user-portfolios/:id", updateUserPortfolio);
userPortfolioRouter.post("/user-portfolios/:id/recompute", recomputeUserPortfolio);
userPortfolioRouter.delete("/user-portfolios/:id", deleteUserPortfolio);

export default userPortfolioRouter;
