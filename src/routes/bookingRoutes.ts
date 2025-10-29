import express from "express";
import { releaseSpots } from "@/controllers/releaseSpots";

const releaseRouter = express.Router();

releaseRouter.post("/release-spots", releaseSpots);

export default releaseRouter;
