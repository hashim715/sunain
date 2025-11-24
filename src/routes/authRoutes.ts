import express from "express";
import { Router } from "express";
import {
  googleAuth,
  googleredirectauth,
  getUser,
  logOut,
  refreshToken,
} from "../controllers/authentication";

export const authRouter: Router = express.Router();

authRouter.route("/google").get(googleAuth);
authRouter.route("/google/callback").post(googleredirectauth);
authRouter.route("/me").get(getUser);
authRouter.route("/logout").get(logOut);
authRouter.route("/refresh").post(refreshToken);
