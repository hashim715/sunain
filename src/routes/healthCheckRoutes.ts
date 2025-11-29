import express from "express";
import { Router } from "express";
import { healthChecker } from "../controllers/healthChecker";

export const healthCheckRouter: Router = express.Router();

healthCheckRouter.route("/").get(healthChecker);
