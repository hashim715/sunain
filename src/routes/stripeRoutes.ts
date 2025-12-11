import express from "express";
import { Router } from "express";
import {
  createConnectAccount,
  checkAccountStatus,
  refreshOnBoardingLink,
  getDashboardLink,
} from "../controllers/stripeControllers";
import { protect } from "../middleware/middleware";

export const stripeRouter: Router = express.Router();

stripeRouter.route("/connect/onboard").get(protect, createConnectAccount);
stripeRouter.route("/connect/status").get(protect, checkAccountStatus);
stripeRouter.route("/connect/refresh-link").get(protect, refreshOnBoardingLink);
stripeRouter.route("/connect/dashboard").get(protect, getDashboardLink);
